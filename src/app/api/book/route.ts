/**
 * Funnel 2 — booking a free call.
 *
 * No payment, no gateway, no hold, no second round trip: validate, take the
 * session's row lock, write one Lead of kind CALL and one CONFIRMED Booking,
 * flip the session to BOOKED, commit. Everything that can fail slowly or
 * remotely — the Google Meet event, the confirmation email, the owner alert —
 * happens AFTER the commit, in fulfilBooking(), which never throws.
 *
 * That ordering is the whole design. A booking is real the moment the
 * transaction commits; if Google is down and Resend is down and the process
 * dies immediately afterwards, the session is still held, the lead is still in
 * the admin list, and a human can still take it from there.
 *
 * ── THE RACE ────────────────────────────────────────────────────────────────
 * Two visitors clicking the same time in the same second is the one concurrency
 * problem this route has, and it is closed inside the transaction by
 * lockSlotForBooking()'s SELECT ... FOR UPDATE. The loser gets a 409 carrying a
 * machine-readable code, and the picker refreshes that day and says so plainly
 * rather than showing "something went wrong". Behind it, the partial unique
 * index on Booking(slotId) WHERE status = 'CONFIRMED' makes Postgres refuse a
 * double-book even if this file is wrong.
 *
 * ── TWO BODY FORMATS, ON PURPOSE ────────────────────────────────────────────
 * The booking form posts JSON when JavaScript is running and posts itself
 * natively when it is not. Both arrive here. A native post is answered with a
 * 303 redirect — See Other, so the browser follows it with a GET; a 307 would
 * re-POST the body onto a page that only answers GET.
 *
 * ── THE HONEYPOT ────────────────────────────────────────────────────────────
 * A filled honeypot gets the ordinary success response and writes nothing. The
 * JSON success response carries no booking id (the browser already knows which
 * session it picked, so it needs nothing back), which is what lets the two be
 * byte-identical: a bot cannot tell that it was discarded.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { fulfilBooking } from '@/lib/fulfilment'
import { prisma } from '@/lib/prisma'
import { isSlotUnavailableError, lockSlotForBooking, type SlotUnavailableReason } from '@/lib/slots'
import { bookCallInput, isHoneypotTripped, toFieldErrors } from '@/lib/validation'

/** The Prisma driver adapter needs the Node runtime. */
export const runtime = 'nodejs'
/** A form endpoint must never be cached or statically evaluated. */
export const dynamic = 'force-dynamic'

const LOG = '[api:book]'

/** Recorded on the Lead so the admin can tell the two funnels apart. */
const LEAD_SOURCE = 'website:book-call'

const BOOK_PATH = '/book'
const SUCCESS_PATH = '/book/success'

/** Machine codes the picker maps to copy from src/content/booking.ts. */
const CODE = {
  invalidBody: 'INVALID_BODY',
  validation: 'VALIDATION',
  slotUnavailable: 'SLOT_UNAVAILABLE',
  serverError: 'SERVER_ERROR',
} as const

/**
 * Codes for the no-JavaScript path, which cannot read a JSON body: they travel
 * in the query string and /book turns them back into the same sentences.
 */
const NATIVE_ERROR: Record<SlotUnavailableReason, string> = {
  TAKEN: 'SLOT_TAKEN',
  PAST: 'SLOT_PAST',
  NOT_FOUND: 'SLOT_UNAVAILABLE',
}

/** Prisma's unique-constraint violation. Here it can only be the double-book guard. */
const UNIQUE_VIOLATION = 'P2002'
/** findUniqueOrThrow found nothing — the session was deleted under us. */
const NOT_FOUND = 'P2025'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

/* ───────────────────────────── request body ─────────────────────────────── */

type ReadBody =
  | { readonly ok: true; readonly values: unknown; readonly native: boolean }
  | { readonly ok: false }

/**
 * A checkbox posts the string "on" when ticked and nothing at all when it is
 * not, so consent is converted here rather than being loosened in the schema.
 * `z.literal(true)` stays the rule; this is only the wire format.
 */
function toConsent(value: string): boolean {
  return value === 'on' || value === 'true' || value === '1'
}

function fromFormData(form: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, value] of form.entries()) {
    // A File would mean a control this form does not have; ignore it and let
    // .strict() reject anything unexpected that IS a string.
    if (typeof value !== 'string') continue
    values[key] = key === 'consent' ? toConsent(value) : value
  }
  return values
}

async function readBody(request: NextRequest): Promise<ReadBody> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      return { ok: true, values: await request.json(), native: false }
    } catch {
      return { ok: false }
    }
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      return { ok: true, values: fromFormData(await request.formData()), native: true }
    } catch {
      return { ok: false }
    }
  }

  return { ok: false }
}

/* ─────────────────────────────── responses ──────────────────────────────── */

function seeOther(request: NextRequest, path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, request.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) {
    if (value.length > 0) url.searchParams.set(key, value)
  }
  // 303: the browser must follow this with a GET. NextResponse.redirect()
  // defaults to 307, which re-POSTs the body onto a page that has no POST.
  return NextResponse.redirect(url, 303)
}

/**
 * The response a real booking and a discarded bot submission both get. It
 * carries nothing about the booking: the browser picked the session, so it
 * already knows what to put on the confirmation screen, and returning an id
 * would be the one field that told a bot it had been caught.
 */
function accepted(request: NextRequest, native: boolean, at?: { start: string; end: string }) {
  if (!native) return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE })
  return seeOther(request, SUCCESS_PATH, { at: at?.start ?? '', until: at?.end ?? '' })
}

function failed(
  request: NextRequest,
  native: boolean,
  status: number,
  body: Record<string, unknown>,
  nativeCode: string,
): NextResponse {
  if (native) return seeOther(request, BOOK_PATH, { error: nativeCode })
  return NextResponse.json({ ok: false, ...body }, { status, headers: NO_STORE })
}

/* ──────────────────────────────── handler ───────────────────────────────── */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readBody(request)
  if (!body.ok) {
    return NextResponse.json(
      { ok: false, code: CODE.invalidBody },
      { status: 400, headers: NO_STORE },
    )
  }

  const { native } = body
  const parsed = bookCallInput.safeParse(body.values)

  if (!parsed.success) {
    return failed(
      request,
      native,
      400,
      { code: CODE.validation, fieldErrors: toFieldErrors(parsed.error) },
      CODE.validation,
    )
  }

  const input = parsed.data

  if (isHoneypotTripped(input)) {
    console.info(`${LOG} honeypot tripped; discarding submission`)
    return accepted(request, native)
  }

  try {
    /**
     * One transaction: lock, write, flip. Nothing slow happens inside it — no
     * email, no Google, no third party — because every millisecond in here is a
     * millisecond the session's row is locked against everybody else.
     */
    const booked = await prisma.$transaction(
      async (tx) => {
        const slot = await lockSlotForBooking(tx, input.slotId)

        const lead = await tx.lead.create({
          data: {
            kind: 'CALL',
            name: input.name,
            email: input.email,
            phone: input.phone,
            company: input.company ?? null,
            message: input.message ?? null,
            source: LEAD_SOURCE,
          },
          select: { id: true },
        })

        const booking = await tx.booking.create({
          // Free calls have nothing to wait for, so a booking is CONFIRMED the
          // moment it exists. There is no pending state to reconcile later.
          data: { leadId: lead.id, slotId: slot.id, status: 'CONFIRMED' },
          select: { id: true },
        })

        await tx.slot.update({ where: { id: slot.id }, data: { status: 'BOOKED' } })

        return {
          bookingId: booking.id,
          leadId: lead.id,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        }
      },
      { maxWait: 5_000, timeout: 15_000 },
    )

    console.info(
      `${LOG} booking=${booked.bookingId} lead=${booked.leadId} slot=${input.slotId} confirmed`,
    )

    /**
     * Fulfilment runs AFTER the commit and is awaited rather than fired and
     * forgotten: on a serverless host the runtime may freeze the instance the
     * moment the response is returned, so an un-awaited promise is a coin flip.
     * It never throws and it never blocks the booking — but it is wrapped
     * anyway, because a booking that is already committed must not be reported
     * as a failure whatever happens in here.
     */
    try {
      await fulfilBooking(booked.bookingId)
    } catch (error) {
      console.error(`${LOG} booking=${booked.bookingId} fulfilment threw; booking stands`, error)
    }

    return accepted(request, native, { start: booked.startsAt, end: booked.endsAt })
  } catch (error) {
    if (isSlotUnavailableError(error)) {
      console.info(`${LOG} slot=${input.slotId} not bookable (${error.reason})`)
      return failed(
        request,
        native,
        409,
        { code: CODE.slotUnavailable, reason: error.reason },
        NATIVE_ERROR[error.reason],
      )
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      /**
       * P2002 here is the partial unique index on Booking(slotId) WHERE status
       * = 'CONFIRMED' — the database refusing a double-book that got past the
       * row lock. It is the same event as far as the visitor is concerned, so
       * it gets the same answer.
       */
      if (error.code === UNIQUE_VIOLATION || error.code === NOT_FOUND) {
        console.warn(`${LOG} slot=${input.slotId} rejected by the database (${error.code})`)
        return failed(
          request,
          native,
          409,
          { code: CODE.slotUnavailable, reason: 'TAKEN' satisfies SlotUnavailableReason },
          NATIVE_ERROR.TAKEN,
        )
      }
    }

    console.error(`${LOG} failed to book slot=${input.slotId}`, error)
    return failed(request, native, 500, { code: CODE.serverError }, CODE.serverError)
  }
}
