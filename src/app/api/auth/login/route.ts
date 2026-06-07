// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  verifyPassword,
  createSession,
  setAuthCookies,
  isAccountLocked,
  recordFailedLogin,
  isDemoPassword,
} from '@/lib/auth'
import { rateLimit, AUTH_RATE_LIMIT, getClientIp, audit, sanitizeString } from '@/lib/security'

const LoginSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  password: z.string().min(1).max(128),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  // ── Rate limit by IP ────────────────────────────────────────────────────────
  const rl = rateLimit(`auth:login:${ip}`, AUTH_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait 15 minutes.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  // ── Parse + validate body ───────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const email = sanitizeString(parsed.data.email).toLowerCase()
  const { password } = parsed.data

  // ── Find user ───────────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { email } })

  // Constant-time response even when user not found (prevent user enumeration)
  if (!user) {
    // Still do a dummy hash verify to prevent timing attacks
    await verifyPassword('$argon2id$v=19$m=65536,t=3,p=4$dummy', password)
    await audit({
      action: 'LOGIN_FAILED',
      ipAddress: ip,
      userAgent,
      metadata: { email, reason: 'user_not_found' },
    })
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  // ── Account locked? ─────────────────────────────────────────────────────────
  if (await isAccountLocked(user.id)) {
    await audit({
      action: 'LOGIN_FAILED',
      userId: user.id,
      ipAddress: ip,
      userAgent,
      metadata: { reason: 'account_locked' },
    })
    return NextResponse.json(
      { error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.' },
      { status: 423 }
    )
  }

  // ── Account disabled? ───────────────────────────────────────────────────────
  if (!user.isActive) {
    return NextResponse.json({ error: 'Account is disabled. Contact your administrator.' }, { status: 403 })
  }

  // ── Verify password ─────────────────────────────────────────────────────────
  const passwordValid = await verifyPassword(user.passwordHash, password)
  if (!passwordValid) {
    const { locked, remainingAttempts } = await recordFailedLogin(user.id)
    await audit({
      action: 'LOGIN_FAILED',
      userId: user.id,
      ipAddress: ip,
      userAgent,
      metadata: { reason: 'wrong_password', remainingAttempts },
    })
    const message = locked
      ? 'Account locked after too many failed attempts. Try again in 15 minutes.'
      : `Invalid email or password. ${remainingAttempts} attempts remaining.`
    return NextResponse.json({ error: message }, { status: 401 })
  }

  // ── Create session ──────────────────────────────────────────────────────────
  const { sessionToken, accessToken } = await createSession(user.id, userAgent, ip)
  await setAuthCookies(sessionToken, accessToken)

  await audit({
    action: 'LOGIN',
    userId: user.id,
    restaurantId: user.restaurantId,
    ipAddress: ip,
    userAgent,
  })

  // ── Build response ──────────────────────────────────────────────────────────
  const isDemo = isDemoPassword(password)

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
      mustChangePassword: user.mustChangePassword || isDemo,
    },
    warnings: isDemo
      ? ['Demo password detected. Please create a secure password immediately.']
      : [],
  })
}
