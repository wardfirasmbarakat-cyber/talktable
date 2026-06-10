// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies, hashPassword } from '@/lib/auth'
import { audit, sanitizeString } from '@/lib/security'
import type { Role } from '@prisma/client'

const MANAGE_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']

const CreateUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(200),
  role: z.enum(['ADMIN', 'OWNER', 'MANAGER', 'KITCHEN', 'WAITER']),
  password: z.string().min(8).max(128),
})

// ── GET /api/users ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGE_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where: Record<string, unknown> =
    payload.role === 'ADMIN' ? {} : { restaurantId: payload.restaurantId }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      restaurantId: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ users })
}

// ── POST /api/users ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGE_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { email, name, role, password } = parsed.data

  // MANAGER cannot create users with ADMIN/OWNER role
  if (payload.role === 'MANAGER' && ['ADMIN', 'OWNER', 'MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Managers can only create WAITER or KITCHEN users' }, { status: 403 })
  }

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)
  const restaurantId = payload.role === 'ADMIN' ? null : payload.restaurantId

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      name: sanitizeString(name),
      role: role as Role,
      passwordHash,
      restaurantId,
      mustChangePassword: true,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      restaurantId: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  })

  await audit({
    action: 'USER_CREATED',
    userId: payload.sub,
    restaurantId: payload.restaurantId,
    resource: `user:${user.id}`,
    metadata: { email: user.email, role: user.role },
  })

  return NextResponse.json({ user }, { status: 201 })
}
