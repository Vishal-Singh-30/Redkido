/**
 * Edge guard for the admin area.
 *
 * Runs on the Edge runtime, so it may import NOTHING that needs Node: no
 * bcryptjs, no Prisma, no next/headers. jose is Edge-native and is the only
 * dependency here. That is why the cookie name and the JWT claims are repeated
 * as literals instead of imported from src/lib/auth.ts — importing that module
 * would drag bcryptjs into the Edge bundle.
 *
 * Keep in sync with src/lib/auth.ts: SESSION_COOKIE, the algorithm, the issuer
 * and the audience.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_COOKIE = 'rk_admin_session'
const JWT_ALGORITHM = 'HS256'
const JWT_ISSUER = 'redkido-admin'
const JWT_AUDIENCE = 'redkido-admin'

const LOGIN_PATH = '/admin/login'

/**
 * The admin layout needs the current pathname to mark the active nav item, and
 * a server component cannot read it. Middleware stamps it on the request so the
 * whole admin shell can stay a server component.
 */
export const ADMIN_PATHNAME_HEADER = 'x-admin-pathname'

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const secret = process.env.AUTH_SECRET
  if (!secret) return false
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    return typeof payload.sub === 'string' && payload.sub.length > 0
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(ADMIN_PATHNAME_HEADER, pathname)
  const pass = NextResponse.next({ request: { headers: requestHeaders } })

  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return pass
  }

  const authorised = await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)
  if (authorised) return pass

  const loginUrl = new URL(LOGIN_PATH, request.url)
  loginUrl.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*'],
}
