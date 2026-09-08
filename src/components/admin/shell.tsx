/**
 * Admin chrome + the single copy dictionary for the whole admin area.
 *
 * WHY THE COPY LIVES HERE: the project rule is that no component may inline a
 * user-facing string — copy belongs to one module per surface. src/content/*.ts
 * is the marketing surface and is owned elsewhere; the admin area is internal
 * back-office copy and owns this module. Every admin page, chart and action
 * message reads from `adminCopy`. Nothing below this constant may contain a
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

   Declared as literal tuples rather than imported from the generated Prisma
   enums so that filter <select> options, badge maps and zod schemas all read
   from one list. The literals are structurally identical to the Prisma string
   unions, so they assign into `where` clauses without a cast.
   ========================================================================== */

export const LEAD_KINDS = ['ENQUIRY', 'CONSULTATION'] as const
export type LeadKindValue = LeadKind

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const satisfies readonly LeadStatus[]
export type LeadStatusValue = LeadStatus

export const BOOKING_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'] as const satisfies readonly BookingStatus[]
export type BookingStatusValue = BookingStatus

// Derived from the Prisma enums rather than retyped. These arrays exist because
// the filter UI needs something iterable, but the *types* come from the schema,
// so adding an enum member breaks the label maps below at compile time instead
// of silently rendering `undefined` in the admin. (HELD was added exactly this
// way and this is how it was caught.)
export const SLOT_STATUSES = [
  'AVAILABLE',
  'HELD',
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
   Formatting. Bookings are Indian consultations billed under Indian GST, so
   the admin reads every timestamp in IST regardless of where the lambda runs.
   ========================================================================== */

export const ADMIN_LOCALE = 'en-IN'
export const ADMIN_TIME_ZONE = 'Asia/Kolkata'

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

const shortDayFormatter = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return adminCopy.common.empty
  return dateTimeFormatter.format(value)
}

export function formatDate(value: Date | null | undefined): string {
  if (!value) return adminCopy.common.empty
  return dateFormatter.format(value)
}

/** Axis label for a day bucket. Buckets are UTC days, so the formatter is too. */
export function formatDayBucket(value: Date): string {
  return shortDayFormatter.format(value)
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
    copyHint: 'All timestamps are shown in India Standard Time (IST).',
    notFound: 'That record no longer exists.',
    genericError: 'Something went wrong. Nothing was saved.',
    validationError: 'Please check the highlighted fields and try again.',
  },

  kindLabels: {
    ENQUIRY: 'Enquiry',
    CONSULTATION: 'Consultation',
  } satisfies Record<LeadKindValue, string>,

  leadStatusLabels: {
    NEW: 'New',
    CONTACTED: 'Contacted',
    QUALIFIED: 'Qualified',
    WON: 'Won',
    LOST: 'Lost',
  } satisfies Record<LeadStatusValue, string>,

  bookingStatusLabels: {
    PENDING: 'Pending',
    PAID: 'Paid',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
  } satisfies Record<BookingStatusValue, string>,

  slotStatusLabels: {
    AVAILABLE: 'Available',
    HELD: 'Held — awaiting payment',
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
    description: 'Both funnels at a glance. Revenue counts paid consultations only.',
    tiles: {
      totalLeads: 'Total leads',
      totalLeadsSub: 'Enquiries and consultations combined',
      enquiries: 'Enquiries',
      enquiriesSub: 'Contact-form funnel',
      paidConsultations: 'Paid consultations',
      paidConsultationsSub: 'Bookings with a settled payment',
      revenue: 'Revenue',
      revenueSub: 'Sum of paid bookings, tax inclusive',
    },
    trend: {
      title: 'Last 30 days',
      description: 'New leads against consultations that were paid for.',
      chartLabel: 'Leads and paid bookings per day over the last 30 days',
      leadsSeries: 'Leads',
      bookingsSeries: 'Paid bookings',
    },
    revenueByType: {
      title: 'Revenue by consultation type',
      description: 'Paid bookings only, grouped by the catalogue entry sold.',
      chartLabel: 'Revenue in rupees by consultation type',
    },
    recent: {
      title: 'Recent activity',
      description: 'The ten most recent leads across both funnels.',
      empty: 'No leads have come in yet.',
      view: 'Open',
    },
  },

  leads: {
    title: 'Leads',
    description: 'One list for both funnels. The kind badge says which one.',
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
      amount: 'Amount',
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
      booking: 'Consultation booking',
      money: 'Amount breakdown',
      tax: 'Place of supply (audit trail)',
      payment: 'Payment and invoice',
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
      none: 'This is an enquiry, so it has no booking.',
      status: 'Booking status',
      type: 'Consultation type',
      duration: 'Duration',
      durationUnit: 'minutes',
      slotStart: 'Slot starts',
      slotEnd: 'Slot ends',
      slotStatus: 'Slot status',
      meetingUrl: 'Meeting link',
      rescheduleCount: 'Reschedules used',
      bookingId: 'Booking ID',
      createdAt: 'Booked at',
    },
    money: {
      taxable: 'Taxable value',
      cgst: 'CGST',
      sgst: 'SGST',
      igst: 'IGST',
      total: 'Total charged',
      gstRate: 'GST rate',
      sacCode: 'SAC code',
      inclusiveNote: 'Advertised prices include GST; the taxable value is back-computed from the total.',
      invariant: 'Taxable + tax must equal the total. Any row where it does not is a bug, not a rounding artefact.',
      invariantBroken: 'MISMATCH — taxable plus tax does not equal the total on this booking.',
    },
    tax: {
      supplyType: 'Supply type',
      interState: 'Inter-state (IGST)',
      intraState: 'Intra-state (CGST + SGST)',
      placeOfSupply: 'Place of supply (state code)',
      clientState: 'Client state code',
      clientGstin: 'Client GSTIN',
      supplierState: 'Supplier state',
      basis: 'Basis recorded at checkout',
      basisRegistered:
        'Recipient is GST-registered — place of supply is the location of the recipient. IGST Act s.12(2)(a).',
      basisAddressOnRecord:
        'Recipient is unregistered but an address was on record — place of supply is that address. IGST Act s.12(2)(b)(i).',
      basisSupplierLocation:
        'Recipient is unregistered with no address on record — place of supply falls back to the location of the supplier. IGST Act s.12(2)(b)(ii).',
      derivedWarning:
        'This basis line is derived from the columns stored on the booking at checkout, not from a stored sentence. The columns beside it are the primary record.',
    },
    payment: {
      paidAt: 'Paid at',
      invoiceNumber: 'Invoice number',
      invoiceFy: 'Invoice financial year',
      razorpayOrderId: 'Razorpay order ID',
      razorpayPaymentId: 'Razorpay payment ID',
      unpaid: 'No payment has settled against this booking.',
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
        'Sent in the confirmation email. Leave the booking placeholder in place if your conferencing tool needs a unique room per booking.',
      meetingLinkPlaceholder: 'https://meet.example.com/redkido/{bookingId}',
      ownerAlertLabel: 'Owner alert recipient',
      ownerAlertHelp: 'Every paid booking raises an internal alert to this address.',
      ownerAlertPlaceholder: siteConfig.contact.email,
    },
    gst: {
      title: 'GST configuration (read only)',
      description:
        'These values come from src/config/site.ts and are deployed with the code, not editable here. They end up on every invoice.',
      rate: 'GST rate',
      sac: 'SAC code',
      sacNote: 'SAC 9983 — other professional, technical and business services. Not 9996.',
      supplierState: 'Supplier state',
      supplierStateCode: 'Supplier state code',
      supplierGstin: 'Supplier GSTIN',
      gstinMissing: 'NOT SET',
      registered: 'GST registered',
      registeredYes: 'Yes',
      registeredNo: 'No — no GST is charged',
      pricesIncludeTax: 'Prices include tax',
      invoicePrefix: 'Invoice prefix',
      warningTitle: 'Before the first invoice',
      warningBody:
        'Place of supply for consultancy follows the general rule in IGST Act s.12(2): the location of the recipient when registered, the address on record when not, and the supplier location only when neither is known. The CA must confirm the supplier GSTIN above before a single invoice is issued.',
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
  return <Badge tone={kind === 'CONSULTATION' ? 'accent' : 'neutral'}>{adminCopy.kindLabels[kind]}</Badge>
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
  PENDING: 'warning',
  PAID: 'positive',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
}

export function BookingStatusBadge({ status }: { status: BookingStatusValue }) {
  return <Badge tone={bookingStatusTone[status]}>{adminCopy.bookingStatusLabels[status]}</Badge>
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
