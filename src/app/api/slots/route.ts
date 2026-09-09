/**
 * The sessions an admin has published, for the booking picker.
 *
 *   GET /api/slots                    -> the days that have something open
 *   GET /api/slots?date=YYYY-MM-DD    -> that day's open sessions, in IST
 *
 * Two shapes, one endpoint, because they are two views of one question and the
 * picker asks both: the day strip is fetched once and each day's times are
 * fetched as the visitor clicks. Sixty days of sessions in a single payload
 * would be mostly rows nobody looks at, and every one of them stale by the time
 * they were clicked.
 *
 * Cache-Control: no-store, and not as a formality. Availability changes the
 * moment somebody else books, and a cached list is a list that offers a session
 * which is already gone — the visitor picks it, gets a 409, and blames the
 * site. So nothing may hold this response: not the browser, not a CDN, not
 * Next's own data cache.
 *
 * There is deliberately no Google Calendar cross-check here any more. Sessions
 * are published by hand from /admin/sessions, so the published list IS the
 * answer to "when are we free" — filtering it again against a busy calendar
 * would silently withdraw sessions an admin had chosen to open.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { isSessionDate, listAvailableDays, listSessionsForDate } from '@/lib/slots'

/** The Prisma driver adapter needs the Node runtime. */
export const runtime = 'nodejs'
/** Availability is per-request state; it must never be statically evaluated. */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const LOG = '[api:slots]'

const DATE_PARAM = 'date'

/** Machine codes the picker maps to copy from src/content/booking.ts. */
const CODE = {
  invalidDate: 'INVALID_DATE',
  serverError: 'SERVER_ERROR',
} as const

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const date = request.nextUrl.searchParams.get(DATE_PARAM)?.trim() ?? ''

  try {
    if (date.length === 0) {
      const days = await listAvailableDays()
      return NextResponse.json(
        // `dates` is the same list flattened, so a caller that only wants the
        // keys does not have to know the shape of a day.
        { ok: true, days, dates: days.map((day) => day.date) },
        { status: 200, headers: NO_STORE },
      )
    }

    if (!isSessionDate(date)) {
      return NextResponse.json(
        { ok: false, code: CODE.invalidDate },
        { status: 400, headers: NO_STORE },
      )
    }

    const sessions = await listSessionsForDate(date)
    return NextResponse.json({ ok: true, date, sessions }, { status: 200, headers: NO_STORE })
  } catch (error) {
    console.error(`${LOG} failed to list sessions for "${date}"`, error)
    return NextResponse.json(
      { ok: false, code: CODE.serverError },
      { status: 500, headers: NO_STORE },
    )
  }
}
