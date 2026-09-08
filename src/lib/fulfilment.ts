/**
 * Post-payment fulfilment: invoice number, confirmation email, owner alert.
 *
 * ── WHY THIS IS SHAPED THE WAY IT IS ────────────────────────────────────────
 *
 * Two callers run this, and they WILL race:
 *
 *   - the Razorpay webhook (src/app/api/razorpay/webhook), and
 *   - the browser callback (src/app/api/checkout/verify),
 *
 * often within the same second, sometimes on two different lambdas, and either
 * one can arrive first. Razorpay also retries a webhook it thinks failed, so
 * "exactly once" has to survive being called an arbitrary number of times.
 *
 * So there is no "has this been fulfilled?" flag, because a flag is read and
 * then acted on, and both racers read `false` before either writes `true`.
 * Instead EACH side effect is claimed separately with a conditional write:
 *
 *     UPDATE "Booking" SET <col> = now() WHERE id = $1 AND <col> IS NULL
 *
 * The database decides the winner. `count === 1` means this process owns that
 * one side effect and must perform it; `count === 0` means the other side
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
 *      confirmations in a paying client's inbox cannot be taken back.
 *
 *   2. NOTHING RETRIES. "Released for retry" described a mechanism that does
 *      not exist — there is no queue, no cron, no scheduled re-run, and the
 *      other racer has usually already exited by the time the release lands.
 *      A released claim only helps a caller that happens to arrive later
 *      (a Razorpay webhook retry, or a human calling resendConfirmation()).
 *
 * So every unsent confirmation — withheld, failed, or unknown — is logged at
 * error level with the booking id and the marker CONFIRMATION_UNSENT, and the
 * owner alert still fires so a human learns the client was not written to.
 * `grep CONFIRMATION_UNSENT` is the operator's list of clients who paid and
 * may be sitting in silence. See resendConfirmation() for the way back.
 *
 * ── AND IT NEVER THROWS ─────────────────────────────────────────────────────
 *
 * The payment has already happened by the time this runs. Nothing in here —
 * a Resend outage, a sequence error, a malformed row — may propagate into the
 * caller and turn a captured payment into a 500. Everything is caught and
 * logged; the markers below are what an operator alerts on. Each side effect
 * is guarded separately too, so a confirmation that blows up cannot take the
 * owner alert down with it.
 */

import { siteConfig } from '@/config/site'
import { bookingConfirmation, ownerAlert, ownerAlertRecipient } from '@/lib/email-templates'
import { sendEmail } from '@/lib/email'
import { claimInvoiceNumber } from '@/lib/invoice'
import { createMeetingEvent, isGoogleCalendarConfigured } from '@/lib/google-calendar'
import { prisma } from '@/lib/prisma'
import { SETTING_KEYS } from '@/components/admin/shell'

const LOG = '[fulfilment]'

/**
 * Sentinel written into googleEventId while the Calendar call is in flight.
 *
 * The claim has to be taken BEFORE the event id exists, otherwise the webhook
 * and the browser callback both call Google and the client is invited to two
 * meetings. Same shape as the email claims in this file: claim, act, and put
 * the claim back if the action failed so a retry can pick it up.
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

  const details = await createMeetingEvent({
    summary: `${booking.consultationType.name} — ${siteConfig.name} × ${booking.lead.name}`,
    description: [
      `${booking.consultationType.name} (${booking.consultationType.durationMins} min)`,
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
    // Release the claim so a webhook retry or an admin resend can try again.
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
 *   grep CONFIRMATION_UNSENT  — a paying client was not (or may not have been)
 *                               written to; the reason= field says which.
 *   grep OWNER_ALERT_UNSENT   — nobody internal was told about the booking.
 */
export const CONFIRMATION_UNSENT_MARKER = 'CONFIRMATION_UNSENT'
export const OWNER_ALERT_UNSENT_MARKER = 'OWNER_ALERT_UNSENT'

/**
 * Why a confirmation did not go out.
 *
 *   withheld             — caller asked for a hold; auto-confirming would lie.
 *   invoice-not-allotted — the serial could not be claimed, so the email would
 *                          have carried no invoice number.
 *   send-failed          — definitively not delivered. The claim was released,
 *                          so a later caller may try again.
 *   send-unknown         — timed out and was aborted; delivery is unknown. The
 *                          claim was KEPT, because releasing it is what sends a
 *                          second copy. Only a human clears this one.
 */
type UnsentReason = 'withheld' | 'invoice-not-allotted' | 'send-failed' | 'send-unknown'

/** What happened to a confirmation attempt. */
export type ConfirmationStatus =
  | 'sent'
  | 'already-claimed'
  | 'withheld'
  | 'failed'
  | 'unknown'
  | 'booking-not-found'
  | 'not-paid'

export type ResendConfirmationResult = {
  readonly status: ConfirmationStatus
  readonly invoiceNumber: string | null
}

/** Booking plus everything the templates need, in one round trip. */
async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: { lead: true, slot: true, consultationType: true },
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
 * Claims the invoice number and returns it.
 *
 * claimInvoiceNumber() is idempotent and opens its OWN transaction, so it is
 * called here — outside any transaction of ours — exactly as its contract
 * requires. A failure is logged and fulfilment continues: the owner alert still
 * goes out, and the confirmation is held rather than sent without a number.
 */
async function claimInvoice(bookingId: string): Promise<string | null> {
  try {
    const claim = await claimInvoiceNumber(bookingId)
    return claim.invoiceNumber
  } catch (error) {
    console.error(`${LOG} booking=${bookingId} INVOICE CLAIM FAILED`, error)
    return null
  }
}

/**
 * The confirmation that goes to the client: what they booked, when, the GST
 * breakdown as charged, and the invoice number.
 *
 * The invoice number is a precondition, not a nicety. The confirmation claim is
 * one-shot, so sending a numberless confirmation spends the only chance the
 * client had of ever receiving a correct one — they would be left holding a
 * confirmation with no invoice reference and no way to be sent a better one.
 * If the serial could not be allotted the claim is left untouched, and the
 * message goes out once, complete, when someone re-runs this.
 *
 * `force` drops the idempotency key so a human-ordered resend is not collapsed
 * onto the earlier attempt by Resend.
 */
async function deliverConfirmation(
  booking: FulfilmentBooking,
  invoiceNumber: string | null,
  opts: { readonly force?: boolean } = {},
): Promise<ConfirmationStatus> {
  const effectiveInvoiceNumber = invoiceNumber ?? booking.invoiceNumber

  if (effectiveInvoiceNumber === null) {
    logConfirmationUnsent(
      booking.id,
      'invoice-not-allotted',
      'no invoice serial; the confirmation claim was left unspent so it can go out once, with the number on it',
    )
    return 'withheld'
  }

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
    consultationName: booking.consultationType.name,
    startsAt: booking.slot.startsAt,
    durationMins: booking.consultationType.durationMins,
    meetingUrl: booking.meetingUrl,
    invoiceNumber: effectiveInvoiceNumber,
    gst: {
      taxablePaise: booking.taxablePaise,
      cgstPaise: booking.cgstPaise,
      sgstPaise: booking.sgstPaise,
      igstPaise: booking.igstPaise,
      totalPaise: booking.totalPaise,
      gstRatePercent: booking.gstRatePercent,
      isInterState: booking.isInterState,
    },
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
    kind: 'CONSULTATION',
    name: booking.lead.name,
    email: booking.lead.email,
    phone: booking.lead.phone,
    company: booking.lead.company,
    message: booking.lead.message,
    consultationName: booking.consultationType.name,
    startsAt: booking.slot.startsAt,
    amount: booking.totalPaise,
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
 * Everything that must happen once a booking is paid.
 *
 * Idempotent and safe to call concurrently: call it from the webhook, from the
 * browser callback, from both at once, or from an admin retry. Each side effect
 * happens exactly once across all of those calls.
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
     * The guard that keeps an unpaid booking out of the client's inbox. Both
     * callers claim the PAID transition before calling this, so an unpaid row
     * here means something is wrong upstream and it is worth saying so loudly
     * rather than confirming a consultation nobody paid for.
     */
    if (booking.paidAt === null) {
      console.error(`${LOG} booking=${bookingId} is not paid; refusing to fulfil`)
      return
    }

    /**
     * Invoice first: the confirmation email carries the number.
     *
     * The invoice is claimed even when the confirmation is withheld. The money
     * moved, so the GST liability exists and a serial must be allotted — the
     * open question is what to tell the customer, not whether tax is due.
     */
    const invoiceNumber = await claimInvoice(bookingId)

    /**
     * Meeting link BEFORE the confirmation, because the confirmation carries it.
     * Failure here is not fatal: the client still gets a confirmation, just with
     * the fallback link from admin settings (or none, which the template omits).
     */
    const meetingUrl = await claimMeeting(booking)

    await runStep(bookingId, 'confirmation', async () => {
      if (opts.hold !== undefined) {
        // Something is wrong enough that auto-confirming would be a lie: the
        // slot was resold, or the gateway's amount disagrees with what we
        // priced. The owner alert still fires, and the booking is flagged in
        // the admin. The confirmation claim is deliberately left unspent so the
        // message can still go out once the human has sorted it out.
        logConfirmationUnsent(
          bookingId,
          'withheld',
          `${opts.hold.reason}. Invoice ${invoiceNumber ?? '(not allotted)'} issued; needs a human.`,
        )
        return
      }
      await deliverConfirmation(booking, invoiceNumber)
    })

    // Independent claim and independent blast radius, so neither a withheld nor
    // an exploding confirmation can suppress the alert.
    await runStep(bookingId, 'owner-alert', () => sendOwnerAlert(booking))
  } catch (error) {
    // The payment already succeeded. Whatever went wrong here, it does not get
    // to fail the caller's request. Alert on this line.
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
 * Idempotent. It claims the invoice number if one is still missing (that call
 * is itself idempotent), and then respects the same one-shot claim as the
 * automatic path: if the confirmation has already been claimed — because it was
 * sent, or because its fate is unknown — this reports 'already-claimed' and
 * sends nothing, however many times it is called. The stable idempotency key
 * means even Resend would refuse to deliver a second copy.
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
      return { status: 'booking-not-found', invoiceNumber: null }
    }

    if (booking.paidAt === null) {
      console.error(`${LOG} booking=${bookingId} is not paid; refusing to resend the confirmation`)
      return { status: 'not-paid', invoiceNumber: booking.invoiceNumber }
    }

    // A confirmation held because the serial could not be allotted is the main
    // reason this function is called, so try to allot it again first.
    const invoiceNumber = booking.invoiceNumber ?? (await claimInvoice(bookingId))

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
      booking,
      invoiceNumber,
      opts.force === true ? { force: true } : {},
    )
    console.info(`${LOG} booking=${bookingId} resendConfirmation → ${status}`)
    return { status, invoiceNumber }
  } catch (error) {
    /**
     * 'unknown', not 'failed': this can only be reached after the claim may
     * already have been taken and the message may already have gone out, and
     * telling an operator "not sent" when we do not know is how they end up
     * forcing a duplicate.
     */
    console.error(`${LOG} booking=${bookingId} UNEXPECTED resendConfirmation failure`, error)
    return { status: 'unknown', invoiceNumber: null }
  }
}
