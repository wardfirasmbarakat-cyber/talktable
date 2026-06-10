// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { audit, sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(['ADMIN', 'OWNER', 'MANAGER', 'KITCHEN', 'WAITER']).optional(),
  isActive: z.boolean().optional(),
})

// ── PATCH /api/users/[id] ─────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canManage = ['ADMIN', 'OWNER', 'MANAGER'].includes(payload.role)
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Non-ADMIN must manage users within their own restaurant
  if (payload.role !== 'ADMIN' && target.restaurantId !== payload.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // MANAGER can only update WAITER or KITCHEN
  if (payload.role === 'MANAGER' && !['WAITER', 'KITCHEN'].includes(target.role)) {
    return NextResponse.json({ error: 'Managers can only update WAITER or KITCHEN users' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data
  const updateData: Record<string, unknown> = {}
  if (data.name     !== undefined) updateData.name     = sanitizeString(data.name)
  if (data.role     !== undefined) updateData.role     = data.role as Role
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      restaurantId: true,
      isActive: true,
      updatedAt: true,
    },
  })

  await audit({
    action: 'USER_UPDATED',
    userId: payload.sub,
    restaurantId: payload.restaurantId,
    resource: `user:${id}`,
    metadata: { changes: Object.keys(updateData) },
  })

  return NextResponse.json({ user })
}

// ── DELETE /api/users/[id] — deactivate (soft delete) ────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canManage = ['ADMIN', 'OWNER', 'MANAGER'].includes(payload.role)
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Prevent self-deactivation
  if (id === payload.sub) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 422 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (payload.role !== 'ADMIN' && target.restaurantId !== payload.restaurantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (payload.role === 'MANAGER' && !['WAITER', 'KITCHEN'].includes(target.role)) {
    return NextResponse.json({ error: 'Managers can only deactivate WAITER or KITCHEN users' }, { status: 403 })
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  })

  await audit({
    action: 'USER_DELETED',
    userId: payload.sub,
    restaurantId: payload.restaurantId,
    resource: `user:${id}`,
    metadata: { targetEmail: target.email },
  })

  return NextResponse.json({ success: true })
}
