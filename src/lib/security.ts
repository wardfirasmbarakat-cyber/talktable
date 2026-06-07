// src/lib/security.ts
// Rate limiting, audit logging, CSRF, input sanitization

import { NextRequest } from 'next/server'
import { prisma } from './db'
import type { AuditAction } from '@prisma/client'

// ── IN-MEMORY RATE LIMITER ────────────────────────────────────────────────────
// In production, replace with Upstash Redis for multi-instance support
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

interface RateLimitOptions {
  windowMs: number   // time window in milliseconds
  max: number        // max requests per window
}

export function rateLimit(
  key: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || entry.resetAt < now) {
    const resetAt = now + options.windowMs
    rateLimitStore.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: options.max - 1, resetAt }
  }

  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: options.max - entry.count, resetAt: entry.resetAt }
}

// Presets
export const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 }   // 10/15min per IP
export const API_RATE_LIMIT   = { windowMs: 60 * 1000,      max: 100 }  // 100/min per user
export const ORDER_RATE_LIMIT = { windowMs: 60 * 1000,      max: 20 }   // 20 orders/min

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// ── AUDIT LOGGING ─────────────────────────────────────────────────────────────
export async function audit(params: {
  action: AuditAction
  userId?: string | null
  restaurantId?: string | null
  resource?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        userId: params.userId ?? null,
        restaurantId: params.restaurantId ?? null,
        resource: params.resource,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: (params.metadata ?? {}) as any,
      },
    })
  } catch (err) {
    // Never let audit failure break the main request
    console.error('[AUDIT] Failed to write audit log:', err)
  }
}

// ── INPUT SANITIZATION ────────────────────────────────────────────────────────
// Prevent XSS by stripping HTML tags from user input
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/[<>]/g, '')          // strip angle brackets
    .replace(/javascript:/gi, '')  // strip JS protocol
    .replace(/on\w+=/gi, '')       // strip event handlers
    .trim()
    .slice(0, 10_000)              // max length guard
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') out[key] = sanitizeString(val)
    else if (typeof val === 'object' && val !== null && !Array.isArray(val))
      out[key] = sanitizeObject(val as Record<string, unknown>)
    else out[key] = val
  }
  return out as T
}

// ── CSRF TOKEN ────────────────────────────────────────────────────────────────
// Simple double-submit cookie pattern
export function generateCsrfToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

export function validateCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined
): boolean {
  if (!cookieToken || !headerToken) return false
  if (cookieToken.length !== 64 || headerToken.length !== 64) return false
  // Constant-time comparison to prevent timing attacks
  let diff = 0
  for (let i = 0; i < 64; i++) {
    diff |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i)
  }
  return diff === 0
}

// ── PASSWORD SECURITY ─────────────────────────────────────────────────────────
const COMMON_PASSWORDS = new Set([
  '12345678', 'password', 'password1', '11111111', 'qwerty123',
  'abc12345', 'letmein1', 'welcome1', 'monkey123', 'dragon123',
  '123321admin', // demo password — always warn about this
])

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase())
}

export function passwordStrengthScore(password: string): {
  score: number // 0-4
  label: 'weak' | 'fair' | 'good' | 'strong'
  suggestions: string[]
} {
  let score = 0
  const suggestions: string[] = []

  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++; else suggestions.push('Add uppercase letters')
  if (/[0-9]/.test(password)) score++; else suggestions.push('Add numbers')
  if (/[^A-Za-z0-9]/.test(password)) score++; else suggestions.push('Add special characters')

  const labels: Array<'weak' | 'fair' | 'good' | 'strong'> = ['weak', 'weak', 'fair', 'good', 'strong']
  return { score: Math.min(score, 4), label: labels[Math.min(score, 4)], suggestions }
}
