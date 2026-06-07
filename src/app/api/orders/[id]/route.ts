// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { audit } from '@/lib/security'
import { emitToRestaurant } from '@/lib/socket-server'
import type { OrderStatus } from '@prisma/client'

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING:    ['ACCEPTED', 'CANCELLED'],
  ACCEPTED:   ['PREPARING', 'CANCELLED'],
  PREPARING:  ['READY', 'CANCELLED'],
  READY:      ['SERVED'],
  SERVED:     ['COMPLETED'],
  COMPLETED:  [],
  CANCELLED:  [],
}

const ROLE_STATUS_PERMISSIONS: Record<string, OrderStatus[]> = {
  KITCHEN: ['ACCEPTED', 'PREPARING', 'READY'],
  WAITER:  ['SERVED', 'COMPLETED'],
  MANAGER: ['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'],
  OWNER:   ['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'],
  ADMIN:   ['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'],
}

const UpdateSchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']),
  note: z.string().max(500).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { status: newStatus, note } = parsed.data

  // Check role permission for this status
  const allowed = ROLE_STATUS_PERMISSIONS[payload.role] ?? []
  if (!allowed.includes(newStatus as OrderStatus)) {
    return NextResponse.json({ error: 'Your role cannot set this status.' }, { status: 403 })
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { table: true },
  })

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate state machine
  const validTransitions = STATUS_TRANSITIONS[order.status] ?? []
  if (!validTransitions.includes(newStatus as OrderStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${order.status} to ${newStatus}.` },
      { status: 422 }
    )
  }

  // Build timestamp fields
  const timestamps: Record<string, Date> = {}
  const now = new Date()
  if (newStatus === 'ACCEPTED')   timestamps.acceptedAt = now
  if (newStatus === 'PREPARING')  timestamps.preparingAt = now
  if (newStatus === 'READY')      timestamps.readyAt = now
  if (newStatus === 'SERVED')     timestamps.servedAt = now
  if (newStatus === 'COMPLETED')  timestamps.completedAt = now
  if (newStatus === 'CANCELLED')  timestamps.cancelledAt = now

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: newStatus as OrderStatus,
      ...timestamps,
      statusHistory: {
        create: {
          status: newStatus as OrderStatus,
          changedBy: payload.sub,
          note,
        },
      },
    },
    include: {
      table: { select: { number: true, label: true } },
      items: { select: { name: true, quantity: true } },
    },
  })

  await audit({
    action: 'ORDER_STATUS_CHANGED',
    userId: payload.sub,
    restaurantId: order.restaurantId,
    resource: `order:${order.id}`,
    metadata: { from: order.status, to: newStatus, orderNumber: order.orderNumber },
  })

  // Real-time broadcast
  try {
    const eventData = {
      id: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.status,
      tableNumber: updated.table.number,
      tableLabel: updated.table.label,
      updatedAt: now,
    }
    // Notify all dashboards
    emitToRestaurant(order.restaurantId, 'order:status', eventData)
    // When ready — notify waiter specifically
    if (newStatus === 'READY') {
      emitToRestaurant(order.restaurantId, 'order:ready', {
        ...eventData,
        message: `Table ${updated.table.number} order is ready for delivery.`,
      })
    }
  } catch (err) {
    console.error('[Socket] Failed to emit order:status', err)
  }

  return NextResponse.json({ order: updated })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // Customers can poll their own order by ID (no auth needed)
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { menuItem: { select: { name: true, emoji: true } } } },
      table: { select: { number: true, label: true } },
      statusHistory: { orderBy: { createdAt: 'asc' }, select: { status: true, createdAt: true, note: true } },
    },
  })

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Strip sensitive fields for unauthenticated requests
  const payload = await getAuthFromCookies()
  if (!payload) {
    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      statusHistory: order.statusHistory,
      placedAt: order.placedAt,
    })
  }

  return NextResponse.json({ order })
}
