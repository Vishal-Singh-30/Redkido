/**
 * Admin authentication.
 *
 * Two halves that must never be mixed:
 *   - Node-only (this file): bcryptjs hashing + Prisma lookups + next/headers
 *     cookie access. Runs in route handlers, server components and actions.
 *   - Edge-safe (src/middleware.ts): jose verification only. bcryptjs and
 *     Prisma do not run on the Edge runtime, so middleware re-implements the
 *     token check with jose alone and duplicates SESSION_COOKIE as a literal.
 *     Changing the cookie name here means changing it there too.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignJWT, jwtVerify } from 'jose'
import { compare, hash } from 'bcryptjs'

export const SESSION_COOKIE = 'rk_admin_session'

/** 7 days, in seconds. Mirrored by the JWT `exp` claim below. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const JWT_ALGORITHM = 'HS256'
const JWT_ISSUER = 'redkido-admin'
const JWT_AUDIENCE = 'redkido-admin'
const BCRYPT_ROUNDS = 12

export type AdminSession = {
  adminId: string
  email: string
}

/**
 * Cookie flags for the session cookie. `secure` is off in development because
 * localhost is served over http; everywhere else the cookie must not travel
 * in the clear.
 */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const

/** Same flags, zero lifetime — used to clear the cookie on logout. */
export const clearedSessionCookieOptions = {
  ...sessionCookieOptions,
  maxAge: 0,
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('Missing required env var: AUTH_SECRET')
  }
  return new TextEncoder().encode(secret)
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  // bcryptjs throws on a malformed hash rather than returning false; a corrupt
  // row must read as "wrong password", never as a 500 on the login form.
  try {
    return await compare(plain, passwordHash)
  } catch {
    return false
  }
}

export async function createSessionToken(payload: AdminSession): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(payload.adminId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey())
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    const adminId = payload.sub
    const email = payload.email
    if (typeof adminId !== 'string' || typeof email !== 'string') return null
    if (adminId.length === 0 || email.length === 0) return null
    return { adminId, email }
  } catch {
    // Expired, tampered, wrong secret, or AUTH_SECRET absent — all are
    // "not signed in" as far as any caller is concerned.
    return null
  }
}

/** Reads the session cookie. cookies() is async in Next 16. */
export async function getSession(): Promise<AdminSession | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

/**
 * Server-component / server-action guard. Middleware already blocks the
 * unauthenticated at the edge; this is the second lock, for anything reached
 * without a matching middleware pass (server actions included).
 */
export async function requireSession(nextPath?: string): Promise<AdminSession> {
  const session = await getSession()
  if (!session) {
    redirect(nextPath ? `/admin/login?next=${encodeURIComponent(nextPath)}` : '/admin/login')
  }
  return session
}

/**
 * Open-redirect guard for the `?next=` parameter. Only same-origin admin paths
 * are honoured; anything else falls back to the dashboard.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return '/admin'
  if (!value.startsWith('/admin')) return '/admin'
  // "//evil.com" and "/\evil.com" are protocol-relative in some parsers.
  if (value.startsWith('//') || value.startsWith('/\\')) return '/admin'
  if (value.startsWith('/admin/login')) return '/admin'
  return value
}
