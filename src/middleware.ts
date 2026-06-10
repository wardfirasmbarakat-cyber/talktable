// src/middleware.ts
// Edge-compatible middleware — runs before every request

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me')

// ── ROUTE PERMISSIONS ─────────────────────────────────────────────────────────
const ROLE_ROUTES: Record<string, string[]> = {
  '/admin':   ['ADMIN'],
  '/manager': ['ADMIN', 'OWNER', 'MANAGER'],
  '/kitchen': ['ADMIN', 'OWNER', 'MANAGER', 'KITCHEN'],
  '/waiter':  ['ADMIN', 'OWNER', 'MANAGER', 'WAITER'],
  '/api/admin':  ['ADMIN'],
  '/api/users':  ['ADMIN', 'OWNER', 'MANAGER'],
  '/api/menu':   ['ADMIN', 'OWNER', 'MANAGER'],
  '/api/tables': ['ADMIN', 'OWNER', 'MANAGER'],
}

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/change-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/orders',        // customers place orders without auth
  '/r/',                // customer QR route: /r/[slug]/[tableToken]
]

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(r => r === '/' ? pathname === '/' : pathname.startsWith(r))
}

function getRequiredRoles(pathname: string): string[] | null {
  for (const [route, roles] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(route)) return roles
  }
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const res = NextResponse.next()

  // ── Security headers (applied to ALL responses) ───────────────────────────
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }

  // ── Public routes bypass auth ─────────────────────────────────────────────
  if (isPublic(pathname)) return res

  // ── Extract and verify access token ──────────────────────────────────────
  const accessToken = req.cookies.get('tt_access')?.value

  if (!accessToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  type AuthPayload = { sub: string; role: string; sessionId: string }
  let payload: AuthPayload
  try {
    const { payload: p } = await jwtVerify(accessToken, JWT_SECRET)
    payload = p as unknown as AuthPayload
  } catch {
    // Token expired — let client-side handle refresh via tt_session cookie
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // ── RBAC check ────────────────────────────────────────────────────────────
  const requiredRoles = getRequiredRoles(pathname)
  if (requiredRoles && !requiredRoles.includes(payload.role)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Redirect to their own dashboard
    const dashboardByRole: Record<string, string> = {
      ADMIN:   '/admin',
      OWNER:   '/manager',
      MANAGER: '/manager',
      KITCHEN: '/kitchen',
      WAITER:  '/waiter',
    }
    const url = req.nextUrl.clone()
    url.pathname = dashboardByRole[payload.role] ?? '/login'
    return NextResponse.redirect(url)
  }

  // ── Forward user info to route handlers via headers ───────────────────────
  res.headers.set('x-user-id', payload.sub)
  res.headers.set('x-user-role', payload.role)
  res.headers.set('x-session-id', payload.sessionId)

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
