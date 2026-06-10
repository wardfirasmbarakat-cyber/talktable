// src/app/api/menu/categories/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const UpdateCategorySchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  nameAr:    z.string().max(100).nullable().optional(),
  emoji:     z.string().max(10).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive:  z.boolean().optional(),
})

// ── PATCH /api/menu/categories/[id] ──────────────────────────────────────────
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

  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = UpdateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data
  const updateData: Record<string, unknown> = {}
  if (data.name      !== undefined) updateData.name      = sanitizeString(data.name!)
  if (data.nameAr    !== undefined) updateData.nameAr    = data.nameAr ? sanitizeString(data.nameAr) : null
  if (data.emoji     !== undefined) updateData.emoji     = data.emoji
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
  if (data.isActive  !== undefined) updateData.isActive  = data.isActive

  const category = await prisma.category.update({
    where: { id },
    data: updateData,
    include: { _count: { select: { menuItems: true } } },
  })

  return NextResponse.json({ category })
}

// ── DELETE /api/menu/categories/[id] ─────────────────────────────────────────
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

  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { menuItems: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (existing._count.menuItems > 0) {
    return NextResponse.json(
      { error: 'Cannot delete category with existing menu items. Move or delete them first.' },
      { status: 422 }
    )
  }

  await prisma.category.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
