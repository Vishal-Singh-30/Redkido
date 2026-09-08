import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  SESSION_COOKIE,
  createSessionToken,
  safeNextPath,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth'

/** bcryptjs and Prisma both need Node; this route may never run on the Edge. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOGIN_PATH = '/admin/login'

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  password: z.string().min(1).max(200),
})

/* --------------------------------------------------------------------------
   In-memory attempt counter, per IP.

   THIS RESETS WITH EVERY LAMBDA. On Vercel each instance keeps its own Map, a
   cold start wipes it, and a client that lands on a fresh instance starts from
   zero — so this is a speed bump against a naive script, not a rate limiter.
   A real one needs shared state: an attempts table in Postgres keyed by IP and
   window, or an edge KV with a TTL. Do not treat this as the control.
   -------------------------------------------------------------------------- */
const ATTEMPT_WINDOW_MS = 60_000
const MAX_ATTEMPTS_PER_WINDOW = 8
const attempts = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

function registerAttempt(ip: string): boolean {
  const now = Date.now()

  // Cheap sweep so the Map cannot grow without bound on a long-lived instance.
  if (attempts.size > 1000) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key)
    }
  }

  const existing = attempts.get(ip)
  if (!existing || existing.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return true
  }
  existing.count += 1
  return existing.count <= MAX_ATTEMPTS_PER_WINDOW
}

/**
 * A well-formed bcrypt hash that matches nothing. Compared against when the
 * email is unknown so a missing account costs roughly the same time as a wrong
 * password, and the form cannot be used to enumerate admin addresses.
 */
const DECOY_HASH = '$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ'

function failure(request: NextRequest, code: string, nextPath: string): NextResponse {
  const url = new URL(LOGIN_PATH, request.url)
  url.searchParams.set('error', code)
  if (nextPath !== '/admin') url.searchParams.set('next', nextPath)
  // 303 so the browser turns the POST into a GET.
  return NextResponse.redirect(url, 303)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let nextPath = '/admin'

  try {
    const formData = await request.formData()
    nextPath = safeNextPath(
      typeof formData.get('next') === 'string' ? (formData.get('next') as string) : null,
    )

    if (!registerAttempt(clientIp(request))) {
      return failure(request, 'rate_limited', nextPath)
    }

    const parsed = credentialsSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (!parsed.success) {
      return failure(request, 'invalid_input', nextPath)
    }

    const { email, password } = parsed.data

    const admin = await prisma.admin.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    })

    const matches = await verifyPassword(password, admin?.passwordHash ?? DECOY_HASH)
    if (!admin || !matches) {
      return failure(request, 'invalid', nextPath)
    }

    const token = await createSessionToken({ adminId: admin.id, email: admin.email })

    const response = NextResponse.redirect(new URL(nextPath, request.url), 303)
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
    return response
  } catch {
    // A missing AUTH_SECRET, an unreachable database, a malformed body — none
    // of which the sign-in form should leak the shape of.
    return failure(request, 'server', nextPath)
  }
}
