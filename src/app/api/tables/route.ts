// src/app/api/tables/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { audit, sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const CreateTableSchema = z.object({
  number: z.number().int().min(1).max(9999),
  label:  z.string().max(100).optional(),
})

// ── GET /api/tables ───────────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  const tables = await prisma.table.findMany({
    where: { restaurantId },
    orderBy: { number: 'asc' },
  })

  // Fetch latest active orders for all tables in one query
  const activeOrders = await prisma.order.findMany({
    where: {
      restaurantId,
      tableId: { in: tables.map(t => t.id) },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    orderBy: { placedAt: 'desc' },
    include: {
      items: { select: { name: true, quantity: true } },
    },
  })

  // Build a map: tableId -> latest active order
  const latestOrderByTable = new Map<string, typeof activeOrders[number]>()
  for (const order of activeOrders) {
    if (!latestOrderByTable.has(order.tableId)) {
      latestOrderByTable.set(order.tableId, order)
    }
  }

  const tablesWithOrders = tables.map(table => ({
    id:           table.id,
    number:       table.number,
    label:        table.label,
    qrToken:      table.qrToken,
    qrScans:      table.qrScans,
    isActive:     table.isActive,
    currentOrder: latestOrderByTable.get(table.id) ?? null,
  }))

  return NextResponse.json({ tables: tablesWithOrders })
}

// ── POST /api/tables ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated with your account' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateTableSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { number, label } = parsed.data

  // Check for duplicate table number
  const existing = await prisma.table.findUnique({
    where: { restaurantId_number: { restaurantId, number } },
  })
  if (existing) {
    return NextResponse.json({ error: `Table number ${number} already exists` }, { status: 409 })
  }

  const table = await prisma.table.create({
    data: {
      restaurantId,
      number,
      label: label ? sanitizeString(label) : null,
    },
  })

  await audit({
    action: 'TABLE_CREATED',
    userId: payload.sub,
    restaurantId,
    resource: `table:${table.id}`,
    metadata: { number, label },
  })

  return NextResponse.json({ table }, { status: 201 })
}
