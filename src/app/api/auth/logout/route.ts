// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromCookies, clearAuthCookies, revokeSession, revokeAllSessions } from '@/lib/auth'
import { audit } from '@/lib/security'

export async function POST(req: NextRequest) {
  const payload = await getAuthFromCookies()
  const allDevices = req.nextUrl.searchParams.get('all') === 'true'

  if (payload) {
    if (allDevices) {
      await revokeAllSessions(payload.sub)
    } else {
      await revokeSession(payload.sessionId)
    }
    await audit({
      action: 'LOGOUT',
      userId: payload.sub,
      metadata: { allDevices },
    })
  }

  await clearAuthCookies()
  return NextResponse.json({ ok: true })
}
