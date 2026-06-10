// src/app/api/menu/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { audit, sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const UpdateMenuItemSchema = z.object({
  categoryId:   z.string().cuid().optional(),
  name:         z.string().min(1).max(200).optional(),
  nameAr:       z.string().max(200).nullable().optional(),
  description:  z.string().max(2000).nullable().optional(),
  price:        z.number().positive().max(100000).optional(),
  imageUrl:     z.string().url().max(1000).nullable().optional(),
  calories:     z.number().int().min(0).max(99999).nullable().optional(),
  isAvailable:  z.boolean().optional(),
  isFeatured:   z.boolean().optional(),
  isPopular:    z.boolean().optional(),
  emoji:        z.string().max(10).nullable().optional(),
  sortOrder:    z.number().int().min(0).optional(),
})

// ── GET /api/menu/[id] ────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, nameAr: true, emoji: true } },
      allergens: { include: { allergen: true } },
      ingredients: true,
    },
  })

  if (!item) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })

  return NextResponse.json({ item })
}

// ── PATCH /api/menu/[id] ──────────────────────────────────────────────────────
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

  const parsed = UpdateMenuItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  // Ensure item belongs to this restaurant
  const existing = await prisma.menuItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = parsed.data

  // If changing category, verify it belongs to the same restaurant
  if (data.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: data.categoryId, restaurantId: existing.restaurantId },
    })
    if (!cat) return NextResponse.json({ error: 'Category not found in your restaurant' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}
  if (data.categoryId  !== undefined) updateData.categoryId  = data.categoryId
  if (data.name        !== undefined) updateData.name        = sanitizeString(data.name)
  if (data.nameAr      !== undefined) updateData.nameAr      = data.nameAr ? sanitizeString(data.nameAr) : null
  if (data.description !== undefined) updateData.description = data.description ? sanitizeString(data.description) : null
  if (data.price       !== undefined) updateData.price       = data.price
  if (data.imageUrl    !== undefined) updateData.imageUrl    = data.imageUrl
  if (data.calories    !== undefined) updateData.calories    = data.calories
  if (data.isAvailable !== undefined) updateData.isAvailable = data.isAvailable
  if (data.isFeatured  !== undefined) updateData.isFeatured  = data.isFeatured
  if (data.isPopular   !== undefined) updateData.isPopular   = data.isPopular
  if (data.emoji       !== undefined) updateData.emoji       = data.emoji
  if (data.sortOrder   !== undefined) updateData.sortOrder   = data.sortOrder

  const item = await prisma.menuItem.update({
    where: { id },
    data: updateData,
    include: {
      category: { select: { id: true, name: true, nameAr: true, emoji: true } },
      allergens: { include: { allergen: true } },
    },
  })

  await audit({
    action: 'MENU_ITEM_UPDATED',
    userId: payload.sub,
    restaurantId: existing.restaurantId,
    resource: `menuItem:${id}`,
    metadata: { changes: Object.keys(updateData) },
  })

  return NextResponse.json({ item })
}

// ── DELETE /api/menu/[id] ─────────────────────────────────────────────────────
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

  const existing = await prisma.menuItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.menuItem.delete({ where: { id } })

  await audit({
    action: 'MENU_ITEM_DELETED',
    userId: payload.sub,
    restaurantId: existing.restaurantId,
    resource: `menuItem:${id}`,
    metadata: { name: existing.name },
  })

  return NextResponse.json({ success: true })
}
