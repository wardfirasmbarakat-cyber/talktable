// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { rateLimit, ORDER_RATE_LIMIT, getClientIp, audit, sanitizeString } from '@/lib/security'
import { emitToRestaurant } from '@/lib/socket-server'

const OrderItemSchema = z.object({
  menuItemId: z.string().cuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(500).optional(),
})

const CreateOrderSchema = z.object({
  tableToken: z.string().min(1),
  items: z.array(OrderItemSchema).min(1).max(50),
  notes: z.string().max(1000).optional(),
})

// ── POST /api/orders — place an order (no auth required for customers) ────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  // Rate limit by IP
  const rl = rateLimit(`order:${ip}`, ORDER_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many orders. Please slow down.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { tableToken, items, notes } = parsed.data

  // Resolve table
  const table = await prisma.table.findUnique({
    where: { qrToken: tableToken },
    include: { restaurant: true },
  })
  if (!table || !table.isActive) {
    return NextResponse.json({ error: 'Invalid table. Please scan the QR code again.' }, { status: 404 })
  }
  if (!table.restaurant.isActive) {
    return NextResponse.json({ error: 'Restaurant is currently closed.' }, { status: 422 })
  }

  // Validate + price all menu items in one query
  const menuItemIds = items.map(i => i.menuItemId)
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      restaurantId: table.restaurantId,
      isAvailable: true,
    },
  })

  if (menuItems.length !== menuItemIds.length) {
    const foundIds = new Set(menuItems.map(m => m.id))
    const missing = menuItemIds.filter(id => !foundIds.has(id))
    return NextResponse.json(
      { error: 'Some items are unavailable or not found.', unavailableIds: missing },
      { status: 422 }
    )
  }

  const menuItemMap = new Map(menuItems.map(m => [m.id, m]))

  // Calculate totals (always use server-side prices — never trust client prices)
  const orderItems = items.map(item => {
    const menuItem = menuItemMap.get(item.menuItemId)!
    const price = Number(menuItem.price)
    return {
      menuItemId: item.menuItemId,
      name: menuItem.name,
      price: menuItem.price,
      quantity: item.quantity,
      notes: item.notes ? sanitizeString(item.notes) : null,
      subtotal: price * item.quantity,
    }
  })

  const subtotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0)
  const total = subtotal // tax/fees can be added here

  // Auto-increment order number per restaurant
  const lastOrder = await prisma.order.findFirst({
    where: { restaurantId: table.restaurantId },
    orderBy: { orderNumber: 'desc' },
  })
  const orderNumber = (lastOrder?.orderNumber ?? 0) + 1

  // Create order in transaction
  const order = await prisma.$transaction(async tx => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        restaurantId: table.restaurantId,
        tableId: table.id,
        status: 'PENDING',
        subtotal,
        total,
        notes: notes ? sanitizeString(notes) : null,
        items: {
          create: orderItems,
        },
        statusHistory: {
          create: { status: 'PENDING', note: 'Order placed by customer' },
        },
      },
      include: {
        items: { include: { menuItem: { select: { name: true, emoji: true } } } },
        table: { select: { number: true, label: true } },
      },
    })

    // Increment QR scan counter
    await tx.table.update({
      where: { id: table.id },
      data: { qrScans: { increment: 1 } },
    })

    return created
  })

  // Audit
  await audit({
    action: 'ORDER_CREATED',
    restaurantId: table.restaurantId,
    resource: `order:${order.id}`,
    ipAddress: ip,
    metadata: { orderNumber, tableNumber: table.number, total, itemCount: items.length },
  })

  // Real-time: notify kitchen + waiter dashboards
  try {
    emitToRestaurant(table.restaurantId, 'order:new', {
      id: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
      tableLabel: order.table.label,
      status: order.status,
      total: order.total,
      items: order.items.map(i => ({
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
        emoji: i.menuItem.emoji,
      })),
      notes: order.notes,
      placedAt: order.placedAt,
    })
  } catch (err) {
    console.error('[Socket] Failed to emit order:new', err)
    // Non-fatal — order is already saved to DB
  }

  return NextResponse.json(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      status: order.status,
      message: 'Order placed successfully! The kitchen has been notified.',
    },
    { status: 201 }
  )
}

// ── GET /api/orders — list orders (authenticated staff only) ──────────────────
export async function GET(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const tableId = searchParams.get('tableId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const where: Record<string, unknown> = { restaurantId: payload.restaurantId }
  if (status) where.status = status
  if (tableId) where.tableId = tableId

  const orders = await prisma.order.findMany({
    where,
    orderBy: { placedAt: 'desc' },
    take: limit,
    include: {
      items: { include: { menuItem: { select: { name: true, emoji: true } } } },
      table: { select: { number: true, label: true } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  })

  return NextResponse.json({ orders })
}
