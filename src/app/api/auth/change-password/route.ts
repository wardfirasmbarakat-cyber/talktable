// src/app/api/auth/change-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  getAuthFromCookies,
  verifyPassword,
  hashPassword,
  validatePasswordStrength,
  revokeAllSessions,
  createSession,
  setAuthCookies,
} from '@/lib/auth'
import { audit, isCommonPassword, getClientIp } from '@/lib/security'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(1),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export async function POST(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Verify current password
  const valid = await verifyPassword(user.passwordHash, currentPassword)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }

  // Enforce strength
  const strength = validatePasswordStrength(newPassword)
  if (!strength.valid) {
    return NextResponse.json({ error: 'Password too weak', issues: strength.errors }, { status: 422 })
  }

  if (isCommonPassword(newPassword)) {
    return NextResponse.json({ error: 'This password is too common. Choose a more unique password.' }, { status: 422 })
  }

  // Cannot reuse current password
  const sameAsOld = await verifyPassword(user.passwordHash, newPassword)
  if (sameAsOld) {
    return NextResponse.json({ error: 'New password must be different from your current password.' }, { status: 422 })
  }

  const newHash = await hashPassword(newPassword)

  // Update password and revoke all other sessions (force logout everywhere)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  })
  await revokeAllSessions(user.id)

  // Issue fresh session
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') ?? 'unknown'
  const { sessionToken, accessToken } = await createSession(user.id, ua, ip)
  await setAuthCookies(sessionToken, accessToken)

  await audit({
    action: 'PASSWORD_CHANGED',
    userId: user.id,
    restaurantId: user.restaurantId,
    ipAddress: ip,
    userAgent: ua,
    metadata: { allSessionsRevoked: true },
  })

  return NextResponse.json({ ok: true, message: 'Password changed. All other sessions have been logged out.' })
}
