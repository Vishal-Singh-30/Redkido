/**
 * Funnel 1 — the free enquiry.
 *
 * No payment, no slot, no money of any kind: validate, write one Lead of kind
 * ENQUIRY, acknowledge it to the sender and alert the owner.
 *
 * The honeypot is answered with an ordinary 200. A bot that fills every field
 * it can find gets exactly the same response as a person, learns nothing about
 * which field was the trap, and leaves no Lead row behind. Returning a 400 (or
 * a different shape, or a noticeably different latency) would tell a scraper
 * precisely what to skip next time.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { enquiryInput, isHoneypotTripped, toFieldErrors } from '@/lib/validation'
import { enquiryAcknowledgement, ownerAlert, ownerAlertRecipient } from '@/lib/email-templates'
import { sendEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'

/** The Prisma driver adapter needs the Node runtime. */
export const runtime = 'nodejs'
/** A form endpoint must never be cached or statically evaluated. */
export const dynamic = 'force-dynamic'

const LOG = '[api:enquiry]'

/** Recorded on the Lead so the admin can tell the two funnels apart. */
const LEAD_SOURCE = 'website:enquiry-form'

/** Machine codes the form maps to copy from src/content/forms.ts. */
const CODE = {
  invalidBody: 'INVALID_BODY',
  validation: 'VALIDATION',
  serverError: 'SERVER_ERROR',
} as const

/** The response a human and a bot both get. Identical by design. */
function accepted(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: CODE.invalidBody }, { status: 400 })
  }

  const parsed = enquiryInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: CODE.validation, fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    )
  }

  const input = parsed.data

  if (isHoneypotTripped(input)) {
    console.info(`${LOG} honeypot tripped; discarding submission`)
    return accepted()
  }

  try {
    const lead = await prisma.lead.create({
      data: {
        kind: 'ENQUIRY',
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        company: input.company ?? null,
        message: input.message,
        source: LEAD_SOURCE,
      },
    })

    /**
     * Both sends are awaited rather than fired and forgotten. On a serverless
     * host the runtime may freeze the instance the moment the response is
     * returned, so an un-awaited promise is a coin flip. sendEmail() never
     * throws and carries its own timeout, so awaiting costs latency and
     * nothing else — and neither result may fail the request: the enquiry is
     * safely in the database, which is the part the sender cares about.
     */
    const acknowledgement = enquiryAcknowledgement({ name: lead.name })
    const alert = ownerAlert({
      kind: 'ENQUIRY',
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      message: lead.message,
    })

    const [ackResult, alertResult] = await Promise.all([
      sendEmail({
        to: lead.email,
        subject: acknowledgement.subject,
        html: acknowledgement.html,
        text: acknowledgement.text,
      }),
      sendEmail({
        to: ownerAlertRecipient,
        subject: alert.subject,
        html: alert.html,
        text: alert.text,
        // Replying to the alert reaches the enquirer directly.
        replyTo: lead.email,
      }),
    ])

    if (!ackResult.ok) {
      console.error(`${LOG} lead=${lead.id} acknowledgement not sent: ${ackResult.error ?? 'skipped'}`)
    }
    if (!alertResult.ok) {
      console.error(`${LOG} lead=${lead.id} owner alert not sent: ${alertResult.error ?? 'skipped'}`)
    }

    console.info(`${LOG} lead=${lead.id} created`)
    return accepted()
  } catch (error) {
    console.error(`${LOG} failed to record an enquiry`, error)
    return NextResponse.json({ ok: false, code: CODE.serverError }, { status: 500 })
  }
}
