// src/app/api/auth/me/route.ts
import { NextResponse } from 'next/server'
import { getAuthFromCookies } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true, email: true, name: true, role: true,
      restaurantId: true, mustChangePassword: true,
      lastLoginAt: true, isActive: true,
      restaurant: { select: { id: true, name: true, slug: true, currency: true } },
    },
  })

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ user })
}
