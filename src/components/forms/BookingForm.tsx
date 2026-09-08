'use client'

/**
 * Funnel 2 — the paid consultation form.
 *
 * ── WHAT THIS COMPONENT MAY NOT DO ──────────────────────────────────────────
 * It never posts an amount. The body it sends carries who, what and when, and
 * the server prices it from the ConsultationType row; the total rendered here
 * is display only, handed down by the page from the same resolver the checkout
 * API bills with. Tampering with it in devtools changes a label and nothing
 * else.
 *
 * ── ORDER OF OPERATIONS ─────────────────────────────────────────────────────
 * The Razorpay script is loaded lazily — on the first submit, never on page
 * load — and it is loaded BEFORE the checkout call. That ordering matters: a
 * blocked or failed script then costs nothing, whereas loading it after the
 * booking exists would leave a slot held for a payment that can never start.
 *
 * A 409 from the checkout API means somebody else paid for that slot while this
 * form was open. The list is refetched, the selection is cleared, and the user
 * picks again — no page reload, no stale times.
 *
 * ── THE PICKER ──────────────────────────────────────────────────────────────
 * Two steps: a horizontal strip of days, then the times inside the chosen day.
 * Days are bucketed in Asia/Kolkata, never in the viewer's zone — a 9pm IST
 * slot is Wednesday for the supplier and must read as Wednesday for a viewer in
 * London too, or the strip and the label disagree about the same slot.
 *
 * All copy comes from src/content/forms.ts.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/site/Icons'
import { siteConfig } from '@/config/site'
import { bookingForm, indianStates, type FormField } from '@/content/forms'
import { formatINR } from '@/lib/money'
import type { AvailableSlot } from '@/lib/slots'

/** Machine codes from the checkout, verify and slots routes. Protocol, not copy. */
const API_CODE = {
  validation: 'VALIDATION',
  slotUnavailable: 'SLOT_UNAVAILABLE',
  slotInPast: 'SLOT_IN_PAST',
  consultationUnavailable: 'CONSULTATION_UNAVAILABLE',
  paymentUnavailable: 'PAYMENT_UNAVAILABLE',
  orderFailed: 'ORDER_FAILED',
  rateLimited: 'RATE_LIMITED',
} as const

const CHECKOUT_ENDPOINT = '/api/checkout'
const VERIFY_ENDPOINT = '/api/checkout/verify'
const SLOTS_ENDPOINT = '/api/slots'
const SUCCESS_PATH = '/consultation/success'

/** Razorpay's hosted Checkout. Loaded on demand, never on page load. */
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'
const SCRIPT_TIMEOUT_MS = 12_000

/** Mirrors the bounds in src/lib/validation.ts so both reject the same input. */
const NAME_MIN = 2

type FieldErrors = Record<string, string>

type Status = 'idle' | 'starting' | 'paying' | 'verifying'

type CheckoutResponse = {
  ok?: boolean
  code?: string
  fieldErrors?: FieldErrors
  orderId?: string
  amountPaise?: number
  currency?: string
  keyId?: string
  bookingId?: string
  prefill?: { name?: string; email?: string; contact?: string }
}

type SlotsResponse = {
  ok?: boolean
  slots?: AvailableSlot[]
}

/* ─────────────────────────── Razorpay Checkout ──────────────────────────── */

type RazorpayHandlerResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description: string
  prefill: { name: string; email: string; contact: string }
  notes: Record<string, string>
  theme?: { color: string }
  handler: (response: RazorpayHandlerResponse) => void
  modal: { ondismiss: () => void }
}

type RazorpayInstance = {
  open: () => void
  on?: (event: string, handler: (payload: unknown) => void) => void
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

/**
 * Resolves true once window.Razorpay is usable. Resolves FALSE — never rejects,
 * never hangs — when the script is blocked, fails, or takes too long: an ad
 * blocker eating checkout.js is the single most common failure here and it must
 * surface as a message the user can act on.
 */
function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay !== undefined) return Promise.resolve(true)

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const timer = window.setTimeout(() => finish(false), SCRIPT_TIMEOUT_MS)
    const done = (value: boolean) => {
      window.clearTimeout(timer)
      finish(value)
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`)
    const script = existing ?? document.createElement('script')

    script.addEventListener('load', () => done(window.Razorpay !== undefined), { once: true })
    script.addEventListener('error', () => done(false), { once: true })

    if (existing === null) {
      script.src = CHECKOUT_SCRIPT
      script.async = true
      document.head.appendChild(script)
    }
  })
}

/** The brand red, read from the stylesheet so no hex is duplicated in TS. */
function checkoutThemeColor(): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue('--red').trim()
}

/* ─────────────────────── days, times, grouping ──────────────────────────── */

/**
 * Mirrors SLOT_TIME_ZONE / SLOT_LOCALE in src/lib/slots.ts. Duplicated rather
 * than imported because that module pulls in the Prisma client, and a value
 * import from it would drag the whole thing into this client bundle. The two
 * must stay in step: the server labels slots in this zone, and grouping them in
 * any other one would file a late-evening slot under the wrong day.
 */
const SLOT_ZONE = 'Asia/Kolkata'
const SLOT_LOCALE = 'en-IN'

const DAY_MS = 86_400_000
/** Beyond this the strip stops padding gaps and just lists the days it has. */
const MAX_DAY_CHIPS = 31

/** Parts of an instant AS SEEN IN IST — the only zone this picker reasons in. */
const dayKeyFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SLOT_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** "2026-04-14" — the IST calendar date an instant falls on. */
function dayKeyOf(iso: string): string {
  const parts = dayKeyFormat.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * A key back to a Date. The key is already an IST calendar date, so it is read
 * at UTC midnight and every label below is formatted in UTC — that returns the
 * date's own parts verbatim, with no second zone conversion to get wrong. It
 * also lets a day with NO slots still be labelled, which the strip needs.
 */
function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`)
}

const utc = { timeZone: 'UTC' } as const
const weekdayFormat = new Intl.DateTimeFormat(SLOT_LOCALE, { weekday: 'short', ...utc })
const dayNumberFormat = new Intl.DateTimeFormat(SLOT_LOCALE, { day: 'numeric', ...utc })
const monthFormat = new Intl.DateTimeFormat(SLOT_LOCALE, { month: 'short', ...utc })
const fullDayFormat = new Intl.DateTimeFormat(SLOT_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  ...utc,
})

/** Clock time only. The date is already established by the day above it. */
const timeFormat = new Intl.DateTimeFormat(SLOT_LOCALE, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: SLOT_ZONE,
})

/**
 * "10:00 – 10:45 am". formatRange collapses the shared meridiem, which is why
 * it is preferred — but only for a slot that starts and ends on the same IST
 * day. Once one crosses midnight, formatRange prints both calendar dates
 * ("9/9/2026, 11:30 pm – 10/9/2026, 12:15 am"), and the date is already
 * established by the heading above the list.
 */
function timeRangeOf(slot: AvailableSlot): string {
  const startsAt = new Date(slot.startsAt)
  const endsAt = new Date(slot.endsAt)
  try {
    if (dayKeyOf(slot.startsAt) === dayKeyOf(slot.endsAt)) {
      return timeFormat.formatRange(startsAt, endsAt)
    }
  } catch {
    // Fall through to the two-format form, which cannot throw on a valid date.
  }
  return `${timeFormat.format(startsAt)} – ${timeFormat.format(endsAt)}`
}

type DayGroup = {
  readonly key: string
  readonly weekday: string
  readonly dayNumber: string
  readonly month: string
  readonly full: string
  readonly slots: readonly AvailableSlot[]
}

function toDayGroup(key: string, slots: readonly AvailableSlot[]): DayGroup {
  const date = keyToDate(key)
  return {
    key,
    weekday: weekdayFormat.format(date),
    dayNumber: dayNumberFormat.format(date),
    month: monthFormat.format(date),
    full: fullDayFormat.format(date),
    slots,
  }
}

/**
 * Slots bucketed into IST days, earliest first.
 *
 * Both levels are sorted explicitly. listAvailableSlots() already returns them
 * in order, but /api/slots is a JSON boundary and the picker should not be one
 * reordering away from showing 4pm above 10am. ISO-8601 strings from
 * toISOString() sort lexicographically in chronological order.
 */
function groupSlotsByDay(slots: readonly AvailableSlot[]): DayGroup[] {
  const buckets = new Map<string, AvailableSlot[]>()

  for (const slot of slots) {
    const key = dayKeyOf(slot.startsAt)
    const bucket = buckets.get(key)
    if (bucket === undefined) buckets.set(key, [slot])
    else bucket.push(slot)
  }

  return [...buckets.keys()]
    .sort()
    .map((key) =>
      toDayGroup(
        key,
        [...(buckets.get(key) ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      ),
    )
}

/**
 * The day strip: every date from the first bookable day to the last, INCLUDING
 * the ones with nothing on them.
 *
 * A strip that jumps 9 → 11 → 16 reads as broken; a continuous run shows the
 * shape of the diary, and an empty day is still selectable so that picking one
 * explains itself rather than doing nothing. If availability is so sparse that
 * the run would be mostly blanks, the compact list is used instead.
 */
function buildDayStrip(groups: readonly DayGroup[]): DayGroup[] {
  const first = groups[0]
  const last = groups[groups.length - 1]
  if (first === undefined || last === undefined) return []

  const byKey = new Map(groups.map((group) => [group.key, group]))
  const strip: DayGroup[] = []
  const end = keyToDate(last.key).getTime()

  for (
    let cursor = keyToDate(first.key).getTime();
    cursor <= end && strip.length < MAX_DAY_CHIPS;
    cursor += DAY_MS
  ) {
    const key = new Date(cursor).toISOString().slice(0, 10)
    strip.push(byKey.get(key) ?? toDayGroup(key, []))
  }

  const kept = strip.filter((day) => day.slots.length > 0).length
  return kept < groups.length ? [...groups] : strip
}

/* ──────────────────────────────── copy ──────────────────────────────────── */

const fields: Record<
  'name' | 'email' | 'phone' | 'company' | 'stateCode' | 'gstin' | 'notes',
  FormField
> = bookingForm.fields
const picker = bookingForm.slotPicker
const summary = bookingForm.summary
const errors = bookingForm.errors

/* ──────────────────────────────── markup ────────────────────────────────── */

const labelClass = 'flex items-baseline justify-between gap-3 text-[13.5px] font-semibold'
const optionalClass = 'text-[12px] font-normal not-italic text-muted-2'
const controlClass =
  'w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-muted-2 focus:border-red focus:ring-2 focus:ring-red/20 aria-[invalid=true]:border-red'
const hintClass = 'text-[12.5px] text-muted'
const errorClass = 'text-[12.5px] font-medium text-red'

/**
 * Picker surfaces. Every value here is an existing token — --red for the chosen
 * fill, --card-2 for hover, --line / --line-strong for the resting edge — so
 * the picker reads as part of the same page rather than a widget dropped on it.
 * The focus ring is offset against --card, the form's own background, so it
 * stays visible on the red fill too.
 */
const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-red/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card'
const chosenSurface =
  'border-red bg-red text-white shadow-[0_8px_20px_-10px_rgba(232,54,43,0.8)]'
const restingSurface = 'border-line bg-bg hover:border-line-strong hover:bg-card-2'

/**
 * `relative` is load-bearing: the chip carries an sr-only slot count, sr-only is
 * position:absolute, and without a positioned chip its containing block becomes
 * the wrapper OUTSIDE the horizontal scroller — which means the scroller cannot
 * clip it and the whole PAGE gains a sideways scrollbar the width of the strip.
 */
const dayChipClass = `relative flex w-[64px] shrink-0 snap-start flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition duration-200 disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`
const timeRowClass = `flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-[14.5px] transition duration-200 disabled:cursor-not-allowed disabled:opacity-55 ${focusRing}`
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
 * Arrow keys walk the buttons inside one picker group, Home/End jump the ends.
 *
 * Focus only — nothing is selected until Enter or Space, so a keyboard user can
 * read across the strip without committing to a day on every keypress. Tab
 * still leaves the group, because these are ordinary buttons and no roving
 * tabindex is taken away from them.
 */
function moveRovingFocus(event: KeyboardEvent<HTMLDivElement>, axis: 'x' | 'y'): void {
  const previousKey = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
  const nextKey = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
  const { key } = event
  if (key !== previousKey && key !== nextKey && key !== 'Home' && key !== 'End') return

  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-pick]'),
  ].filter((button) => !button.disabled)
  const index = items.indexOf(document.activeElement as HTMLButtonElement)
  if (items.length === 0 || index === -1) return

  event.preventDefault()
  const target =
    key === 'Home'
      ? items[0]
      : key === 'End'
        ? items[items.length - 1]
        : items[(index + (key === nextKey ? 1 : -1) + items.length) % items.length]

  target?.focus()
  // 'nearest' on both axes: it must never drag the page around vertically.
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export type BookingFormProps = {
  consultationSlug: string
  /** From the database row; used for the Checkout modal's description line. */
  consultationName: string
  /** Gross, tax-inclusive total in paise, resolved by the server. Display only. */
  totalPaise: number
  initialSlots: readonly AvailableSlot[]
}

export function BookingForm({
  consultationSlug,
  consultationName,
  totalPaise,
  initialSlots,
}: BookingFormProps) {
  const uid = useId()
  const router = useRouter()

  const [slots, setSlots] = useState<readonly AvailableSlot[]>(initialSlots)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const fieldId = useCallback((name: string) => `${uid}-${name}`, [uid])
  const busy = status !== 'idle'

  const groups = useMemo(() => groupSlotsByDay(slots), [slots])
  const days = useMemo(() => buildDayStrip(groups), [groups])

  /**
   * Derived, not stored. The default is the first day that actually has slots,
   * and a refetch that retires the chosen day falls back to that same default
   * rather than leaving the strip pointing at a date it no longer offers.
   */
  const activeDayKey = days.some((day) => day.key === selectedDayKey)
    ? selectedDayKey
    : (groups[0]?.key ?? '')
  const activeDay = days.find((day) => day.key === activeDayKey)
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId)
  const selectedSummary =
    selectedSlot === undefined
      ? null
      : `${fullDayFormat.format(keyToDate(dayKeyOf(selectedSlot.startsAt)))} · ${timeRangeOf(selectedSlot)} ${picker.zone}`

  /* The strip's edge fades, shown only on the side there is more to scroll to. */
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [stripEdges, setStripEdges] = useState({ start: false, end: false })

  const measureStrip = useCallback(() => {
    const el = stripRef.current
    if (el === null) return
    const overflow = el.scrollWidth - el.clientWidth
    const start = el.scrollLeft > 4
    const end = overflow > 4 && el.scrollLeft < overflow - 4
    // Same object back when nothing moved: this runs on every scroll frame.
    setStripEdges((current) =>
      current.start === start && current.end === end ? current : { start, end },
    )
  }, [])

  useEffect(() => {
    measureStrip()
    window.addEventListener('resize', measureStrip)
    return () => window.removeEventListener('resize', measureStrip)
  }, [measureStrip, days.length])

  const chooseSlot = useCallback((slotId: string) => {
    setSelectedSlotId(slotId)
    setFieldErrors(({ slotId: _cleared, ...rest }) => rest)
    setFormError(null)
  }, [])

  /** Refetches the grid after a lost race, so the user picks from what is left. */
  const refreshSlots = useCallback(async () => {
    setSlotsLoading(true)
    try {
      const response = await fetch(
        `${SLOTS_ENDPOINT}?consultation=${encodeURIComponent(consultationSlug)}`,
        { cache: 'no-store' },
      )
      const payload: SlotsResponse = await response.json().catch(() => ({}))
      if (response.ok && payload.ok === true && Array.isArray(payload.slots)) {
        setSlots(payload.slots)
        setSelectedSlotId((current) =>
          payload.slots?.some((slot) => slot.id === current) === true ? current : '',
        )
      }
    } catch {
      // The grid simply stays as it was; the error already shown is enough.
    } finally {
      setSlotsLoading(false)
    }
  }, [consultationSlug])

  const handleCheckoutFailure = useCallback(
    async (response: Response, payload: CheckoutResponse) => {
      if (payload.code === API_CODE.validation) {
        setFieldErrors(payload.fieldErrors ?? {})
        setFormError(errors.form.validation)
        return
      }
      if (payload.code === API_CODE.slotUnavailable) {
        setFormError(errors.slot.taken)
        await refreshSlots()
        return
      }
      if (payload.code === API_CODE.slotInPast) {
        setFormError(errors.slot.past)
        await refreshSlots()
        return
      }
      if (payload.code === API_CODE.consultationUnavailable) {
        setFormError(errors.consultationType.unavailable)
        return
      }
      if (payload.code === API_CODE.paymentUnavailable || payload.code === API_CODE.orderFailed) {
        setFormError(errors.form.checkoutUnavailable)
        return
      }
      if (response.status === 429 || payload.code === API_CODE.rateLimited) {
        setFormError(errors.form.rateLimited)
        return
      }
      setFormError(errors.form.generic)
    },
    [refreshSlots],
  )

  /** The browser half of the PAID transition. The webhook is the other half. */
  const verifyPayment = useCallback(
    async (bookingId: string, response: RazorpayHandlerResponse) => {
      setStatus('verifying')
      try {
        const verified = await fetch(VERIFY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...response, bookingId }),
        })
        const payload: { ok?: boolean } = await verified.json().catch(() => ({}))

        if (verified.ok && payload.ok === true) {
          router.push(`${SUCCESS_PATH}?booking=${encodeURIComponent(bookingId)}`)
          return
        }
        setStatus('idle')
        setFormError(errors.form.verificationFailed)
      } catch {
        setStatus('idle')
        setFormError(errors.form.verificationFailed)
      }
    },
    [router],
  )

  const openCheckout = useCallback(
    (checkout: CheckoutResponse) => {
      const constructor = window.Razorpay
      const { orderId, amountPaise, currency, keyId, bookingId } = checkout

      if (
        constructor === undefined ||
        orderId === undefined ||
        amountPaise === undefined ||
        currency === undefined ||
        keyId === undefined ||
        bookingId === undefined
      ) {
        setStatus('idle')
        setFormError(errors.form.checkoutUnavailable)
        return
      }

      const themeColor = checkoutThemeColor()
      const instance = new constructor({
        key: keyId,
        // Paise, exactly as the server priced it. Never scaled here.
        amount: amountPaise,
        currency,
        order_id: orderId,
        name: siteConfig.name,
        description: consultationName,
        prefill: {
          name: checkout.prefill?.name ?? '',
          email: checkout.prefill?.email ?? '',
          contact: checkout.prefill?.contact ?? '',
        },
        notes: { bookingId },
        ...(themeColor.length > 0 ? { theme: { color: themeColor } } : {}),
        handler: (response) => {
          void verifyPayment(bookingId, response)
        },
        modal: {
          ondismiss: () => {
            setStatus('idle')
            setFormError(errors.form.paymentCancelled)
          },
        },
      })

      instance.on?.('payment.failed', () => {
        setStatus('idle')
        setFormError(errors.form.paymentFailed)
      })

      setStatus('paying')
      instance.open()
    },
    [consultationName, verifyPayment],
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
      const clientStateCode = read('clientStateCode')
      const clientGstin = read('clientGstin')
      const notes = read('notes')

      const localErrors: FieldErrors = {}
      if (name.length === 0) localErrors.name = errors.name.required
      else if (name.length < NAME_MIN) localErrors.name = errors.name.tooShort
      if (email.length === 0) localErrors.email = errors.email.required
      else if (!email.includes('@')) localErrors.email = errors.email.invalid
      if (phone.length === 0) localErrors.phone = errors.phone.required
      if (clientStateCode.length === 0) localErrors.clientStateCode = errors.stateCode.required
      if (selectedSlotId.length === 0) localErrors.slotId = errors.slot.required

      if (Object.keys(localErrors).length > 0) {
        setFieldErrors(localErrors)
        setFormError(errors.form.validation)
        return
      }

      setStatus('starting')
      setFieldErrors({})
      setFormError(null)

      /**
       * Script first, booking second. If checkout.js cannot load, nothing has
       * been reserved and the slot is still on offer for everyone else.
       */
      const scriptReady = await loadCheckoutScript()
      if (!scriptReady) {
        setStatus('idle')
        setFormError(errors.form.checkoutUnavailable)
        return
      }

      try {
        const response = await fetch(CHECKOUT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone,
            slotId: selectedSlotId,
            consultationSlug,
            clientStateCode,
            ...(company.length > 0 ? { company } : {}),
            ...(clientGstin.length > 0 ? { clientGstin } : {}),
            ...(notes.length > 0 ? { message: notes } : {}),
          }),
        })

        const payload: CheckoutResponse = await response.json().catch(() => ({}))

        if (!response.ok || payload.ok !== true) {
          setStatus('idle')
          await handleCheckoutFailure(response, payload)
          return
        }

        openCheckout(payload)
      } catch {
        // fetch() only rejects on a transport failure, never on a 4xx/5xx.
        setStatus('idle')
        setFormError(errors.form.network)
      }
    },
    [consultationSlug, handleCheckoutFailure, openCheckout, selectedSlotId],
  )

  return (
    <form
      // min-w-0: this <form> is a grid item, and grid items default to
      // min-width:auto — they refuse to shrink below their content. The day
      // strip inside is deliberately wider than the column, so without this a
      // single wide child blows the column out and the whole page gains a
      // horizontal scrollbar. The <fieldset> below needs it for the same
      // reason (fieldsets have their own intrinsic min-width quirk).
      className="min-w-0 rounded-card border border-line bg-card p-7 shadow-[0_2px_10px_rgba(20,10,10,0.05)]"
      noValidate
      onSubmit={handleSubmit}
    >
      {/* ── slot picker ─────────────────────────────────────────────────── */}
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="text-[13.5px] font-semibold">{picker.heading}</legend>
        <p className={`${hintClass} mt-2`}>{picker.timezoneNote}</p>

        {/*
          The submitted value is read from state, not from the DOM — this only
          keeps slotId in the form's own FormData, exactly as the radios did.
        */}
        <input name="slotId" type="hidden" value={selectedSlotId} />

        {slotsLoading ? (
          <div className="mt-4" role="status">
            <p className={hintClass}>{picker.loading}</p>
            <div aria-hidden className="mt-3 flex gap-2 overflow-hidden">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span
                  className="h-[76px] w-[64px] shrink-0 animate-pulse rounded-xl bg-card-2"
                  key={n}
                />
              ))}
            </div>
            <div aria-hidden className="mt-5 flex max-w-[360px] flex-col gap-2">
              {[0, 1, 2].map((n) => (
                <span className="h-[46px] animate-pulse rounded-xl bg-card-2" key={n} />
              ))}
            </div>
          </div>
        ) : days.length === 0 ? (
          <div className={`${noticeClass} mt-4`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" name="calendar" />
            <p className={hintClass}>{picker.empty}</p>
          </div>
        ) : (
          <>
            {/* ── step 1: the day strip ──────────────────────────────────── */}
            <div className="relative mt-4">
              <div
                aria-label={picker.dayGroupLabel}
                className="flex snap-x snap-proximity gap-2 overflow-x-auto p-1 [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]"
                onKeyDown={(event) => moveRovingFocus(event, 'x')}
                onScroll={measureStrip}
                ref={stripRef}
                role="group"
              >
                {days.map((day) => {
                  const chosen = day.key === activeDayKey
                  const count = day.slots.length
                  const quiet = chosen ? 'text-white/75' : 'text-muted-2'

                  return (
                    <button
                      aria-pressed={chosen}
                      className={`${dayChipClass} ${
                        chosen
                          ? chosenSurface
                          : count === 0
                            ? `${restingSurface} text-muted-2`
                            : restingSurface
                      }`}
                      data-pick=""
                      disabled={busy}
                      key={day.key}
                      onClick={() => setSelectedDayKey(day.key)}
                      type="button"
                    >
                      <span className={`text-[10.5px] font-semibold uppercase tracking-[0.09em] ${quiet}`}>
                        {day.weekday}
                      </span>
                      <span className="font-display text-[19px] font-bold leading-none">
                        {day.dayNumber}
                      </span>
                      <span className={`text-[10.5px] leading-none ${quiet}`}>{day.month}</span>
                      {/* Density at a glance. The height is held either way so
                          an empty day does not shorten its chip. */}
                      <span aria-hidden className="flex h-[4px] items-center gap-[3px]">
                        {Array.from({ length: Math.min(count, 3) }, (_, dot) => (
                          <span
                            className={`block h-[4px] w-[4px] rounded-full ${chosen ? 'bg-white/80' : 'bg-red/50'}`}
                            key={dot}
                          />
                        ))}
                      </span>
                      <span className="sr-only">
                        {count} {picker.openLabel}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Only drawn on the side there is more strip to reach. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-10 transition-opacity duration-300"
                style={{
                  opacity: stripEdges.start ? 1 : 0,
                  background: 'linear-gradient(90deg, var(--card), transparent)',
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 transition-opacity duration-300"
                style={{
                  opacity: stripEdges.end ? 1 : 0,
                  background: 'linear-gradient(270deg, var(--card), transparent)',
                }}
              />
            </div>

            {/* ── step 2: the times on that day, and what the session is ─── */}
            <div className="mt-6 grid items-start gap-x-6 gap-y-5 md:grid-cols-2">
              {activeDay === undefined ? null : (
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13.5px] font-semibold">{activeDay.full}</p>
                    {activeDay.slots.length > 0 ? (
                      <span className="text-[12px] text-muted-2">
                        {activeDay.slots.length} {picker.openLabel}
                      </span>
                    ) : null}
                  </div>

                  {activeDay.slots.length === 0 ? (
                    <div className={`${noticeClass} mt-3`}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" name="calendar" />
                      <p className={hintClass}>{picker.dayEmpty}</p>
                    </div>
                  ) : (
                    <div
                      aria-label={picker.timeGroupLabel}
                      className="mt-2 flex max-h-[336px] flex-col gap-2 overflow-y-auto p-1 [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]"
                      onKeyDown={(event) => moveRovingFocus(event, 'y')}
                      role="group"
                    >
                      {activeDay.slots.map((slot) => {
                        const chosen = slot.id === selectedSlotId
                        return (
                          <button
                            aria-pressed={chosen}
                            className={`${timeRowClass} ${chosen ? `${chosenSurface} font-semibold` : `${restingSurface} text-ink`}`}
                            data-pick=""
                            disabled={busy}
                            key={slot.id}
                            onClick={() => chooseSlot(slot.id)}
                            type="button"
                          >
                            {/* Held open when empty so the row never shifts. */}
                            <span className="flex w-4 shrink-0 items-center justify-center">
                              {chosen ? <Icon className="h-3.5 w-3.5" name="check" /> : null}
                            </span>
                            <span className="flex-1 text-left">{timeRangeOf(slot)}</span>
                            <span
                              className={`text-[11.5px] ${chosen ? 'text-white/75' : 'text-muted-2'}`}
                            >
                              {picker.zone}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

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

                {selectedSummary === null ? null : (
                  <div className="mt-4 flex items-start gap-3 border-t border-line pt-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-red/10 text-red">
                      <Icon className="h-4 w-4" name="calendar" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-2">
                        {picker.selectedLabel}
                      </p>
                      <p className="mt-1 text-[13.5px] font-semibold">{selectedSummary}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {fieldErrors.slotId ? (
          <p className={`${errorClass} mt-3`} role="alert">
            {fieldErrors.slotId}
          </p>
        ) : null}
      </fieldset>

      {/* ── details ─────────────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
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
            disabled={busy}
            id={fieldId('name')}
            name="name"
            placeholder={fields.name.placeholder}
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
            aria-describedby={describedBy(fieldId('email'), fieldErrors.email, fields.email.helper)}
            aria-invalid={fieldErrors.email !== undefined}
            autoComplete="email"
            className={controlClass}
            disabled={busy}
            id={fieldId('email')}
            name="email"
            placeholder={fields.email.placeholder}
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
            aria-describedby={describedBy(fieldId('phone'), fieldErrors.phone, fields.phone.helper)}
            aria-invalid={fieldErrors.phone !== undefined}
            autoComplete="tel"
            className={controlClass}
            disabled={busy}
            id={fieldId('phone')}
            name="phone"
            placeholder={fields.phone.placeholder}
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
            disabled={busy}
            id={fieldId('company')}
            name="company"
            placeholder={fields.company.placeholder}
            type="text"
          />
        </Field>

        {/*
          The billing state is not an address field. It is the place-of-supply
          input (IGST Act s.12(2)) that decides whether the invoice carries
          CGST+SGST or IGST, which is what the helper line explains.
        */}
        <Field
          error={fieldErrors.clientStateCode}
          hint={fields.stateCode.helper}
          id={fieldId('stateCode')}
          label={fields.stateCode.label}
        >
          <select
            aria-describedby={describedBy(
              fieldId('stateCode'),
              fieldErrors.clientStateCode,
              fields.stateCode.helper,
            )}
            aria-invalid={fieldErrors.clientStateCode !== undefined}
            className={controlClass}
            defaultValue=""
            disabled={busy}
            id={fieldId('stateCode')}
            name="clientStateCode"
          >
            <option disabled value="">
              {fields.stateCode.placeholder}
            </option>
            {indianStates.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          error={fieldErrors.clientGstin}
          hint={fields.gstin.helper}
          id={fieldId('gstin')}
          label={fields.gstin.label}
          optionalTag={fields.gstin.optionalTag}
        >
          <input
            aria-describedby={describedBy(
              fieldId('gstin'),
              fieldErrors.clientGstin,
              fields.gstin.helper,
            )}
            aria-invalid={fieldErrors.clientGstin !== undefined}
            autoCapitalize="characters"
            className={`${controlClass} uppercase`}
            disabled={busy}
            id={fieldId('gstin')}
            name="clientGstin"
            placeholder={fields.gstin.placeholder}
            type="text"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            error={fieldErrors.message}
            hint={fields.notes.helper}
            id={fieldId('notes')}
            label={fields.notes.label}
            optionalTag={fields.notes.optionalTag}
          >
            <textarea
              aria-describedby={describedBy(
                fieldId('notes'),
                fieldErrors.message,
                fields.notes.helper,
              )}
              aria-invalid={fieldErrors.message !== undefined}
              className={`${controlClass} min-h-[120px] resize-y`}
              disabled={busy}
              id={fieldId('notes')}
              name="notes"
              placeholder={fields.notes.placeholder}
              rows={4}
            />
          </Field>
        </div>
      </div>

      {/* ── total + consent + submit ────────────────────────────────────── */}
      <div className="mt-8 flex items-baseline justify-between gap-4 border-t border-line pt-5">
        <span className="text-[13.5px] font-semibold">{summary.total}</span>
        <span className="font-display text-[22px] font-bold">{formatINR(totalPaise)}</span>
      </div>
      <p className={`${hintClass} mt-2`}>{summary.inclusiveNote}</p>

      <p className="mt-5 text-[12.5px] text-muted">{bookingForm.consent}</p>

      {formError ? (
        <p className={`${errorClass} mt-5`} role="alert">
          {formError}
        </p>
      ) : null}

      <button
        className="btn mt-6 w-full disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
        disabled={busy}
        type="submit"
      >
        {busy ? bookingForm.submit.pending : bookingForm.submit.idle}
      </button>

      {status === 'verifying' ? (
        <div className="mt-5 rounded-xl border border-line bg-bg-2 p-4" role="status">
          <p className="text-[13.5px] font-semibold">{bookingForm.paying.title}</p>
          <p className={`${hintClass} mt-1`}>{bookingForm.paying.body}</p>
        </div>
      ) : null}
    </form>
  )
}
