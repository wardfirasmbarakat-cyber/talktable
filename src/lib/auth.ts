// lib/auth.ts
// Production-grade auth: Argon2 hashing, JWT via jose, session management

import { SignJWT, jwtVerify } from 'jose'
import * as argon2 from '@node-rs/argon2'
import { cookies } from 'next/headers'
import { prisma } from './db'
import type { Role } from '@prisma/client'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const DEMO_PASSWORD = '123321admin'
const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 15
const SESSION_EXPIRY_DAYS = 7
const ACCESS_TOKEN_EXPIRY = '15m'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET env var is required')
  return new TextEncoder().encode(secret)
}

// ── PASSWORD ──────────────────────────────────────────────────────────────────
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
} as const

export function validatePasswordStrength(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (password.length < PASSWORD_REQUIREMENTS.minLength)
    errors.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters`)
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password))
    errors.push('At least one uppercase letter')
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password))
    errors.push('At least one lowercase letter')
  if (PASSWORD_REQUIREMENTS.requireNumber && !/\d/.test(password))
    errors.push('At least one number')
  return { valid: errors.length === 0, errors }
}

export function isDemoPassword(password: string): boolean {
  return password === DEMO_PASSWORD
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    memoryCost: 65536,   // 64 MB
    timeCost: 3,
    parallelism: 4,
  })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

// ── JWT ───────────────────────────────────────────────────────────────────────
export interface TokenPayload {
  sub: string        // userId
  sessionId: string
  role: Role
  restaurantId: string | null
  iat?: number
  exp?: number
}

export async function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret())
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return payload as unknown as TokenPayload
  } catch {
    return null
  }
}

// ── SESSION ───────────────────────────────────────────────────────────────────
export async function createSession(
  userId: string,
  userAgent: string | null,
  ipAddress: string | null
): Promise<{ sessionToken: string; accessToken: string }> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS)

  // Use nanoid-compatible method (crypto.randomUUID is available in Node 18+)
  const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID()

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const session = await prisma.session.create({
    data: { userId, token: sessionToken, userAgent, ipAddress, expiresAt },
  })

  const accessToken = await signAccessToken({
    sub: userId,
    sessionId: session.id,
    role: user.role,
    restaurantId: user.restaurantId,
  })

  // Update last login
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), lastLoginIp: ipAddress, failedLoginCount: 0 },
  })

  return { sessionToken, accessToken }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function validateSession(sessionToken: string): Promise<{
  valid: boolean
  userId?: string
  sessionId?: string
} > {
  const session = await prisma.session.findUnique({ where: { token: sessionToken } })
  if (!session) return { valid: false }
  if (session.revokedAt) return { valid: false }
  if (session.expiresAt < new Date()) return { valid: false }
  return { valid: true, userId: session.userId, sessionId: session.id }
}

// ── COOKIE HELPERS ────────────────────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export async function setAuthCookies(sessionToken: string, accessToken: string) {
  const cookieStore = await cookies()
  cookieStore.set('tt_session', sessionToken, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
  })
  cookieStore.set('tt_access', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60, // 15 minutes
  })
}

export async function clearAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete('tt_session')
  cookieStore.delete('tt_access')
}

export async function getAuthFromCookies(): Promise<TokenPayload | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('tt_access')?.value
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken)
    if (payload) return payload
  }
  // Access token expired — try refresh via session token
  const sessionToken = cookieStore.get('tt_session')?.value
  if (!sessionToken) return null
  const { valid, userId } = await validateSession(sessionToken)
  if (!valid || !userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) return null
  // Issue a new access token (silent refresh)
  const session = await prisma.session.findFirst({
    where: { token: sessionToken, revokedAt: null },
  })
  if (!session) return null
  const newAccess = await signAccessToken({
    sub: user.id,
    sessionId: session.id,
    role: user.role,
    restaurantId: user.restaurantId,
  })
  const cookieStore2 = await cookies()
  cookieStore2.set('tt_access', newAccess, { ...COOKIE_OPTIONS, maxAge: 15 * 60 })
  return { sub: user.id, sessionId: session.id, role: user.role, restaurantId: user.restaurantId }
}

// ── LOGIN RATE LIMITING (DB-backed) ───────────────────────────────────────────
export async function recordFailedLogin(userId: string): Promise<{
  locked: boolean
  remainingAttempts: number
}> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
  })
  if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
    const lockedUntil = new Date()
    lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_MINUTES)
    await prisma.user.update({ where: { id: userId }, data: { lockedUntil } })
    return { locked: true, remainingAttempts: 0 }
  }
  return {
    locked: false,
    remainingAttempts: MAX_FAILED_LOGINS - user.failedLoginCount,
  }
}

export async function isAccountLocked(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.lockedUntil) return false
  if (user.lockedUntil > new Date()) return true
  // Lock expired — clear it
  await prisma.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 } })
  return false
}
