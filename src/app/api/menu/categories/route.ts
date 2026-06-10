// src/app/api/menu/categories/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const CreateCategorySchema = z.object({
  name:      z.string().min(1).max(100),
  nameAr:    z.string().max(100).optional(),
  emoji:     z.string().max(10).optional(),
  sortOrder: z.number().int().min(0).optional(),
})

// ── GET /api/menu/categories ──────────────────────────────────────────────────
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

  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { menuItems: true } },
    },
  })

  return NextResponse.json({ categories })
}

// ── POST /api/menu/categories ─────────────────────────────────────────────────
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

  const parsed = CreateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data

  const category = await prisma.category.create({
    data: {
      restaurantId,
      name:      sanitizeString(data.name),
      nameAr:    data.nameAr ? sanitizeString(data.nameAr) : null,
      emoji:     data.emoji ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  })

  return NextResponse.json({ category }, { status: 201 })
}
