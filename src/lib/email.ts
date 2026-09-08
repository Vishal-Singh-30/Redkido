/**
 * Transactional email transport.
 *
 * Design rule: **email may never break a payment.**
 *
 *  - With no RESEND_API_KEY the module no-ops. It logs once at info level and
 *    returns { ok: false, skipped: true } so local dev and preview builds run
 *    with no key at all.
 *  - sendEmail() NEVER throws. Every path — bad input, missing dependency,
 *    Resend outage, network hang — resolves to a result object. A caller inside
 *    a payment flow can `await` it and carry on regardless of the outcome.
 *  - The Resend client is constructed lazily inside the function, never at
 *    module load, so importing this file costs nothing and cannot crash a build.
 *
 * ── A SEND HAS THREE OUTCOMES, NOT TWO ──────────────────────────────────────
 *
 * `ok: false` used to mean "this did not go out", and callers act on it: the
 * fulfilment path releases its one-shot email claim so the work can be redone.
 * That is only sound when the failure is DEFINITIVE, and the 10s timeout is
 * not. A slow send that Resend ultimately accepts loses the race, the caller is
 * told it failed, the claim is released, and the next caller sends the SAME
 * message again — two identical confirmations in a paying client's inbox.
 *
 * So a timeout now does two things:
 *
 *   1. It ABORTS the request. An AbortSignal is handed to the SDK, which
 *      spreads its request-options object straight into the underlying
 *      `fetch()` init, so the HTTP request is really cancelled rather than
 *      merely abandoned.
 *   2. It still reports `indeterminate: true` rather than a plain failure.
 *      Two reasons, and either one alone would be enough: the SDK's published
 *      request-options type names only `query`, `headers` and `idempotencyKey`,
 *      so nothing in its contract PROMISES to forward a signal; and even a
 *      genuinely cancelled request may already have been accepted at the far
 *      end, because a TCP reset does not un-queue an email. An abort narrows
 *      the window, it does not close it.
 *
 * A caller holding a one-shot claim must therefore treat `indeterminate` as
 * "do not release". Losing one email is a support ticket someone can fix;
 * sending two automatically cannot be undone.
 *
 * `idempotencyKey` closes the same loop from the other side. Resend collapses
 * repeat requests carrying the same key onto the first one, so a caller that
 * re-attempts a send whose fate it does not know cannot deliver twice. Callers
 * that must genuinely re-send (a human who has confirmed the client received
 * nothing) simply omit the key.
 */

import { siteConfig } from '@/config/site'

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
  /**
   * Stable per-message key, e.g. `booking-confirmation:<id>`. Resend returns
   * the original result for a repeat request carrying the same key instead of
   * sending a second copy. Omit it to force a genuinely new send.
   */
  idempotencyKey?: string
}

/**
 * `sent`          — Resend accepted the message.
 * `skipped`       — no API key; nothing was attempted and nothing was sent.
 * `failed`        — definitively not sent (rejected, invalid, unreachable).
 * `indeterminate` — it may or may not have been sent. Do not release a claim.
 */
export type SendEmailOutcome = 'sent' | 'skipped' | 'failed' | 'indeterminate'

export type SendEmailResult = {
  /** True only when Resend accepted the message. */
  ok: boolean
  outcome: SendEmailOutcome
  id?: string
  skipped?: boolean
  /**
   * Set when the outcome is unknown — the request timed out and was aborted,
   * but an abort is not proof of non-delivery. A caller that consumed a
   * one-shot claim to make this send MUST NOT release it: releasing is what
   * lets a second, duplicate copy go out.
   */
  indeterminate?: boolean
  error?: string
}

/** Minimal structural view of the Resend SDK — keeps this file free of `any`. */
type ResendSendPayload = {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

/**
 * The SDK's second argument. `idempotencyKey` is part of its published type;
 * `signal` is not, but the SDK spreads this whole object into the `fetch()`
 * init, so a signal does reach the transport. Declaring it here keeps the call
 * type-checked at our boundary — and because the SDK does not guarantee this,
 * sendEmail() never downgrades a timeout to a definitive failure.
 */
type ResendSendOptions = {
  idempotencyKey?: string
  signal?: AbortSignal
}

type ResendSendResponse = {
  data: { id?: string } | null
  error: { message?: string; name?: string } | null
}

type ResendLike = {
  emails: {
    send(payload: ResendSendPayload, options?: ResendSendOptions): Promise<ResendSendResponse>
  }
}

/** Operator-facing log/diagnostic strings. Never rendered to a user. */
const diagnostics = {
  skipped: '[email] RESEND_API_KEY is not set — transactional email is disabled (no-op).',
  noRecipients: 'No valid recipient address',
  emptySubject: 'Subject is empty',
  emptyBody: 'Email body is empty',
  clientUnavailable: 'Resend client could not be loaded',
  timedOut: 'Resend request timed out and was aborted; delivery is unknown',
  unknown: 'Unknown email error',
  sendFailedPrefix: '[email] send failed:',
  abandonedPrefix: '[email] abandoned send',
} as const

/** A single request may not hang a checkout handler. */
const SEND_TIMEOUT_MS = 10_000

/** Resend rejects an idempotency key longer than this. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 256

/** Resolved by the timer, and by nothing else — no send can produce this value. */
const TIMED_OUT: unique symbol = Symbol('email.send.timeout')

/** "someone@example.com" */
const BARE_ADDRESS = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
/** "Display Name <someone@example.com>" — the only shape Resend accepts. */
const NAMED_ADDRESS = /^[^<>@]+\s*<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>$/

let loggedMissingKey = false
let cachedClient: { apiKey: string; client: ResendLike } | null = null

function readApiKey(): string {
  const raw = process.env.RESEND_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

export function isEmailConfigured(): boolean {
  return readApiKey().length > 0
}

/**
 * Resend rejects a bare address in `from`. EMAIL_FROM should already be in the
 * "Name <hello@domain.com>" form; if it is a bare address we wrap it with the
 * site name rather than failing the send, and if it is missing or malformed we
 * fall back to the configured contact address.
 */
export function resolveFromAddress(): string {
  const fallback = `${siteConfig.name} <${siteConfig.contact.email}>`
  const raw = typeof process.env.EMAIL_FROM === 'string' ? process.env.EMAIL_FROM.trim() : ''
  if (!raw) return fallback
  if (NAMED_ADDRESS.test(raw)) return raw
  if (BARE_ADDRESS.test(raw)) return `${siteConfig.name} <${raw}>`
  return fallback
}

function normaliseRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to]
  const seen = new Set<string>()
  for (const entry of list) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!BARE_ADDRESS.test(trimmed)) continue
    seen.add(trimmed.toLowerCase())
  }
  return Array.from(seen)
}

/**
 * A malformed key must never cost us the email, so anything unusable is simply
 * dropped and the send goes out without idempotency protection.
 */
function normaliseIdempotencyKey(key: string | undefined): string | undefined {
  if (typeof key !== 'string') return undefined
  const trimmed = key.trim()
  if (!trimmed || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) return undefined
  return trimmed
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return diagnostics.unknown
}

/** Result constructors, so the four outcomes can never disagree with themselves. */
function sentResult(id: string | undefined): SendEmailResult {
  return { ok: true, outcome: 'sent', ...(id ? { id } : {}) }
}

function failedResult(error: string): SendEmailResult {
  return { ok: false, outcome: 'failed', error }
}

function skippedResult(): SendEmailResult {
  return { ok: false, outcome: 'skipped', skipped: true }
}

function indeterminateResult(error: string): SendEmailResult {
  return { ok: false, outcome: 'indeterminate', indeterminate: true, error }
}

/** Constructs (and memoises) the SDK client. Returns null instead of throwing. */
async function getClient(apiKey: string): Promise<ResendLike | null> {
  if (cachedClient && cachedClient.apiKey === apiKey) return cachedClient.client
  try {
    const mod = await import('resend')
    const client = new mod.Resend(apiKey) as unknown as ResendLike
    cachedClient = { apiKey, client }
    return client
  } catch (error) {
    console.error(diagnostics.sendFailedPrefix, errorMessage(error))
    return null
  }
}

/**
 * An abort handle that degrades instead of exploding.
 *
 * AbortController exists on every runtime this app targets (Node 20+, the Edge
 * runtime, browsers), but "never throws" is an absolute promise here, so a
 * missing implementation costs us the cancellation and nothing else — the
 * timeout still reports `indeterminate`, which is the outcome that keeps the
 * duplicate out of the inbox.
 */
function createAbortHandle(): { signal: AbortSignal | undefined; abort: () => void } {
  try {
    if (typeof AbortController === 'function') {
      const controller = new AbortController()
      return {
        signal: controller.signal,
        abort: () => {
          try {
            controller.abort()
          } catch {
            // An abort that fails changes nothing about the reported outcome.
          }
        },
      }
    }
  } catch {
    // Fall through to the no-op handle.
  }
  return { signal: undefined, abort: () => {} }
}

/** Always resolves — never rejects. */
async function attemptSend(
  client: ResendLike,
  payload: ResendSendPayload,
  options: ResendSendOptions,
): Promise<SendEmailResult> {
  try {
    const response = await client.emails.send(payload, options)
    if (response.error) {
      const message = response.error.message ?? response.error.name ?? diagnostics.unknown
      console.error(diagnostics.sendFailedPrefix, message)
      return failedResult(message)
    }
    const id = response.data?.id
    return sentResult(typeof id === 'string' && id ? id : undefined)
  } catch (error) {
    const message = errorMessage(error)
    console.error(diagnostics.sendFailedPrefix, message)
    return failedResult(message)
  }
}

/**
 * Report what the request we stopped waiting for eventually did.
 *
 * The caller has already been told `indeterminate`, so this changes no
 * decision; it exists so an operator can find out after the fact whether the
 * message actually went out. Best effort only — a serverless instance may be
 * frozen the moment the response is returned. Both handlers are attached, so
 * an abandoned send can never surface as an unhandled rejection.
 */
function reportAbandonedSend(pending: Promise<SendEmailResult>, label: string): void {
  void pending.then(
    (late) => {
      if (late.ok) {
        console.error(
          `${diagnostics.abandonedPrefix} ${label} WAS DELIVERED after the ${SEND_TIMEOUT_MS}ms timeout (id=${late.id ?? 'unknown'})`,
        )
        return
      }
      console.info(
        `${diagnostics.abandonedPrefix} ${label} did not complete: ${late.error ?? diagnostics.unknown}`,
      )
    },
    (error) => {
      console.error(diagnostics.sendFailedPrefix, errorMessage(error))
    },
  )
}

/**
 * Sends one transactional email.
 *
 * Resolves to { ok: false, skipped: true } when no API key is configured, to
 * { ok: false, outcome: 'failed', error } when the message definitively did not
 * go out, and to { ok: false, outcome: 'indeterminate', indeterminate: true }
 * when the request timed out and delivery is unknown. It never throws and never
 * rejects, so a payment handler can fire it without a try/catch and without
 * risking a rollback.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const apiKey = readApiKey()
    if (!apiKey) {
      if (!loggedMissingKey) {
        loggedMissingKey = true
        console.info(diagnostics.skipped)
      }
      return skippedResult()
    }

    const to = normaliseRecipients(input.to)
    if (to.length === 0) return failedResult(diagnostics.noRecipients)

    const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
    if (!subject) return failedResult(diagnostics.emptySubject)

    const html = typeof input.html === 'string' ? input.html : ''
    const text = typeof input.text === 'string' ? input.text : ''
    if (!html.trim() && !text.trim()) return failedResult(diagnostics.emptyBody)

    const client = await getClient(apiKey)
    if (!client) return failedResult(diagnostics.clientUnavailable)

    const replyTo =
      typeof input.replyTo === 'string' && BARE_ADDRESS.test(input.replyTo.trim())
        ? input.replyTo.trim()
        : undefined

    const payload: ResendSendPayload = {
      from: resolveFromAddress(),
      to,
      subject,
      html: html.trim() ? html : `<pre>${text}</pre>`,
      text: text.trim() ? text : subject,
      ...(replyTo ? { replyTo } : {}),
    }

    const idempotencyKey = normaliseIdempotencyKey(input.idempotencyKey)
    const { signal, abort } = createAbortHandle()
    const options: ResendSendOptions = {
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(signal ? { signal } : {}),
    }

    // attemptSend never rejects, so neither the race nor the abandoned branch
    // below can produce an unhandled rejection.
    const inFlight = attemptSend(client, payload, options)
    const label = idempotencyKey ?? `subject="${subject}"`

    let timer: ReturnType<typeof setTimeout> | undefined
    let outcome: SendEmailResult | typeof TIMED_OUT
    try {
      const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), SEND_TIMEOUT_MS)
      })
      outcome = await Promise.race([inFlight, expiry])
    } catch (error) {
      /**
       * Unreachable in practice — neither promise in the race can reject — but
       * the rule that matters is the one this branch encodes: once the request
       * is in flight, failing to OBSERVE it is never proof that it did not go
       * out, so it is reported as indeterminate and never as a failure.
       */
      abort()
      reportAbandonedSend(inFlight, label)
      const message = errorMessage(error)
      console.error(diagnostics.sendFailedPrefix, message)
      return indeterminateResult(message)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }

    if (outcome !== TIMED_OUT) return outcome

    /**
     * Cancel the request rather than leave it running: an aborted request is
     * far less likely to be delivered behind our back. It is still reported as
     * indeterminate — see the header — so the claim that paid for this send
     * stays held and no second copy can follow.
     */
    abort()
    reportAbandonedSend(inFlight, label)
    console.error(diagnostics.sendFailedPrefix, diagnostics.timedOut)
    return indeterminateResult(diagnostics.timedOut)
  } catch (error) {
    // Belt and braces: nothing above should throw, and if it somehow does the
    // caller still gets a result rather than an exception. This path is a
    // definitive failure — nothing was handed to the transport.
    const message = errorMessage(error)
    console.error(diagnostics.sendFailedPrefix, message)
    return failedResult(message)
  }
}
