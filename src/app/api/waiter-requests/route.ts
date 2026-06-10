// src/app/api/waiter-requests/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { rateLimit, getClientIp } from '@/lib/security'
import { emitToRestaurant } from '@/lib/socket-server'
import type { RequestStatus } from '@prisma/client'

const WAITER_REQUEST_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 }

const CreateWaiterRequestSchema = z.object({
  tableToken: z.string().min(1),
  type: z.enum(['CALL_WAITER', 'REQUEST_BILL', 'WATER_REFILL', 'ASSISTANCE']),
  note: z.string().max(500).optional(),
})

// ── GET /api/waiter-requests — list requests (auth required) ──────────────────
export async function GET(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') as RequestStatus | null
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const where: Record<string, unknown> = { restaurantId }
  if (status && ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(status)) {
    where.status = status
  }

  const requests = await prisma.waiterRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      table: { select: { number: true, label: true } },
    },
  })

  return NextResponse.json({ requests })
}

// ── POST /api/waiter-requests — create request (no auth, customer-facing) ─────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(`waiter-req:${ip}`, WAITER_REQUEST_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateWaiterRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { tableToken, type, note } = parsed.data

  const table = await prisma.table.findUnique({
    where: { qrToken: tableToken },
    include: { restaurant: true },
  })
  if (!table || !table.isActive) {
    return NextResponse.json({ error: 'Invalid table token' }, { status: 404 })
  }
  if (!table.restaurant.isActive) {
    return NextResponse.json({ error: 'Restaurant is currently closed.' }, { status: 422 })
  }

  const request = await prisma.waiterRequest.create({
    data: {
      restaurantId: table.restaurantId,
      tableId: table.id,
      type,
      note: note ?? null,
      status: 'OPEN',
    },
    include: {
      table: { select: { number: true, label: true } },
    },
  })

  try {
    emitToRestaurant(table.restaurantId, 'waiter:request', {
      id: request.id,
      type: request.type,
      tableNumber: request.table.number,
      tableLabel: request.table.label,
      note: request.note,
      createdAt: request.createdAt,
    })
  } catch (err) {
    console.error('[Socket] Failed to emit waiter:request', err)
  }

  return NextResponse.json({
    id: request.id,
    message: 'Your request has been sent. A staff member will be with you shortly.',
  }, { status: 201 })
}
