// src/app/api/menu/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { audit, sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const CreateMenuItemSchema = z.object({
  categoryId:   z.string().cuid(),
  name:         z.string().min(1).max(200),
  nameAr:       z.string().max(200).optional(),
  description:  z.string().max(2000).optional(),
  price:        z.number().positive().max(100000),
  imageUrl:     z.string().url().max(1000).optional(),
  calories:     z.number().int().min(0).max(99999).optional(),
  isAvailable:  z.boolean().optional(),
  isFeatured:   z.boolean().optional(),
  isPopular:    z.boolean().optional(),
  emoji:        z.string().max(10).optional(),
  sortOrder:    z.number().int().min(0).optional(),
})

// ── GET /api/menu — list menu items (public, identify via tableToken, or auth) ─
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tableToken = searchParams.get('tableToken')

  let restaurantId: string | null = null

  if (tableToken) {
    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
      select: { restaurantId: true },
    })
    if (!table) return NextResponse.json({ error: 'Invalid table token' }, { status: 404 })
    restaurantId = table.restaurantId
  } else {
    const payload = await getAuthFromCookies()
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    restaurantId = payload.restaurantId
  }

  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  const items = await prisma.menuItem.findMany({
    where: { restaurantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      category: {
        select: { id: true, name: true, nameAr: true, emoji: true, sortOrder: true },
      },
      allergens: {
        include: { allergen: { select: { id: true, name: true, emoji: true } } },
      },
    },
  })

  return NextResponse.json({ items })
}

// ── POST /api/menu — create menu item (ADMIN, OWNER, MANAGER) ────────────────
export async function POST(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateMenuItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data

  // Determine restaurantId — ADMIN can target any restaurant, others use their own
  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated with your account' }, { status: 400 })

  // Verify category belongs to this restaurant
  const category = await prisma.category.findFirst({
    where: { id: data.categoryId, restaurantId },
  })
  if (!category) {
    return NextResponse.json({ error: 'Category not found in your restaurant' }, { status: 404 })
  }

  const item = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId:   data.categoryId,
      name:         sanitizeString(data.name),
      nameAr:       data.nameAr ? sanitizeString(data.nameAr) : null,
      description:  data.description ? sanitizeString(data.description) : null,
      price:        data.price,
      imageUrl:     data.imageUrl ?? null,
      calories:     data.calories ?? null,
      isAvailable:  data.isAvailable ?? true,
      isFeatured:   data.isFeatured ?? false,
      isPopular:    data.isPopular ?? false,
      emoji:        data.emoji ?? null,
      sortOrder:    data.sortOrder ?? 0,
    },
    include: {
      category: { select: { id: true, name: true, nameAr: true, emoji: true } },
      allergens: { include: { allergen: true } },
    },
  })

  await audit({
    action: 'MENU_ITEM_CREATED',
    userId: payload.sub,
    restaurantId,
    resource: `menuItem:${item.id}`,
    metadata: { name: item.name, price: item.price },
  })

  return NextResponse.json({ item }, { status: 201 })
}
