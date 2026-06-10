// src/app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'
import { rateLimit, getClientIp } from '@/lib/security'
import type { Role } from '@prisma/client'

const MANAGER_ROLES: Role[] = ['ADMIN', 'OWNER', 'MANAGER']
const FEEDBACK_RATE_LIMIT = { windowMs: 60 * 1000, max: 5 }

const CreateFeedbackSchema = z.object({
  tableToken: z.string().min(1),
  orderId: z.string().cuid().optional(),
  foodRating: z.number().int().min(1).max(5),
  serviceRating: z.number().int().min(1).max(5),
  atmosphereRating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
})

// ── GET /api/feedback — list feedback (auth required, MANAGER+) ───────────────
export async function GET(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MANAGER_ROLES.includes(payload.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  const { searchParams } = req.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const [feedbackList, aggregates] = await Promise.all([
    prisma.feedback.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.feedback.aggregate({
      where: { restaurantId },
      _avg: {
        foodRating: true,
        serviceRating: true,
        atmosphereRating: true,
      },
      _count: { id: true },
    }),
  ])

  return NextResponse.json({
    feedback: feedbackList,
    averages: {
      food: aggregates._avg.foodRating,
      service: aggregates._avg.serviceRating,
      atmosphere: aggregates._avg.atmosphereRating,
      total: aggregates._count.id,
    },
  })
}

// ── POST /api/feedback — submit feedback (no auth, customer-facing) ───────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(`feedback:${ip}`, FEEDBACK_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateFeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { tableToken, orderId, foodRating, serviceRating, atmosphereRating, comment } = parsed.data

  const table = await prisma.table.findUnique({
    where: { qrToken: tableToken },
    select: { id: true, restaurantId: true, isActive: true },
  })
  if (!table || !table.isActive) {
    return NextResponse.json({ error: 'Invalid table token' }, { status: 404 })
  }

  // If orderId provided, verify it belongs to this restaurant's table
  if (orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tableId: table.id },
    })
    if (!order) {
      return NextResponse.json({ error: 'Order not found for this table' }, { status: 404 })
    }
  }

  const feedback = await prisma.feedback.create({
    data: {
      restaurantId: table.restaurantId,
      tableId: table.id,
      orderId: orderId ?? null,
      foodRating,
      serviceRating,
      atmosphereRating,
      comment: comment ?? null,
    },
  })

  return NextResponse.json({
    id: feedback.id,
    message: 'Thank you for your feedback!',
  }, { status: 201 })
}
