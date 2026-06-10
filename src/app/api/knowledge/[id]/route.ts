// src/app/api/knowledge/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const MANAGER_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const UpdateKnowledgeSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
})

// ── PATCH /api/knowledge/[id] ─────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGER_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.knowledgeItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = UpdateKnowledgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const data = parsed.data
  const updateData: Record<string, unknown> = {}
  if (data.category !== undefined) updateData.category = sanitizeString(data.category)
  if (data.title    !== undefined) updateData.title    = sanitizeString(data.title)
  if (data.content  !== undefined) updateData.content  = sanitizeString(data.content)
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const item = await prisma.knowledgeItem.update({ where: { id }, data: updateData })

  return NextResponse.json({ item })
}

// ── DELETE /api/knowledge/[id] ────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGER_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.knowledgeItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 })
  if (existing.restaurantId !== payload.restaurantId && payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.knowledgeItem.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
