/**
 * Available slots for the booking picker.
 *
 * GET /api/slots                        -> every future, AVAILABLE slot
 * GET /api/slots?consultation=<slug>    -> the ones bookable for that session
 *
 * Cache-Control: no-store, and not as a formality. Slot availability changes
 * the moment somebody else pays, and a cached grid is a grid that offers a slot
 * which is already gone — the user picks it, gets a 409, and blames the site.
 * A stale second here costs a failed checkout, so nothing may hold this
 * response: not the browser, not a CDN, not Next's own data cache.
 *
 * The list is then cross-checked against the team's real Google calendar and
 * anything colliding with a busy interval is dropped. That step is advisory and
 * cannot fail the request — see withoutCalendarConflicts() below.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getBusyIntervals } from '@/lib/google-calendar'
import { resolveConsultation } from '@/lib/pricing'
import { listAvailableSlots, type AvailableSlot } from '@/lib/slots'

/** The Prisma driver adapter needs the Node runtime. */
export const runtime = 'nodejs'
/** Availability is per-request state; it must never be statically evaluated. */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const LOG = '[api:slots]'

const CONSULTATION_PARAM = 'consultation'

/** Machine codes the booking form maps to copy from src/content/forms.ts. */
const CODE = {
  consultationUnavailable: 'CONSULTATION_UNAVAILABLE',
  serverError: 'SERVER_ERROR',
} as const

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const

/**
 * Hide slots the team is demonstrably not free for, according to the real
 * Google calendar.
 *
 * ── ADVISORY ONLY ───────────────────────────────────────────────────────────
 * Our Slot rows remain the booking authority. Google is consulted here to make
 * the picker honest, never to decide whether a booking may proceed — checkout
 * does not call it at all, so an outage there cannot block a payment.
 *
 * Every failure mode collapses to "no filtering":
 *   - getBusyIntervals() returns null when Google is not configured, when the
 *     token exchange fails, on a non-2xx, and on its own 8s timeout;
 *   - anything it still manages to throw is caught below;
 *   - an unparseable interval yields NaN, and every NaN comparison is false,
 *     so that one interval simply hides nothing.
 * In each case the caller gets OUR slots, which is the whole contract.
 */
async function withoutCalendarConflicts(
  slots: readonly AvailableSlot[],
): Promise<readonly AvailableSlot[]> {
  if (slots.length === 0) return slots

  try {
    const starts = slots.map((slot) => Date.parse(slot.startsAt))
    const ends = slots.map((slot) => Date.parse(slot.endsAt))
    const from = new Date(Math.min(...starts))
    const to = new Date(Math.max(...ends))
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return slots

    const busy = await getBusyIntervals(from, to)
    if (busy === null || busy.length === 0) return slots

    // Half-open overlap: a slot ending exactly when a meeting starts is free.
    const filtered = slots.filter((slot) => {
      const startsAt = Date.parse(slot.startsAt)
      const endsAt = Date.parse(slot.endsAt)
      return !busy.some(
        (interval) => startsAt < interval.end.getTime() && endsAt > interval.start.getTime(),
      )
    })

    return filtered
  } catch (error) {
    console.error(`${LOG} calendar cross-check failed; serving unfiltered slots`, error)
    return slots
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get(CONSULTATION_PARAM)?.trim() ?? ''

  try {
    let consultationTypeId: string | undefined

    if (slug.length > 0) {
      // resolveConsultation() also filters out retired types, so a link to a
      // withdrawn session cannot keep offering times for it.
      const consultation = await resolveConsultation(slug)
      if (consultation === null) {
        return NextResponse.json(
          { ok: false, code: CODE.consultationUnavailable },
          { status: 404, headers: NO_STORE },
        )
      }
      consultationTypeId = consultation.id
    }

    const slots = await withoutCalendarConflicts(await listAvailableSlots(consultationTypeId))

    return NextResponse.json({ ok: true, slots }, { status: 200, headers: NO_STORE })
  } catch (error) {
    console.error(`${LOG} failed to list slots for "${slug}"`, error)
    return NextResponse.json(
      { ok: false, code: CODE.serverError },
      { status: 500, headers: NO_STORE },
    )
  }
}
