'use client'

/**
 * Funnel 2 — booking a free call.
 *
 * ── IT WORKS WITHOUT JAVASCRIPT ─────────────────────────────────────────────
 * This is the product now, so it may not be a form that only runs when a
 * bundle does. Every control here is a real HTML control:
 *
 *   - the day strip is a row of LINKS to /book?date=YYYY-MM-DD, so a click
 *     without JS is a page navigation that renders that day server-side;
 *   - the times are real RADIO INPUTS, so selection, keyboard support and the
 *     posted value are all the browser's job rather than ours;
 *   - the chosen-time highlight is CSS (`has-[:checked]`), not React state, so
 *     the picker looks the same whether or not anything hydrated;
 *   - the <form> has a real method and action, so submitting it without JS
 *     posts to /api/book, which answers a native post with a 303 redirect.
 *
 * With JS, all of that is intercepted: days switch in place, the submit posts
 * JSON, and a lost race refreshes the day instead of reloading the page.
 *
 * `noValidate` is set in an effect rather than in the markup — see the comment
 * on it below. It is the one piece of this file where the two paths differ on
 * purpose.
 *
 * ── WHAT THIS COMPONENT MAY NOT DO ──────────────────────────────────────────
 * There is no price, no total, no summary panel and no payment step. The call
 * is free; the only thing being chosen is a time.
 *
 * ── THE TYPES COME FROM THE SERVER, THE FORMATTING DOES TOO ─────────────────
 * `import type` from '@/lib/slots' is erased at compile time, so the Prisma
 * client never reaches this bundle. Every label — the day names, the time
 * ranges — is formatted in Asia/Kolkata on the server and arrives as a string,
 * so this file ships no Intl formatter and cannot disagree with the server
 * about what day a 23:30 IST session falls on.
 *
 * All copy comes from src/content/booking.ts.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/site/Icons'
import { bookingContent } from '@/content/booking'
import type { AvailableDay, AvailableSlot } from '@/lib/slots'

const BOOK_PATH = '/book'
const SUCCESS_PATH = '/book/success'
const BOOK_ENDPOINT = '/api/book'
const SLOTS_ENDPOINT = '/api/slots'
const ENQUIRY_HREF = '/#contact'

/** Machine codes from /api/book and /api/slots. Protocol, not copy. */
const API_CODE = {
  validation: 'VALIDATION',
  slotUnavailable: 'SLOT_UNAVAILABLE',
  rateLimited: 'RATE_LIMITED',
} as const

/** Mirrors the bounds in src/lib/validation.ts so both reject the same input. */
const NAME_MIN = 2

const { picker, fields, details, errors } = bookingContent

type FieldErrors = Record<string, string>

type BookResponse = {
  ok?: boolean
  code?: string
  reason?: 'TAKEN' | 'PAST' | 'NOT_FOUND'
  fieldErrors?: FieldErrors
}

type SessionsResponse = {
  ok?: boolean
  date?: string
  sessions?: AvailableSlot[]
}

type DaysResponse = {
  ok?: boolean
  days?: AvailableDay[]
}

/* ──────────────────────────────── markup ────────────────────────────────── */

const labelClass = 'flex items-baseline justify-between gap-3 text-[13.5px] font-semibold'
const optionalClass = 'text-[12px] font-normal not-italic text-muted-2'
const controlClass =
  'w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-muted-2 focus:border-red focus:ring-2 focus:ring-red/20 aria-[invalid=true]:border-red'
const hintClass = 'text-[12.5px] text-muted'
const errorClass = 'text-[12.5px] font-medium text-red'

/**
 * Picker surfaces. Every value is an existing token — --red for the chosen
 * fill, --card-2 for hover, --line / --line-strong for the resting edge — so
 * the picker reads as part of the same page rather than a widget dropped on it.
 * The focus ring is offset against --card, the form's own background, so it
 * stays visible on the red fill too.
 */
const chosenFill =
  'border-red bg-red text-white shadow-[0_8px_20px_-10px_rgba(232,54,43,0.8)]'
const restingFill = 'border-line bg-bg hover:border-line-strong hover:bg-card-2'
const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-red/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card'

/**
 * `relative` is load-bearing: the chip carries an sr-only session count, sr-only
 * is position:absolute, and without a positioned chip its containing block
 * becomes the wrapper OUTSIDE the horizontal scroller — which means the
 * scroller cannot clip it and the whole PAGE gains a sideways scrollbar the
 * width of the strip.
 */
const dayChipClass = `relative flex w-[64px] shrink-0 snap-start flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition duration-200 ${focusRing}`

/**
 * The chosen-time styling is driven by :has(:checked) rather than by React, so
 * the highlight follows the radio the browser actually checked — with or
 * without JavaScript, and including a value the browser restored on a back
 * navigation.
 */
const timeRowClass =
  'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-bg px-3.5 py-3 text-[14.5px] text-ink transition duration-200 hover:border-line-strong hover:bg-card-2 has-[:checked]:border-red has-[:checked]:bg-red has-[:checked]:font-semibold has-[:checked]:text-white has-[:checked]:shadow-[0_8px_20px_-10px_rgba(232,54,43,0.8)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red/40 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55'

const noticeClass =
  'flex items-start gap-3 rounded-xl border border-dashed border-line-strong bg-bg-2 px-4 py-4'

function Field({
  id,
  label,
  optionalTag,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  optionalTag?: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass} htmlFor={id}>
        <span>{label}</span>
        {optionalTag ? <em className={optionalClass}>{optionalTag}</em> : null}
      </label>
      {children}
      {error ? (
        <p className={errorClass} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={hintClass} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, error: string | undefined, hint: string | undefined) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

/**
 * Arrow keys walk the day strip, Home/End jump to its ends.
 *
 * Focus only — nothing is chosen until Enter, so a keyboard user can read
 * across the strip without loading a different day on every keypress. The list
 * of times below needs none of this: it is a native radio group, and the
 * browser has done arrow keys there since 1995.
 */
function moveRovingFocus(event: KeyboardEvent<HTMLDivElement>): void {
  const { key } = event
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return

  const items = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[data-pick]')]
  const index = items.indexOf(document.activeElement as HTMLAnchorElement)
  if (items.length === 0 || index === -1) return

  event.preventDefault()
  const target =
    key === 'Home'
      ? items[0]
      : key === 'End'
        ? items[items.length - 1]
        : items[(index + (key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]

  target?.focus()
  // 'nearest' on both axes: it must never drag the page around vertically.
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export type BookingFormProps = {
  /** Every day with at least one open session, with its count. */
  days: readonly AvailableDay[]
  /** The day the server rendered, already validated against `days`. */
  initialDate: string
  /** That day's sessions, so the first paint needs no fetch. */
  initialSessions: readonly AvailableSlot[]
  /** A message from the no-JS round trip, already resolved to copy by the page. */
  initialError?: string | null
}

export function BookingForm({
  days: initialDays,
  initialDate,
  initialSessions,
  initialError = null,
}: BookingFormProps) {
  const uid = useId()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement | null>(null)

  const [days, setDays] = useState<readonly AvailableDay[]>(initialDays)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, readonly AvailableSlot[]>>(
    initialDate.length > 0 ? { [initialDate]: initialSessions } : {},
  )
  const [loadingDate, setLoadingDate] = useState<string | null>(null)
  const [dayError, setDayError] = useState<string | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(initialError)

  const fieldId = useCallback((name: string) => `${uid}-${name}`, [uid])

  const sessions = sessionsByDate[selectedDate]
  const loading = loadingDate === selectedDate
  const activeDay = days.find((day) => day.date === selectedDate)
  const selectedSlot = (sessions ?? []).find((slot) => slot.id === selectedSlotId)

  /**
   * Native validation is turned OFF only once JavaScript is running.
   *
   * With JS the form shows its own inline errors, and the browser's bubbles
   * would fire first and pre-empt them. Without JS those bubbles are the only
   * thing standing between an empty form and a 400, so the attribute must not
   * be in the server-rendered markup. Setting it here is the one honest way to
   * have both.
   */
  useEffect(() => {
    formRef.current?.setAttribute('novalidate', '')
  }, [])

  /** Loads a day the cache has not seen. Deleting a cache entry re-runs this. */
  useEffect(() => {
    if (selectedDate.length === 0) return
    if (sessionsByDate[selectedDate] !== undefined) return

    let cancelled = false
    setLoadingDate(selectedDate)

    void (async () => {
      try {
        const response = await fetch(
          `${SLOTS_ENDPOINT}?date=${encodeURIComponent(selectedDate)}`,
          { cache: 'no-store' },
        )
        const payload: SessionsResponse = await response.json().catch(() => ({}))
        if (cancelled) return

        if (response.ok && payload.ok === true && Array.isArray(payload.sessions)) {
          const fresh = payload.sessions
          setSessionsByDate((current) => ({ ...current, [selectedDate]: fresh }))
          // A refetch can retire the chosen time — do not keep posting an id
          // that is no longer on offer.
          setSelectedSlotId((current) =>
            fresh.some((slot) => slot.id === current) ? current : '',
          )
          setDayError(null)
        } else {
          setDayError(picker.dayFailed)
        }
      } catch {
        if (!cancelled) setDayError(picker.dayFailed)
      } finally {
        if (!cancelled) setLoadingDate(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedDate, sessionsByDate])

  const chooseDay = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, date: string) => {
      // Let a modified click do what the visitor asked (new tab, new window).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      if (submitting || date === selectedDate) return

      setSelectedDate(date)
      /**
       * The chosen time is scoped to the visible day, and cleared when the day
       * changes. It has to be: without JS a day is a page navigation, so the
       * radio group is rebuilt from scratch — and the two paths must not
       * disagree about what is selected.
       */
      setSelectedSlotId('')
      setDayError(null)
      setFieldErrors(({ slotId: _cleared, ...rest }) => rest)

      // Keep the URL in step so a refresh, a bookmark or a shared link lands on
      // the same day. replaceState rather than a router navigation: the page is
      // already showing this day, and re-rendering the server component to say
      // so would be a round trip for nothing.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `${BOOK_PATH}?date=${encodeURIComponent(date)}`)
      }
    },
    [selectedDate, submitting],
  )

  const chooseSlot = useCallback((slotId: string) => {
    setSelectedSlotId(slotId)
    setFieldErrors(({ slotId: _cleared, ...rest }) => rest)
    setFormError(null)
  }, [])

  /**
   * Refetches after a lost race, so the visitor picks from what is actually
   * left. Dropping the day from the cache is what triggers the load effect; the
   * strip's counts are refreshed alongside it, because the day that just filled
   * up may now have nothing on it at all.
   */
  const refreshAvailability = useCallback(async (date: string) => {
    setSessionsByDate((current) => {
      const next = { ...current }
      delete next[date]
      return next
    })

    try {
      const response = await fetch(SLOTS_ENDPOINT, { cache: 'no-store' })
      const payload: DaysResponse = await response.json().catch(() => ({}))
      if (response.ok && payload.ok === true && Array.isArray(payload.days)) {
        setDays(payload.days)
      }
    } catch {
      // The strip stays as it was; the error already shown is enough.
    }
  }, [])

  const handleFailure = useCallback(
    async (response: Response, payload: BookResponse) => {
      if (payload.code === API_CODE.validation) {
        setFieldErrors(payload.fieldErrors ?? {})
        setFormError(errors.form.validation)
        return
      }

      if (payload.code === API_CODE.slotUnavailable) {
        setFormError(
          payload.reason === 'PAST'
            ? errors.slot.past
            : payload.reason === 'NOT_FOUND'
              ? errors.slot.unavailable
              : errors.slot.taken,
        )
        setSelectedSlotId('')
        await refreshAvailability(selectedDate)
        return
      }

      if (response.status === 429 || payload.code === API_CODE.rateLimited) {
        setFormError(errors.form.rateLimited)
        return
      }

      setFormError(errors.form.generic)
    },
    [refreshAvailability, selectedDate],
  )

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      // Captured before the first await: currentTarget is cleared afterwards.
      const form = event.currentTarget
      const data = new FormData(form)
      const read = (key: string): string => {
        const value = data.get(key)
        return typeof value === 'string' ? value.trim() : ''
      }

      const name = read('name')
      const email = read('email')
      const phone = read('phone')
      const company = read('company')
      const message = read('message')
      const consent = data.get('consent') !== null
      const slot = (sessionsByDate[selectedDate] ?? []).find((one) => one.id === selectedSlotId)

      const localErrors: FieldErrors = {}
      if (name.length === 0) localErrors.name = errors.name.required
      else if (name.length < NAME_MIN) localErrors.name = errors.name.tooShort
      if (email.length === 0) localErrors.email = errors.email.required
      else if (!email.includes('@')) localErrors.email = errors.email.invalid
      if (phone.length === 0) localErrors.phone = errors.phone.required
      if (slot === undefined) localErrors.slotId = errors.slot.required
      if (!consent) localErrors.consent = errors.consent.required

      if (Object.keys(localErrors).length > 0 || slot === undefined) {
        setFieldErrors(localErrors)
        setFormError(errors.form.validation)
        return
      }

      setSubmitting(true)
      setFieldErrors({})
      setFormError(null)

      try {
        const response = await fetch(BOOK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone,
            slotId: slot.id,
            ...(company.length > 0 ? { company } : {}),
            ...(message.length > 0 ? { message } : {}),
            // Empty for a human. Declared so the strict schema accepts the key.
            website: read('website'),
            consent,
          }),
        })

        const payload: BookResponse = await response.json().catch(() => ({}))

        if (response.ok && payload.ok === true) {
          /**
           * The confirmed time comes from the session this form already has in
           * hand, not from the response — which is exactly why the response can
           * be identical for a real booking and a discarded bot submission.
           */
          const query = new URLSearchParams({ at: slot.startsAt, until: slot.endsAt })
          router.push(`${SUCCESS_PATH}?${query.toString()}`)
          return
        }

        setSubmitting(false)
        await handleFailure(response, payload)
      } catch {
        // fetch() only rejects on a transport failure, never on a 4xx/5xx.
        setSubmitting(false)
        setFormError(errors.form.network)
      }
    },
    [handleFailure, router, selectedDate, selectedSlotId, sessionsByDate],
  )

  return (
    <form
      action={BOOK_ENDPOINT}
      // min-w-0: this <form> is a grid item, and grid items default to
      // min-width:auto — they refuse to shrink below their content. The day
      // strip inside is deliberately wider than the column, so without this a
      // single wide child blows the column out and the whole page gains a
      // horizontal scrollbar. The <fieldset> below needs it for the same
      // reason (fieldsets have their own intrinsic min-width quirk).
      className="min-w-0 rounded-card border border-line bg-card p-6 shadow-[0_2px_10px_rgba(20,10,10,0.05)] sm:p-7"
      method="post"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {/* ── step 1 + 2: the day, then the time ──────────────────────────── */}
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="font-display text-[17px] font-bold">{picker.heading}</legend>
        <p className={`${hintClass} mt-2`}>{picker.timezoneNote}</p>

        {days.length === 0 ? (
          <div className={`${noticeClass} mt-4`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" name="calendar" />
            <div>
              <p className={hintClass}>{picker.empty}</p>
              <a className="mt-2 inline-block text-[12.5px] font-semibold text-red" href={ENQUIRY_HREF}>
                {picker.emptyAction}
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* The strip. Links, so a click without JS renders that day. */}
            <div
              aria-label={picker.dayGroupLabel}
              className={`mt-4 flex snap-x snap-proximity gap-2 overflow-x-auto p-1 [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin] ${
                submitting ? 'pointer-events-none opacity-55' : ''
              }`}
              onKeyDown={moveRovingFocus}
              role="group"
            >
              {days.map((day) => {
                const chosen = day.date === selectedDate
                const quiet = chosen ? 'text-white/75' : 'text-muted-2'

                return (
                  <a
                    aria-current={chosen ? 'date' : undefined}
                    className={`${dayChipClass} ${chosen ? chosenFill : restingFill}`}
                    data-pick=""
                    href={`${BOOK_PATH}?date=${encodeURIComponent(day.date)}`}
                    key={day.date}
                    onClick={(event) => chooseDay(event, day.date)}
                  >
                    <span
                      className={`text-[10.5px] font-semibold uppercase tracking-[0.09em] ${quiet}`}
                    >
                      {day.weekday}
                    </span>
                    <span className="font-display text-[19px] font-bold leading-none">
                      {day.dayNumber}
                    </span>
                    <span className={`text-[10.5px] leading-none ${quiet}`}>{day.month}</span>
                    {/* Density at a glance. The height is held either way so a
                        quiet day does not shorten its chip. */}
                    <span aria-hidden className="flex h-[4px] items-center gap-[3px]">
                      {Array.from({ length: Math.min(day.count, 3) }, (_, dot) => (
                        <span
                          className={`block h-[4px] w-[4px] rounded-full ${chosen ? 'bg-white/80' : 'bg-red/50'}`}
                          key={dot}
                        />
                      ))}
                    </span>
                    <span className="sr-only">
                      {day.count} {picker.openLabel}
                    </span>
                  </a>
                )
              })}
            </div>

            <div className="mt-6 grid items-start gap-x-6 gap-y-5 md:grid-cols-2">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13.5px] font-semibold">{activeDay?.full ?? ''}</p>
                  {activeDay !== undefined && activeDay.count > 0 ? (
                    <span className="text-[12px] text-muted-2">
                      {activeDay.count} {picker.openLabel}
                    </span>
                  ) : null}
                </div>

                {loading ? (
                  <div className="mt-3" role="status">
                    <p className={hintClass}>{picker.loading}</p>
                    <div aria-hidden className="mt-3 flex flex-col gap-2">
                      {[0, 1, 2].map((n) => (
                        <span className="h-[46px] animate-pulse rounded-xl bg-card-2" key={n} />
                      ))}
                    </div>
                  </div>
                ) : sessions === undefined || sessions.length === 0 ? (
                  <div className={`${noticeClass} mt-3`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" name="calendar" />
                    <p className={hintClass}>{dayError ?? picker.dayEmpty}</p>
                  </div>
                ) : (
                  <div
                    aria-label={picker.timeGroupLabel}
                    className="mt-2 flex max-h-[336px] flex-col gap-2 overflow-y-auto p-1 [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]"
                    role="radiogroup"
                  >
                    {sessions.map((slot) => (
                      <label className={timeRowClass} key={slot.id}>
                        <input
                          checked={slot.id === selectedSlotId}
                          className="sr-only"
                          disabled={submitting}
                          name="slotId"
                          onChange={() => chooseSlot(slot.id)}
                          required
                          type="radio"
                          value={slot.id}
                        />
                        {/* Held open when empty so the row never shifts. */}
                        <span className="flex w-4 shrink-0 items-center justify-center opacity-0 transition-opacity duration-150 group-has-[:checked]:opacity-100">
                          <Icon className="h-3.5 w-3.5" name="check" />
                        </span>
                        <span className="flex-1 text-left">{slot.time}</span>
                        {slot.title ? (
                          <span className="truncate text-[11.5px] opacity-70">{slot.title}</span>
                        ) : null}
                        <span className="text-[11.5px] opacity-70">{picker.zone}</span>
                      </label>
                    ))}
                  </div>
                )}

                {fieldErrors.slotId ? (
                  <p className={`${errorClass} mt-3`} role="alert">
                    {fieldErrors.slotId}
                  </p>
                ) : null}
              </div>

              <div className="min-w-0 rounded-xl border border-line bg-bg-2 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-red/10 text-red">
                    <Icon className="h-4 w-4" name="video" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">{picker.formatTitle}</p>
                    <p className="mt-1 text-[12.5px] leading-[1.55] text-muted">{picker.format}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-3 border-t border-line pt-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-red/10 text-red">
                    <Icon className="h-4 w-4" name="sparkle" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">{bookingContent.hero.badge}</p>
                    <p className="mt-1 text-[12.5px] leading-[1.55] text-muted">
                      {picker.freeNote}
                    </p>
                  </div>
                </div>

                {selectedSlot === undefined ? null : (
                  <div className="mt-4 flex items-start gap-3 border-t border-line pt-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-red/10 text-red">
                      <Icon className="h-4 w-4" name="calendar" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-2">
                        {picker.selectedLabel}
                      </p>
                      <p className="mt-1 text-[13.5px] font-semibold">{selectedSlot.label}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </fieldset>

      {/* ── step 3: who is coming ───────────────────────────────────────── */}
      <div className="mt-9 border-t border-line pt-7">
        <h3 className="font-display text-[17px] font-bold">{details.heading}</h3>
        <p className={`${hintClass} mt-2`}>{details.sub}</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            error={fieldErrors.name}
            hint={fields.name.helper}
            id={fieldId('name')}
            label={fields.name.label}
          >
            <input
              aria-describedby={describedBy(fieldId('name'), fieldErrors.name, fields.name.helper)}
              aria-invalid={fieldErrors.name !== undefined}
              autoComplete="name"
              className={controlClass}
              disabled={submitting}
              id={fieldId('name')}
              name="name"
              placeholder={fields.name.placeholder}
              required
              type="text"
            />
          </Field>

          <Field
            error={fieldErrors.email}
            hint={fields.email.helper}
            id={fieldId('email')}
            label={fields.email.label}
          >
            <input
              aria-describedby={describedBy(
                fieldId('email'),
                fieldErrors.email,
                fields.email.helper,
              )}
              aria-invalid={fieldErrors.email !== undefined}
              autoComplete="email"
              className={controlClass}
              disabled={submitting}
              id={fieldId('email')}
              name="email"
              placeholder={fields.email.placeholder}
              required
              type="email"
            />
          </Field>

          <Field
            error={fieldErrors.phone}
            hint={fields.phone.helper}
            id={fieldId('phone')}
            label={fields.phone.label}
          >
            <input
              aria-describedby={describedBy(
                fieldId('phone'),
                fieldErrors.phone,
                fields.phone.helper,
              )}
              aria-invalid={fieldErrors.phone !== undefined}
              autoComplete="tel"
              className={controlClass}
              disabled={submitting}
              id={fieldId('phone')}
              name="phone"
              placeholder={fields.phone.placeholder}
              required
              type="tel"
            />
          </Field>

          <Field
            error={fieldErrors.company}
            hint={fields.company.helper}
            id={fieldId('company')}
            label={fields.company.label}
            optionalTag={fields.company.optionalTag}
          >
            <input
              aria-describedby={describedBy(
                fieldId('company'),
                fieldErrors.company,
                fields.company.helper,
              )}
              aria-invalid={fieldErrors.company !== undefined}
              autoComplete="organization"
              className={controlClass}
              disabled={submitting}
              id={fieldId('company')}
              name="company"
              placeholder={fields.company.placeholder}
              type="text"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              error={fieldErrors.message}
              hint={fields.message.helper}
              id={fieldId('message')}
              label={fields.message.label}
              optionalTag={fields.message.optionalTag}
            >
              <textarea
                aria-describedby={describedBy(
                  fieldId('message'),
                  fieldErrors.message,
                  fields.message.helper,
                )}
                aria-invalid={fieldErrors.message !== undefined}
                className={`${controlClass} min-h-[120px] resize-y`}
                disabled={submitting}
                id={fieldId('message')}
                name="message"
                placeholder={fields.message.placeholder}
                rows={4}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* ── consent + submit ────────────────────────────────────────────── */}
      <label
        className="mt-7 flex cursor-pointer items-start gap-3 text-[13px] text-muted"
        htmlFor={fieldId('consent')}
      >
        <input
          aria-invalid={fieldErrors.consent !== undefined}
          className="mt-1 h-4 w-4 flex-shrink-0 accent-red"
          disabled={submitting}
          id={fieldId('consent')}
          name="consent"
          required
          type="checkbox"
        />
        <span>{bookingContent.consent}</span>
      </label>

      {fieldErrors.consent ? (
        <p className={`${errorClass} mt-2`} role="alert">
          {fieldErrors.consent}
        </p>
      ) : null}

      {formError ? (
        <p className={`${errorClass} mt-5`} role="alert">
          {formError}
        </p>
      ) : null}

      {/*
        Never disabled on anything but `submitting`. Gating it on a consent
        checkbox tracked in React state would render it disabled on the server
        too, which would leave a visitor with no JavaScript looking at a button
        that can never be pressed.
      */}
      <button
        className="btn mt-6 w-full disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
        disabled={submitting}
        type="submit"
      >
        {submitting ? bookingContent.submit.pending : bookingContent.submit.idle}
      </button>

      <p className={`${hintClass} mt-3`}>{picker.freeNote}</p>

      {/*
        Honeypot. Off-screen, hidden from assistive technology, skipped by the
        tab order and excluded from autofill — a human never sees or fills it.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <input autoComplete="off" name="website" tabIndex={-1} type="text" />
      </div>
    </form>
  )
}
