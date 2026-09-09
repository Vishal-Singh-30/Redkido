/**
 * Admin chrome + the single copy dictionary for the whole admin area.
 *
 * WHY THE COPY LIVES HERE: the project rule is that no component may inline a
 * user-facing string — copy belongs to one module per surface. src/content/*.ts
 * is the marketing surface and is owned elsewhere; the admin area is internal
 * back-office copy and owns this module. Every admin page, chart and action
 * message reads from `adminCopy`. Nothing below that constant may contain a
 * literal that a human reads.
 *
 * Everything in this file is a server component. The one piece of state the
 * chrome needs — the current pathname, for the active nav item — arrives as a
 * request header stamped by src/middleware.ts, so no 'use client' is required.
 */

import type { ReactNode } from 'react'
import type { LeadKind, LeadStatus, SlotStatus, BookingStatus } from '@/generated/prisma/enums'
import Link from 'next/link'
import { siteConfig } from '@/config/site'

/* ==========================================================================
   Enum value lists.

   Each list is `satisfies readonly <PrismaEnum>[]`, so the array is checked
   against the schema rather than merely resembling it, and every label map
   below is `satisfies Record<Enum, string>`. Adding or removing an enum member
   in prisma/schema.prisma then breaks the BUILD here instead of rendering
   `undefined` into a table cell.

   This is not theoretical. HELD was caught this way when it was added, and
   caught again — along with CONSULTATION and the four payment booking states —
   when calls became free and those members went away.
   ========================================================================== */

export const LEAD_KINDS = ['ENQUIRY', 'CALL'] as const satisfies readonly LeadKind[]
export type LeadKindValue = LeadKind

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'WON',
  'LOST',
] as const satisfies readonly LeadStatus[]
export type LeadStatusValue = LeadStatus

/**
 * No PENDING and no payment states. A free call is confirmed the moment it is
 * booked, so the lifecycle is only ever "what happened on the day".
 */
export const BOOKING_STATUSES = [
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
] as const satisfies readonly BookingStatus[]
export type BookingStatusValue = BookingStatus

/** HELD went with checkout: nothing reserves a session before it is taken. */
export const SLOT_STATUSES = [
  'AVAILABLE',
  'BOOKED',
  'BLOCKED',
] as const satisfies readonly SlotStatus[]
export type SlotStatusValue = SlotStatus

export function isLeadKind(value: unknown): value is LeadKindValue {
  return typeof value === 'string' && (LEAD_KINDS as readonly string[]).includes(value)
}

export function isLeadStatus(value: unknown): value is LeadStatusValue {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value)
}

/* ==========================================================================
   Setting keys. The email/meeting-link senders read the same rows, so these
   string keys are a cross-module contract, not copy.
   ========================================================================== */

export const SETTING_KEYS = {
  meetingLinkTemplate: 'meeting_link_template',
  ownerAlertEmail: 'owner_alert_email',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

/* ==========================================================================
   Time.

   Sessions are published in the supplier's working day, which is Indian, and
   read by an admin who may be anywhere. So every formatter below names its
   timeZone explicitly and NOTHING here reads the server's local zone — a
   Vercel lambda runs in UTC, and a 9pm IST session grouped by the server's
   local date lands on the wrong day.
   ========================================================================== */

export const ADMIN_LOCALE = 'en-IN'
export const ADMIN_TIME_ZONE = 'Asia/Kolkata'

/**
 * Asia/Kolkata is a FIXED +05:30 — India has had no daylight saving since
 * 1945 — which is why a literal offset is safe here. It is used in one
 * direction only: turning a calendar date plus a wall-clock time typed by an
 * admin into an instant. Everything that DISPLAYS a time goes through Intl
 * with the zone named above.
 */
export const ADMIN_UTC_OFFSET = '+05:30'

const dateTimeFormatter = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: ADMIN_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dateFormatter = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: ADMIN_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dayHeadingFormatter = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: ADMIN_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dayBucketFormatter = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: ADMIN_TIME_ZONE,
  day: 'numeric',
  month: 'short',
})

const timeFormatter = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: ADMIN_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dayKeyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ADMIN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return adminCopy.common.empty
  return dateTimeFormatter.format(value)
}

export function formatDate(value: Date | null | undefined): string {
  if (!value) return adminCopy.common.empty
  return dateFormatter.format(value)
}

export function formatTime(value: Date | null | undefined): string {
  if (!value) return adminCopy.common.empty
  return timeFormatter.format(value)
}

/** "11:00 am – 11:30 am", in IST, for one session row. */
export function formatTimeRange(startsAt: Date, endsAt: Date): string {
  return timeFormatter.formatRange(startsAt, endsAt)
}

/**
 * The IST calendar day an instant falls on, as YYYY-MM-DD.
 *
 * Assembled from formatToParts rather than trusting a locale that happens to
 * emit ISO order today, so the shape cannot drift with the ICU data a runtime
 * ships.
 */
export function istDayKey(value: Date): string {
  const parts = dayKeyFormatter.formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * The instant at which an IST wall-clock time on an IST calendar date occurs,
 * or null if that is not a real date/time.
 *
 * The null case matters: a hand-typed "2026-02-30" does not throw, it rolls
 * forward to 2 March, and a silently shifted session is worse than a rejected
 * one. The round-trip check below catches exactly that.
 */
export function istInstant(dayKey: string, time: string): Date | null {
  const parsed = new Date(`${dayKey}T${time}:00.000${ADMIN_UTC_OFFSET}`)
  if (Number.isNaN(parsed.getTime())) return null
  if (istDayKey(parsed) !== dayKey) return null
  return parsed
}

/** Midnight IST at the start of an IST calendar day, or null if unparseable. */
export function istDayStart(dayKey: string): Date | null {
  return istInstant(dayKey, '00:00')
}

/** "Tuesday, 9 September 2026" — the heading over one day of sessions. */
export function formatDayHeading(dayKey: string): string {
  const instant = istInstant(dayKey, '12:00')
  if (!instant) return dayKey
  return dayHeadingFormatter.format(instant)
}

/** Axis label for one day bucket on a chart. Buckets are IST days. */
export function formatDayBucket(dayKey: string): string {
  const instant = istInstant(dayKey, '12:00')
  if (!instant) return dayKey
  return dayBucketFormatter.format(instant)
}

export function formatText(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : adminCopy.common.empty
}

/* ==========================================================================
   COPY. Everything a human reads in /admin lives in this object.
   ========================================================================== */

export const adminCopy = {
  brand: {
    name: siteConfig.name,
    area: 'Admin',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    skipToContent: 'Skip to content',
    backToSite: 'View public site',
  },

  nav: [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/sessions', label: 'Sessions', exact: false },
    { href: '/admin/leads', label: 'Leads', exact: false },
    { href: '/admin/settings', label: 'Settings', exact: false },
  ],

  common: {
    empty: '—',
    save: 'Save changes',
    saved: 'Saved.',
    apply: 'Apply filters',
    reset: 'Clear',
    back: 'Back to leads',
    copyHint: 'All times are shown in India Standard Time (IST).',
    notFound: 'That record no longer exists.',
    genericError: 'Something went wrong. Nothing was saved.',
    validationError: 'Please check the highlighted fields and try again.',
  },

  kindLabels: {
    ENQUIRY: 'Enquiry',
    CALL: 'Call',
  } satisfies Record<LeadKindValue, string>,

  leadStatusLabels: {
    NEW: 'New',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    WON: 'Won',
    LOST: 'Lost',
  } satisfies Record<LeadStatusValue, string>,

  bookingStatusLabels: {
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    NO_SHOW: 'No-show',
  } satisfies Record<BookingStatusValue, string>,

  slotStatusLabels: {
    AVAILABLE: 'Open',
    BOOKED: 'Booked',
    BLOCKED: 'Blocked',
  } satisfies Record<SlotStatusValue, string>,

  charts: {
    empty: 'No data yet',
    tableCaptionSuffix: 'underlying data',
    seriesColumn: 'Series',
    periodColumn: 'Period',
    valueColumn: 'Value',
    categoryColumn: 'Category',
  },

  dashboard: {
    title: 'Dashboard',
    description: 'Who reached out, and what is on the calendar.',
    tiles: {
      totalLeads: 'Total leads',
      totalLeadsSub: 'Enquiries and booked calls combined',
      enquiries: 'Enquiries',
      enquiriesSub: 'Contact form, no call attached',
      calls: 'Calls booked',
      callsSub: 'Confirmed bookings, all time',
      upcoming: 'Upcoming calls',
      upcomingSub: 'Confirmed, in the next 7 days',
      openSessions: 'Open sessions',
      openSessionsSub: 'Published and still unbooked in the next 7 days',
    },
    noSessions:
      'There are no open sessions in the next 7 days, so nobody can book a call right now.',
    noSessionsCta: 'Publish sessions',
    trend: {
      title: 'Last 30 days',
      description: 'New leads against the calls that were actually booked.',
      chartLabel: 'Leads and booked calls per day over the last 30 days, IST',
      leadsSeries: 'Leads',
      bookingsSeries: 'Calls booked',
    },
    byKind: {
      title: 'Leads by kind',
      description: 'How the two funnels compare over all time.',
      chartLabel: 'Number of leads by kind',
    },
    recent: {
      title: 'Recent activity',
      description: 'The ten most recent people who reached out.',
      empty: 'Nobody has reached out yet.',
      view: 'Open',
    },
  },

  sessions: {
    title: 'Sessions',
    description:
      'Publish the times a visitor is allowed to book. A time that is not on this page cannot be booked.',
    timezoneNote: 'Every time on this page is entered and shown in India Standard Time (IST).',

    add: {
      title: 'Add one session',
      description: 'A single date and start time.',
      dateLabel: 'Date',
      timeLabel: 'Start time (IST)',
      durationLabel: 'Length in minutes',
      labelLabel: 'Label (optional)',
      labelPlaceholder: 'Intro call',
      labelHelp: 'Shown to the visitor beside the time. Leave it blank for none.',
      submit: 'Add session',
    },

    bulk: {
      title: 'Add a date range',
      description:
        'Pick the weekdays, the start times and a range of dates, and every matching session is published in one go.',
      fromLabel: 'From date',
      toLabel: 'To date',
      weekdaysLabel: 'Weekdays',
      timesLabel: 'Start times (IST)',
      timesPlaceholder: '11:00, 14:00, 16:00',
      timesHelp: 'Comma separated, 24-hour clock. Up to 12 times per day.',
      submit: 'Add sessions',
      note: 'Times that already exist, and anything already in the past, are skipped rather than failing the whole batch.',
    },

    weekdayLabels: {
      0: 'Sun',
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
    } as Record<number, string>,

    /** Display order, Monday first. Values are JS day-of-week numbers. */
    weekdayOrder: [1, 2, 3, 4, 5, 6, 0] as readonly number[],
    weekdayDefaults: [1, 2, 3, 4, 5] as readonly number[],

    list: {
      title: 'Upcoming sessions',
      description: 'Grouped by IST date, starting from today. Past dates are not listed.',
      empty: 'No upcoming sessions. Publish some above, or the booking page has nothing to offer.',
      truncated: 'Only the soonest sessions are listed. Publish fewer months at a time to see them all.',
      columns: {
        time: 'Time',
        label: 'Label',
        status: 'Status',
        who: 'Booked by',
        actions: 'Actions',
      },
      openLead: 'Open lead',
      block: 'Block',
      unblock: 'Reopen',
      delete: 'Delete',
      deleteLocked: 'Booked',
      deleteLockedHint: 'A session with a confirmed booking cannot be deleted from here.',
      countOne: 'session',
      countMany: 'sessions',
    },

    notices: {
      createdOne: 'Session added.',
      createdManySuffix: 'sessions added.',
      skippedSuffix: 'skipped — already published, or in the past.',
      blocked: 'Session blocked. It will not appear on the booking page.',
      unblocked: 'Session reopened.',
      deleted: 'Session deleted.',
    },

    errors: {
      invalid: 'Check the date, time and length, then try again.',
      duplicate: 'There is already a session at that time.',
      past: 'That start time has already passed.',
      range: 'The end date must be on or after the start date.',
      rangeTooLong: 'Pick a range of a year or less.',
      weekdays: 'Pick at least one weekday.',
      times: 'Enter start times as HH:MM on a 24-hour clock, separated by commas.',
      tooMany: 'That would publish more than 500 sessions at once. Narrow the range.',
      nothingCreated: 'Nothing to add — every one of those sessions already exists or has passed.',
      booked: 'That session has a confirmed booking, so nothing was changed. Cancel the booking first.',
      hasHistory: 'That session still has a booking attached to it. Block it instead of deleting it.',
      notFound: 'That session no longer exists.',
      generic: 'Something went wrong. Nothing was changed.',
    },
  },

  leads: {
    title: 'Leads',
    description: 'Everyone who reached out. The kind badge says whether they booked a call.',
    filters: {
      legend: 'Filter leads',
      kind: 'Kind',
      status: 'Status',
      search: 'Search',
      searchPlaceholder: 'Name, email or company',
      anyKind: 'Any kind',
      anyStatus: 'Any status',
    },
    columns: {
      kind: 'Kind',
      name: 'Name',
      contact: 'Contact',
      company: 'Company',
      status: 'Status',
      session: 'Session',
      created: 'Received',
      actions: '',
    },
    empty: 'No leads match these filters.',
    view: 'Open',
    resultCountOne: 'lead',
    resultCountMany: 'leads',
    pagination: {
      previous: 'Previous',
      next: 'Next',
      pageLabel: 'Page',
      ofLabel: 'of',
    },
  },

  leadDetail: {
    titlePrefix: 'Lead',
    sections: {
      lead: 'Lead',
      manage: 'Status and notes',
      booking: 'Booked call',
      emails: 'Email log',
    },
    fields: {
      kind: 'Kind',
      status: 'Status',
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      source: 'Source',
      message: 'Message',
      notes: 'Internal notes',
      createdAt: 'Received',
      updatedAt: 'Last updated',
      leadId: 'Lead ID',
    },
    manage: {
      statusLabel: 'Status',
      notesLabel: 'Internal notes',
      notesPlaceholder: 'What was agreed, what happens next.',
      notesHelp: 'Visible to the team only. Never sent to the client.',
      submit: 'Save changes',
      saved: 'Lead updated.',
      error: 'Could not update this lead.',
    },
    booking: {
      none: 'This is an enquiry, so no call was booked.',
      status: 'Booking status',
      sessionDate: 'Date',
      sessionTime: 'Time (IST)',
      sessionLabel: 'Session label',
      slotStatus: 'Session status',
      meetingUrl: 'Meeting link',
      meetingUrlMissing: 'No meeting link has been attached to this booking yet.',
      rescheduleCount: 'Reschedules used',
      bookingId: 'Booking ID',
      createdAt: 'Booked at',
      manageSessions: 'Manage sessions',
    },
    emails: {
      confirmation: 'Confirmation sent',
      reminder: 'Reminder sent',
      ownerAlert: 'Owner alert sent',
      note: 'Each timestamp is claimed once by an UPDATE ... WHERE column IS NULL, so a blank cell means the mail was never sent.',
    },
  },

  settings: {
    title: 'Settings',
    description: 'Operational values the booking flow reads at runtime.',
    form: {
      legend: 'Editable settings',
      submit: 'Save settings',
      saved: 'Settings saved.',
      error: 'Could not save settings.',
      meetingLinkLabel: 'Meeting link template',
      meetingLinkHelp:
        'The fallback used when Google Meet could not attach a link. Leave the booking placeholder in place if your conferencing tool needs a unique room per booking.',
      meetingLinkPlaceholder: 'https://meet.example.com/redkido/{bookingId}',
      ownerAlertLabel: 'Owner alert recipient',
      ownerAlertHelp: 'Every booked call raises an internal alert to this address.',
      ownerAlertPlaceholder: siteConfig.contact.email,
    },
  },

  login: {
    title: 'Admin sign in',
    description: 'Staff access only.',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    submit: 'Sign in',
    errors: {
      invalid: 'That email and password combination did not match.',
      invalid_input: 'Enter a valid email address and your password.',
      rate_limited: 'Too many attempts. Wait a minute and try again.',
      server: 'Sign in is temporarily unavailable. Try again shortly.',
    } as Record<string, string>,
    fallbackError: 'Sign in failed. Try again.',
  },
} as const

/* ==========================================================================
   Result codes for /admin/sessions.

   The session actions report back through `?ok=` / `?error=` rather than
   returned state, so the page stays a server component with no client-side
   form state and a no-JS submit still lands on a message. The error codes ARE
   the keys of adminCopy.sessions.errors, so an action cannot redirect with a
   code that has no message — TypeScript refuses the literal.
   ========================================================================== */

export const SESSION_NOTICE_CODES = ['created', 'blocked', 'unblocked', 'deleted'] as const
export type SessionNoticeCode = (typeof SESSION_NOTICE_CODES)[number]
export type SessionErrorCode = keyof typeof adminCopy.sessions.errors

export function isSessionNoticeCode(value: unknown): value is SessionNoticeCode {
  return typeof value === 'string' && (SESSION_NOTICE_CODES as readonly string[]).includes(value)
}

export function isSessionErrorCode(value: unknown): value is SessionErrorCode {
  // Object.hasOwn, not `in`: `'toString' in errors` is true and would render
  // a function where a sentence belongs.
  return typeof value === 'string' && Object.hasOwn(adminCopy.sessions.errors, value)
}

/* ==========================================================================
   Presentational primitives.
   ========================================================================== */

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'

const badgeToneClass: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-card-2 text-muted',
  accent: 'border-red/35 bg-red/10 text-red',
  positive: 'border-red/30 bg-red/8 text-red-deep',
  warning: 'border-line-strong bg-bg-2 text-ink',
  danger: 'border-red-deep/40 bg-red-deep/10 text-red-deep',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badgeToneClass[tone]}`}
    >
      {children}
    </span>
  )
}

export function KindBadge({ kind }: { kind: LeadKindValue }) {
  return <Badge tone={kind === 'CALL' ? 'accent' : 'neutral'}>{adminCopy.kindLabels[kind]}</Badge>
}

const leadStatusTone: Record<LeadStatusValue, BadgeTone> = {
  NEW: 'accent',
  CONTACTED: 'neutral',
  QUALIFIED: 'warning',
  WON: 'positive',
  LOST: 'danger',
}

export function LeadStatusBadge({ status }: { status: LeadStatusValue }) {
  return <Badge tone={leadStatusTone[status]}>{adminCopy.leadStatusLabels[status]}</Badge>
}

const bookingStatusTone: Record<BookingStatusValue, BadgeTone> = {
  CONFIRMED: 'positive',
  COMPLETED: 'accent',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
}

export function BookingStatusBadge({ status }: { status: BookingStatusValue }) {
  return <Badge tone={bookingStatusTone[status]}>{adminCopy.bookingStatusLabels[status]}</Badge>
}

const slotStatusTone: Record<SlotStatusValue, BadgeTone> = {
  AVAILABLE: 'positive',
  BOOKED: 'accent',
  BLOCKED: 'neutral',
}

export function SlotStatusBadge({ status }: { status: SlotStatusValue }) {
  return <Badge tone={slotStatusTone[status]}>{adminCopy.slotStatusLabels[status]}</Badge>
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function Panel({
  title,
  description,
  children,
  className = '',
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-card border border-line bg-card p-6 ${className}`}>
      {title ? (
        <header className="mb-5">
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          {description ? <p className="mt-1.5 text-sm text-muted">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-card border border-dashed border-line-strong bg-bg-2 px-4 py-8 text-center text-sm text-muted">
      {message}
    </p>
  )
}

export function Notice({ tone, children }: { tone: 'success' | 'error' | 'warning'; children: ReactNode }) {
  const toneClass =
    tone === 'error'
      ? 'border-red/40 bg-red/8 text-red-deep'
      : tone === 'warning'
        ? 'border-line-strong bg-bg-2 text-ink'
        : 'border-line-strong bg-card-2 text-ink'
  return (
    <p role="status" className={`mb-6 rounded-card border px-4 py-3 text-sm ${toneClass}`}>
      {children}
    </p>
  )
}

/** One row of a definition list. `value` is already-formatted display text. */
export function DataRow({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-semibold tracking-wide text-muted-2 uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words text-ink">{value}</dd>
    </div>
  )
}

export function DataGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">{children}</dl>
}

/* Shared form classes, so every admin surface that renders an input agrees. */
export const fieldClass =
  'rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2'
export const fieldLabelClass = 'text-xs font-semibold tracking-wide text-muted-2 uppercase'
export const primaryButtonClass =
  'rounded-full bg-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-2'
export const quietButtonClass =
  'rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-red hover:text-red'

/* ==========================================================================
   The shell.
   ========================================================================== */

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({
  pathname,
  email,
  children,
}: {
  pathname: string
  email: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg-2 text-ink">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-red focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {adminCopy.brand.skipToContent}
      </a>

      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red" aria-hidden="true" />
              <span className="font-display text-lg font-extrabold tracking-tight">
                {adminCopy.brand.name}
              </span>
              <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {adminCopy.brand.area}
              </span>
            </Link>

            <nav aria-label={adminCopy.brand.area}>
              <ul className="flex items-center gap-1">
                {adminCopy.nav.map((item) => {
                  const active = isActive(pathname, item.href, item.exact)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                          active ? 'bg-red/10 text-red' : 'text-muted hover:bg-card-2 hover:text-ink'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-muted sm:inline">
              {adminCopy.brand.signedInAs} <span className="font-semibold text-ink">{email}</span>
            </span>
            <Link href="/" className="hidden text-xs font-semibold text-muted hover:text-ink md:inline">
              {adminCopy.brand.backToSite}
            </Link>
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-red hover:text-red"
              >
                {adminCopy.brand.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="admin-main" className="mx-auto max-w-6xl px-6 py-10">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10">
        <p className="border-t border-line pt-6 text-xs text-muted-2">{adminCopy.common.copyHint}</p>
      </footer>
    </div>
  )
}
