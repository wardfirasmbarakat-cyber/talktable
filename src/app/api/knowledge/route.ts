// src/app/api/knowledge/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const MANAGER_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const CreateKnowledgeSchema = z.object({
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(10000),
})

// ── GET /api/knowledge ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')

  const items = await prisma.knowledgeItem.findMany({
    where: {
      restaurantId,
      isActive: true,
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ items })
}

// ── POST /api/knowledge ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGER_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateKnowledgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { category, title, content } = parsed.data

  const item = await prisma.knowledgeItem.create({
    data: {
      restaurantId,
      category: sanitizeString(category),
      title: sanitizeString(title),
      content: sanitizeString(content),
    },
  })

  return NextResponse.json({ item }, { status: 201 })
}
