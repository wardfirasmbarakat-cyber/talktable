// src/app/api/waiter-requests/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { emitToRestaurant } from '@/lib/socket-server'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['WAITER', 'MANAGER', 'OWNER', 'ADMIN']

const UpdateWaiterRequestSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
})

// ── PATCH /api/waiter-requests/[id] ──────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = UpdateWaiterRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { status } = parsed.data

  const existing = await prisma.waiterRequest.findUnique({
    where: { id },
    include: { table: { select: { number: true, label: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Waiter request not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const updateData: Record<string, unknown> = { status }
  if (status === 'ACKNOWLEDGED') updateData.acknowledgedAt = now
  if (status === 'RESOLVED') updateData.resolvedAt = now

  const request = await prisma.waiterRequest.update({
    where: { id },
    data: updateData,
    include: { table: { select: { number: true, label: true } } },
  })

  if (status === 'RESOLVED') {
    try {
      emitToRestaurant(existing.restaurantId, 'waiter:resolved', {
        id: request.id,
        tableNumber: request.table.number,
        tableLabel: request.table.label,
        resolvedAt: now,
      })
    } catch (err) {
      console.error('[Socket] Failed to emit waiter:resolved', err)
    }
  }

  return NextResponse.json({ request })
}
