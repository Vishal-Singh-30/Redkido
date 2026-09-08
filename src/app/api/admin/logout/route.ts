import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, clearedSessionCookieOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOGIN_PATH = '/admin/login'

/**
 * POST only. A GET logout would let any <img src> or prefetch sign the admin
 * out, and the sameSite=lax cookie would happily travel with it.
 *
 * The token is stateless, so signing out means clearing the cookie: there is no
 * server-side session row to delete. Revoking a leaked token before its 7-day
 * expiry means rotating AUTH_SECRET.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url), 303)
  response.cookies.set(SESSION_COOKIE, '', clearedSessionCookieOptions)
  return response
}
