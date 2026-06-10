// src/app/api/tables/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { audit, sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const UpdateTableSchema = z.object({
  label:        z.string().max(100).nullable().optional(),
  isActive:     z.boolean().optional(),
  regenerateQr: z.boolean().optional(),
})

// ── PATCH /api/tables/[id] ────────────────────────────────────────────────────
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

  const existing = await prisma.table.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Table not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = UpdateTableSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data
  const updateData: Record<string, unknown> = {}

  if (data.label      !== undefined) updateData.label    = data.label ? sanitizeString(data.label) : null
  if (data.isActive   !== undefined) updateData.isActive = data.isActive
  if (data.regenerateQr === true)    updateData.qrToken  = crypto.randomUUID()

  const table = await prisma.table.update({
    where: { id },
    data: updateData,
  })

  await audit({
    action: 'TABLE_UPDATED',
    userId: payload.sub,
    restaurantId: existing.restaurantId,
    resource: `table:${id}`,
    metadata: {
      changes: Object.keys(updateData),
      qrRegenerated: data.regenerateQr === true,
    },
  })

  return NextResponse.json({ table })
}

// ── DELETE /api/tables/[id] ───────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.table.findUnique({
    where: { id },
    include: {
      _count: { select: { orders: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } } } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Table not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (existing._count.orders > 0) {
    return NextResponse.json(
      { error: 'Cannot delete table with active orders. Complete or cancel them first.' },
      { status: 422 }
    )
  }

  await prisma.table.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
