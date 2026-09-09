/**
 * Post-booking fulfilment: meeting link, confirmation email, owner alert.
 *
 * ── WHY THIS IS SHAPED THE WAY IT IS ────────────────────────────────────────
 *
 * Calls are free, so there is no payment webhook racing the browser any more.
 * The shape below survives that simplification anyway, because the callers
 * still are not single: POST /api/book runs it, an admin can re-run it, and a
 * retried request can arrive after the first one already started. "Exactly
 * once" has to survive being called an arbitrary number of times.
 *
 * So there is no "has this been fulfilled?" flag, because a flag is read and
 * then acted on, and two callers both read `false` before either writes `true`.
 * Instead EACH side effect is claimed separately with a conditional write:
 *
 *     UPDATE "Booking" SET <col> = now() WHERE id = $1 AND <col> IS NULL
 *
 * The database decides the winner. `count === 1` means this process owns that
 * one side effect and must perform it; `count === 0` means another caller
 * already has it, which is a completely normal outcome and not an error.
 *
 * Claiming BEFORE sending is deliberate: the opposite order (send, then record)
 * sends the client two confirmation emails whenever the recording write fails
 * or the process dies between the two. A duplicate email is worse than a
 * missing one here, so the claim is taken first.
 *
 * ── WHEN A CLAIM MAY BE RELEASED, AND WHEN IT MAY NOT ───────────────────────
 *
 * A claim used to be released back to NULL on any unsuccessful send, "for a
 * retry". Two things were wrong with that, and both put the client's inbox at
 * risk or left them with nothing:
 *
 *   1. NOT EVERY FAILURE IS A FAILURE. sendEmail()'s 10s timeout could not
 *      prove the message had not gone out. Releasing the claim on a slow send
 *      that Resend ultimately accepted let the next caller send the SAME
 *      confirmation again. sendEmail() now aborts a timed-out request AND
 *      reports `indeterminate`, and an indeterminate send NEVER releases the
 *      claim. Losing one email is a support ticket; two identical
 *      confirmations in a client's inbox cannot be taken back.
 *
 *   2. NOTHING RETRIES. "Released for retry" described a mechanism that does
 *      not exist — there is no queue, no cron, no scheduled re-run. A released
 *      claim only helps a caller that happens to arrive later (a retried
 *      request, or a human calling resendConfirmation()).
 *
 * So every unsent confirmation — withheld, failed, or unknown — is logged at
 * error level with the booking id and the marker CONFIRMATION_UNSENT, and the
 * owner alert still fires so a human learns the client was not written to.
 * `grep CONFIRMATION_UNSENT` is the operator's list of clients who booked and
 * may be sitting in silence. See resendConfirmation() for the way back.
 *
 * ── AND IT NEVER THROWS ─────────────────────────────────────────────────────
 *
 * The slot has already been taken by the time this runs, and the client has
 * already been told they are booked. Nothing in here — a Resend outage, a
 * Google outage, a malformed row — may propagate into the caller and turn a
 * real booking into a 500. Everything is caught and logged; the markers below
 * are what an operator alerts on. Each side effect is guarded separately too,
 * so a confirmation that blows up cannot take the owner alert down with it.
 */

import { siteConfig } from '@/config/site'
import { bookingConfirmation, ownerAlert, ownerAlertRecipient } from '@/lib/email-templates'
import { sendEmail } from '@/lib/email'
import { createMeetingEvent, isGoogleCalendarConfigured } from '@/lib/google-calendar'
import { prisma } from '@/lib/prisma'
import { SETTING_KEYS } from '@/components/admin/shell'

const LOG = '[fulfilment]'

/** Shown when a slot carries no cosmetic label of its own. */
const DEFAULT_SESSION_LABEL = 'Intro call'

/**
 * Sentinel written into googleEventId while the Calendar call is in flight.
 *
 * The claim has to be taken BEFORE the event id exists, otherwise two callers
 * both call Google and the client is invited to two meetings. Same shape as the
 * email claims in this file: claim, act, and put the claim back if the action
 * failed so a retry can pick it up.
 */
const MEETING_CLAIM_IN_FLIGHT = '__creating__'

/** Fallback link an admin can set when Google is not connected. */
async function settingsMeetingLink(): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTING_KEYS.meetingLinkTemplate },
      select: { value: true },
    })
    const value = row?.value?.trim()
    return value ? value : null
  } catch {
    return null
  }
}

function sessionLabelFor(booking: FulfilmentBooking): string {
  const label = booking.slot.label?.trim()
  return label && label.length > 0 ? label : DEFAULT_SESSION_LABEL
}

/**
 * Creates the Google Calendar event carrying the Meet conference, exactly once
 * per booking, and returns the join URL.
 */
async function claimMeeting(booking: FulfilmentBooking): Promise<string | null> {
  if (booking.meetingUrl) return booking.meetingUrl
  if (!isGoogleCalendarConfigured()) return settingsMeetingLink()

  const claim = await prisma.booking.updateMany({
    where: { id: booking.id, googleEventId: null },
    data: { googleEventId: MEETING_CLAIM_IN_FLIGHT },
  })

  if (claim.count === 0) {
    // Another caller is creating it, or already did. Re-read rather than racing.
    const fresh = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { meetingUrl: true },
    })
    return fresh?.meetingUrl ?? (await settingsMeetingLink())
  }

  const label = sessionLabelFor(booking)

  const details = await createMeetingEvent({
    summary: `${label} — ${siteConfig.name} × ${booking.lead.name}`,
    description: [
      label,
      booking.lead.company ? `Company: ${booking.lead.company}` : null,
      booking.lead.message
        ? `\nWhat they want to cover:\n${booking.lead.message}`
        : null,
      `\nBooked via ${siteConfig.url}`,
    ]
      .filter(Boolean)
      .join('\n'),
    startsAt: booking.slot.startsAt,
    endsAt: booking.slot.endsAt,
    attendees: [booking.lead.email],
    idempotencyKey: `booking-${booking.id}`,
  })

  if (details === null) {
    // Release the claim so a retry or an admin resend can try again.
    await prisma.booking.updateMany({
      where: { id: booking.id, googleEventId: MEETING_CLAIM_IN_FLIGHT },
      data: { googleEventId: null },
    })
    console.error(`${LOG} booking=${booking.id} MEETING_UNCREATED — falling back to settings link`)
    return settingsMeetingLink()
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { googleEventId: details.eventId, meetingUrl: details.meetUrl },
  })

  console.info(`${LOG} booking=${booking.id} meeting created event=${details.eventId}`)
  return details.meetUrl ?? (await settingsMeetingLink())
}

/**
 * Grep markers. One token per side effect, whatever the reason, so a single
 * search finds every affected booking:
 *
 *   grep CONFIRMATION_UNSENT  — a client was not (or may not have been) written
 *                               to; the reason= field says which.
 *   grep OWNER_ALERT_UNSENT   — nobody internal was told about the booking.
 */
export const CONFIRMATION_UNSENT_MARKER = 'CONFIRMATION_UNSENT'
export const OWNER_ALERT_UNSENT_MARKER = 'OWNER_ALERT_UNSENT'

/**
 * Why a confirmation did not go out.
 *
 *   withheld     — caller asked for a hold; auto-confirming would lie.
 *   send-failed  — definitively not delivered. The claim was released, so a
 *                  later caller may try again.
 *   send-unknown — timed out and was aborted; delivery is unknown. The claim
 *                  was KEPT, because releasing it is what sends a second copy.
 *                  Only a human clears this one.
 */
type UnsentReason = 'withheld' | 'send-failed' | 'send-unknown'

/** What happened to a confirmation attempt. */
export type ConfirmationStatus =
  | 'sent'
  | 'already-claimed'
  | 'withheld'
  | 'failed'
  | 'unknown'
  | 'booking-not-found'
  | 'cancelled'

export type ResendConfirmationResult = {
  readonly status: ConfirmationStatus
}

/** Booking plus everything the templates need, in one round trip. */
async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: { lead: true, slot: true },
  })
}

type FulfilmentBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>

/**
 * Stable idempotency keys, one per (booking, message).
 *
 * Resend collapses a repeat request carrying the same key onto the first one,
 * which is a second line of defence behind the database claim: even if a claim
 * were somehow taken twice, the client still receives one confirmation. A
 * deliberate human-forced resend omits the key — see resendConfirmation().
 */
function confirmationKey(bookingId: string): string {
  return `booking-confirmation:${bookingId}`
}

function ownerAlertKey(bookingId: string): string {
  return `booking-owner-alert:${bookingId}`
}

function logConfirmationUnsent(bookingId: string, reason: UnsentReason, detail: string): void {
  console.error(
    `${LOG} booking=${bookingId} ${CONFIRMATION_UNSENT_MARKER} reason=${reason} — ${detail}`,
  )
}

/**
 * The confirmation that goes to the client: what they booked, when it is in
 * IST, and the link to join. No money, because the call is free.
 *
 * `force` drops the idempotency key so a human-ordered resend is not collapsed
 * onto the earlier attempt by Resend.
 */
async function deliverConfirmation(
  booking: FulfilmentBooking,
  opts: { readonly force?: boolean } = {},
): Promise<ConfirmationStatus> {
  const claim = await prisma.booking.updateMany({
    where: { id: booking.id, confirmationEmailSentAt: null },
    data: { confirmationEmailSentAt: new Date() },
  })

  if (claim.count === 0) {
    console.info(`${LOG} booking=${booking.id} confirmation already claimed; nothing to do`)
    return 'already-claimed'
  }

  const content = bookingConfirmation({
    name: booking.lead.name,
    sessionLabel: sessionLabelFor(booking),
    startsAt: booking.slot.startsAt,
    endsAt: booking.slot.endsAt,
    meetingUrl: booking.meetingUrl,
  })

  const result = await sendEmail({
    to: booking.lead.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: siteConfig.contact.email,
    ...(opts.force === true ? {} : { idempotencyKey: confirmationKey(booking.id) }),
  })

  if (result.ok) {
    console.info(`${LOG} booking=${booking.id} confirmation sent`)
    return 'sent'
  }

  /**
   * Unknown fate: the request timed out and was aborted, but an abort is not
   * proof of non-delivery. KEEP the claim. Releasing it here is precisely what
   * used to put a second identical confirmation in the client's inbox, and a
   * human can always release it deliberately via resendConfirmation(id,
   * { force: true }) once they know the client received nothing.
   */
  if (result.indeterminate === true) {
    logConfirmationUnsent(
      booking.id,
      'send-unknown',
      `${result.error ?? 'timed out'}; claim KEPT to prevent a duplicate — resendConfirmation('${booking.id}', { force: true }) after checking with the client`,
    )
    return 'unknown'
  }

  /**
   * Definitively not delivered, so the work is handed back. The claim is only
   * ever released by the process that won it, immediately after its own send
   * failed, so an unconditional clear here cannot wipe out anybody else's
   * claim. Note that this only helps a caller that arrives LATER — see the
   * header: nothing retries on its own.
   */
  await releaseConfirmationClaim(booking.id)
  logConfirmationUnsent(
    booking.id,
    'send-failed',
    `${result.error ?? 'skipped'}; claim released, but nothing retries automatically — resendConfirmation('${booking.id}')`,
  )
  return 'failed'
}

async function releaseConfirmationClaim(bookingId: string): Promise<void> {
  try {
    await prisma.booking.updateMany({
      where: { id: bookingId },
      data: { confirmationEmailSentAt: null },
    })
  } catch (error) {
    console.error(`${LOG} booking=${bookingId} could not release the confirmation claim`, error)
  }
}

/** The internal heads-up, to the single published contact address. */
async function sendOwnerAlert(booking: FulfilmentBooking): Promise<void> {
  const claim = await prisma.booking.updateMany({
    where: { id: booking.id, ownerAlertSentAt: null },
    data: { ownerAlertSentAt: new Date() },
  })

  if (claim.count === 0) {
    console.info(`${LOG} booking=${booking.id} owner alert already claimed; nothing to do`)
    return
  }

  const content = ownerAlert({
    kind: 'CALL',
    name: booking.lead.name,
    email: booking.lead.email,
    phone: booking.lead.phone,
    company: booking.lead.company,
    message: booking.lead.message,
    sessionLabel: sessionLabelFor(booking),
    startsAt: booking.slot.startsAt,
  })

  const result = await sendEmail({
    to: ownerAlertRecipient,
    subject: content.subject,
    html: content.html,
    text: content.text,
    // Replying to the alert should reach the client, not us.
    replyTo: booking.lead.email,
    idempotencyKey: ownerAlertKey(booking.id),
  })

  if (result.ok) {
    console.info(`${LOG} booking=${booking.id} owner alert sent`)
    return
  }

  // Same rule as the confirmation: an unknown outcome keeps its claim, so the
  // owner is never alerted twice about one booking.
  if (result.indeterminate === true) {
    console.error(
      `${LOG} booking=${booking.id} ${OWNER_ALERT_UNSENT_MARKER} reason=send-unknown — ` +
        `${result.error ?? 'timed out'}; claim KEPT to prevent a duplicate`,
    )
    return
  }

  await releaseOwnerAlertClaim(booking.id)
  console.error(
    `${LOG} booking=${booking.id} ${OWNER_ALERT_UNSENT_MARKER} reason=send-failed — ` +
      `${result.error ?? 'skipped'}; claim released, but nothing retries automatically`,
  )
}

async function releaseOwnerAlertClaim(bookingId: string): Promise<void> {
  try {
    await prisma.booking.updateMany({
      where: { id: bookingId },
      data: { ownerAlertSentAt: null },
    })
  } catch (error) {
    console.error(`${LOG} booking=${bookingId} could not release the owner alert claim`, error)
  }
}

/**
 * Runs one side effect in its own blast radius.
 *
 * The steps are independent by design: a confirmation that cannot be sent is
 * exactly the situation in which the owner alert matters most, so it must not
 * be skipped because the step before it threw.
 */
async function runStep(bookingId: string, step: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (error) {
    console.error(`${LOG} booking=${bookingId} ${step} step failed unexpectedly`, error)
  }
}

/**
 * Everything that must happen once a call is booked.
 *
 * Idempotent and safe to call concurrently: call it from the booking route,
 * from an admin retry, or from both at once. Each side effect happens exactly
 * once across all of those calls.
 *
 * Never throws.
 */
export type FulfilmentHold = { readonly reason: string }

export async function fulfilBooking(
  bookingId: string,
  opts: { readonly hold?: FulfilmentHold } = {},
): Promise<void> {
  try {
    const booking = await loadBooking(bookingId)

    if (booking === null) {
      console.error(`${LOG} booking=${bookingId} not found; nothing to fulfil`)
      return
    }

    /**
     * A CONFIRMED booking is the thing worth confirming. There is no payment to
     * wait for — a booking is CONFIRMED the moment it is created — so the only
     * state that must never reach the client's inbox is a cancelled one.
     */
    if (booking.status === 'CANCELLED') {
      console.error(`${LOG} booking=${bookingId} is cancelled; refusing to fulfil`)
      return
    }

    /**
     * Meeting link BEFORE the confirmation, because the confirmation carries it.
     * Failure here is not fatal: the client still gets a confirmation, just with
     * the fallback link from admin settings (or none, which the template omits).
     */
    const meetingUrl = await claimMeeting(booking)

    await runStep(bookingId, 'confirmation', async () => {
      if (opts.hold !== undefined) {
        // Something is wrong enough that auto-confirming would be a lie — the
        // session was taken from under us, say. The owner alert still fires and
        // the booking is visible in the admin. The confirmation claim is
        // deliberately left unspent so the message can still go out once the
        // human has sorted it out.
        logConfirmationUnsent(bookingId, 'withheld', `${opts.hold.reason}. Needs a human.`)
        return
      }
      // The row was read before the meeting link was minted, so hand the fresh
      // link to the template rather than the stale column.
      await deliverConfirmation({ ...booking, meetingUrl })
    })

    // Independent claim and independent blast radius, so neither a withheld nor
    // an exploding confirmation can suppress the alert.
    await runStep(bookingId, 'owner-alert', () => sendOwnerAlert(booking))
  } catch (error) {
    // The client has already been told they are booked. Whatever went wrong
    // here, it does not get to fail the caller's request. Alert on this line.
    console.error(`${LOG} booking=${bookingId} UNEXPECTED fulfilment failure`, error)
  }
}

/**
 * Re-attempt the confirmation email for one booking.
 *
 * ⚠ NO SCHEDULED RETRY EXISTS YET. Nothing in this codebase re-runs fulfilment
 * on a timer, a queue or a cron. A confirmation that ends up unsent stays
 * unsent until someone calls this — from an admin action, a one-off script, or
 * a REPL. That is deliberate for now (an automatic retry that cannot tell
 * "sent" from "maybe sent" is exactly how a client gets two of them), but it
 * makes CONFIRMATION_UNSENT an alert a human has to act on rather than a
 * warning that clears itself.
 *
 * Idempotent. It respects the same one-shot claim as the automatic path: if the
 * confirmation has already been claimed — because it was sent, or because its
 * fate is unknown — this reports 'already-claimed' and sends nothing, however
 * many times it is called. The stable idempotency key means even Resend would
 * refuse to deliver a second copy.
 *
 * { force: true } is the human override, for when someone has established that
 * the client really did receive nothing: it clears the claim and sends without
 * the idempotency key. It is the only path in this module that can put two
 * confirmations in one inbox, so it belongs behind a person, never behind a
 * timer.
 *
 * Never throws.
 */
export async function resendConfirmation(
  bookingId: string,
  opts: { readonly force?: boolean } = {},
): Promise<ResendConfirmationResult> {
  try {
    const booking = await loadBooking(bookingId)

    if (booking === null) {
      console.error(`${LOG} booking=${bookingId} not found; cannot resend the confirmation`)
      return { status: 'booking-not-found' }
    }

    if (booking.status === 'CANCELLED') {
      console.error(
        `${LOG} booking=${bookingId} is cancelled; refusing to resend the confirmation`,
      )
      return { status: 'cancelled' }
    }

    // A confirmation is worth very little without a link, and the usual reason
    // for calling this is that Google was down the first time round.
    const meetingUrl = booking.meetingUrl ?? (await claimMeeting(booking))

    if (opts.force === true) {
      /**
       * Deliberately spend the previous claim. This is not atomic with the
       * re-claim below, which is fine: a racing caller would take the claim and
       * send the confirmation itself, and the message still goes out once.
       */
      console.warn(
        `${LOG} booking=${bookingId} FORCED confirmation resend — releasing the one-shot claim on a human's say-so`,
      )
      await releaseConfirmationClaim(bookingId)
    }

    const status = await deliverConfirmation(
      { ...booking, meetingUrl },
      opts.force === true ? { force: true } : {},
    )
    console.info(`${LOG} booking=${bookingId} resendConfirmation → ${status}`)
    return { status }
  } catch (error) {
    /**
     * 'unknown', not 'failed': this can only be reached after the claim may
     * already have been taken and the message may already have gone out, and
     * telling an operator "not sent" when we do not know is how they end up
     * forcing a duplicate.
     */
    console.error(`${LOG} booking=${bookingId} UNEXPECTED resendConfirmation failure`, error)
    return { status: 'unknown' }
  }
}
