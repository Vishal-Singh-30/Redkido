/**
 * Transactional email templates.
 *
 * Plain string templates — React Email is not a dependency. Inline CSS only,
 * no <table> layout, 560px content column, brand red for the accent, and a
 * hand-written plain-text alternative for every message (not stripped HTML).
 *
 * Every user-facing string lives in `emailCopy` below; the render functions
 * contain markup only. All money is integer paise formatted through formatINR.
 * All dates are formatted explicitly for Asia/Kolkata — the server's local zone
 * is never trusted.
 */

import { siteConfig } from '@/config/site'
import { formatINR, type Paise } from '@/lib/money'

export type EmailContent = { subject: string; html: string; text: string }

/**
 * Mirrors the money + place-of-supply columns on the Booking row.
 *
 * `gstRatePercent` is load-bearing beyond display: a rate of 0 means NO tax was
 * charged on this booking (the supplier was not GST-registered when it was
 * billed), and a supplier who is not registered must never send a document that
 * names a tax head, states a rate or quotes a SAC. `bookingConfirmation` reads
 * that flag off this summary — i.e. off what was actually charged and stored —
 * and not off siteConfig, so an email for an older booking keeps rendering the
 * way that booking was billed even after the registration status changes.
 */
export type GstSummary = {
  taxablePaise: Paise
  cgstPaise: Paise
  sgstPaise: Paise
  igstPaise: Paise
  totalPaise: Paise
  /** Combined rate charged. 0 means the supply carried no tax at all. */
  gstRatePercent: number
  /** Optional — inferred from igstPaise when omitted. */
  isInterState?: boolean
}

export type EnquiryAcknowledgementInput = { name: string }

export type BookingConfirmationInput = {
  name: string
  consultationName: string
  startsAt: Date
  durationMins: number
  meetingUrl?: string | null
  invoiceNumber?: string | null
  gst: GstSummary
}

export type ConsultationReminderInput = {
  name: string
  consultationName: string
  startsAt: Date
  meetingUrl?: string | null
}

export type OwnerAlertInput = {
  kind: 'ENQUIRY' | 'CONSULTATION'
  name: string
  email: string
  phone?: string | null
  company?: string | null
  message?: string | null
  consultationName?: string | null
  startsAt?: Date | null
  amount?: Paise | null
}

/** Internal notifications go to the single published contact address. */
export const ownerAlertRecipient: string = siteConfig.contact.email

const TIME_ZONE = 'Asia/Kolkata'

const palette = {
  accent: '#e8362b',
  ink: '#171412',
  body: '#3d3733',
  muted: '#6f6862',
  hairline: '#ece8e5',
  surface: '#ffffff',
  canvas: '#f5f3f1',
  subtle: '#faf8f7',
} as const

const fontStack =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/* ------------------------------------------------------------------ copy -- */

export const emailCopy = {
  common: {
    greeting: (name: string) => `Hi ${name},`,
    greetingFallback: 'Hi there,',
    signOff: 'Warm regards,',
    signature: `Team ${siteConfig.name}`,
    replyPrompt: `Just reply to this email — it reaches us directly at ${siteConfig.contact.email}.`,
    timeZoneLabel: 'IST (Asia/Kolkata)',
    dateUnavailable: 'To be confirmed',
    notProvided: 'Not provided',
    footerLegal: `${siteConfig.legalName} · ${siteConfig.contact.email}`,
    footerReason: 'You are receiving this because you got in touch with us through our website.',
    linkFallbackIntro: 'If the button does not work, copy this link into your browser:',
    textDivider: '--------------------------------------------------',
  },

  enquiry: {
    subject: `We have your enquiry — ${siteConfig.name}`,
    preheader: 'Your enquiry has reached our team. Here is what happens next.',
    heading: 'Thanks — we have your enquiry',
    intro:
      'Your message has landed with our team and someone will read it properly, not skim it. Expect a reply within one working day.',
    whatNextTitle: 'What happens next',
    whatNext: [
      'We read your note and pull together anything relevant from our past work.',
      'You get a written reply with a straight answer and, where it helps, a suggested next step.',
      'If it looks like a fit, we propose a short call — no deck, no pitch theatre.',
    ],
    reassurance:
      'Nothing is on autopilot here. One accountable team handles marketing and operations end to end, and the same team answers this inbox.',
  },

  booking: {
    subject: (consultationName: string) => `Confirmed: ${consultationName} — ${siteConfig.name}`,
    preheader: 'Payment received, slot locked in. Meeting link and invoice details inside.',
    heading: 'Your consultation is confirmed',
    intro:
      'Payment has gone through and your slot is locked in. Everything you need for the call is below.',
    detailsTitle: 'Your booking',
    labels: {
      consultation: 'Consultation',
      when: 'When',
      duration: 'Duration',
      meetingLink: 'Meeting link',
      invoiceNumber: 'Invoice number',
    },
    joinLabel: 'Join the call',
    meetingPending:
      'The meeting link is being generated and will land in your inbox shortly, well before the call.',
    durationValue: (mins: number) => `${mins} minutes`,
    paymentTitle: 'Payment summary',
    payment: {
      taxable: 'Taxable value',
      cgst: (rate: string) => `CGST @ ${rate}%`,
      sgst: (rate: string) => `SGST @ ${rate}%`,
      igst: (rate: string) => `IGST @ ${rate}%`,
      total: 'Total paid',
      sac: (code: string) => `SAC ${code}`,
      gstin: (gstin: string) => `GSTIN ${gstin}`,
      inclusive: 'Advertised prices include GST; tax is back-computed from the total.',
    },
    rescheduleTitle: 'Reschedule policy',
    /**
     * Derived from siteConfig.reschedule so the numbers can never drift from
     * the values the booking API enforces.
     */
    reschedule: [
      `Need a different time? You can reschedule free of charge up to ${siteConfig.reschedule.minNoticeHours} hours before the call starts.`,
      `Each booking can be rescheduled up to ${siteConfig.reschedule.maxReschedules} times. Consultations are reschedulable rather than refundable, so please move the slot instead of letting it lapse.`,
      `To reschedule, reply to this email with the invoice number and two times that suit you.`,
    ],
    prep: 'Come with the messy version of the problem. We would rather see the real constraints than a tidy summary.',
  },

  reminder: {
    subject: (consultationName: string) => `Reminder: your ${consultationName} is coming up`,
    preheader: 'Your consultation is coming up. Meeting link inside.',
    heading: 'Your consultation is coming up',
    intro: 'A quick reminder so the call does not sneak up on you. Here are the details again.',
    labels: { consultation: 'Consultation', when: 'When', meetingLink: 'Meeting link' },
    joinLabel: 'Join the call',
    meetingPending:
      'We will send the meeting link separately before the call — keep an eye on this inbox.',
    tips: [
      'Join from somewhere you can talk freely; we will be asking about numbers.',
      'Have any dashboards, spend figures or campaign reports open if you have them.',
      'If something has come up, reply to this email and we will move the slot.',
    ],
  },

  owner: {
    subjects: {
      ENQUIRY: (name: string) => `[${siteConfig.name}] New enquiry — ${name}`,
      CONSULTATION: (name: string) => `[${siteConfig.name}] New paid booking — ${name}`,
    },
    preheaders: {
      ENQUIRY: 'A new enquiry just came in through the website.',
      CONSULTATION: 'A consultation was just booked and paid for.',
    },
    headings: {
      ENQUIRY: 'New enquiry',
      CONSULTATION: 'New paid booking',
    },
    intros: {
      ENQUIRY: 'Someone submitted the enquiry form. Details below.',
      CONSULTATION: 'A consultation has been booked and payment has been captured. Details below.',
    },
    labels: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      message: 'Message',
      consultation: 'Consultation',
      when: 'When',
      amount: 'Amount paid',
    },
    footer: 'Internal notification — sent to the team, not to the client.',
  },
} as const

/* ------------------------------------------------------------- utilities -- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escaped HTML with newlines preserved as <br />. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br />')
}

/** Returns the URL only when it is a safe http(s) link, otherwise null. */
function safeUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/** "Tue, 12 Mar 2026, 4:30 pm IST (Asia/Kolkata)" — never the server's zone. */
function formatIstDateTime(value: Date | null | undefined): string {
  if (!isValidDate(value)) return emailCopy.common.dateUnavailable
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value)
  return `${formatted} ${emailCopy.common.timeZoneLabel}`
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '0'
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1)
}

function greetingFor(name: string | null | undefined): string {
  const clean = cleanText(name)
  return clean ? emailCopy.common.greeting(clean) : emailCopy.common.greetingFallback
}

/* ---------------------------------------------------------- html pieces -- */

type DetailRow = { label: string; valueHtml: string }
type MoneyRow = { label: string; value: string; emphasis?: boolean }

function paragraph(html: string, options: { muted?: boolean } = {}): string {
  const color = options.muted ? palette.muted : palette.body
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${color};">${html}</p>`
}

function sectionTitle(text: string): string {
  return `<h2 style="margin:26px 0 10px 0;font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:${palette.muted};font-weight:700;">${escapeHtml(text)}</h2>`
}

function bulletList(items: readonly string[]): string {
  const rows = items
    .map(
      (item) =>
        `<li style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:${palette.body};">${escapeHtml(item)}</li>`,
    )
    .join('')
  return `<ul style="margin:0 0 14px 0;padding-left:20px;">${rows}</ul>`
}

function detailRows(rows: readonly DetailRow[]): string {
  const body = rows
    .map(
      (row, index) =>
        `<div style="padding:12px 0;${index === 0 ? '' : `border-top:1px solid ${palette.hairline};`}">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${palette.muted};font-weight:700;">${escapeHtml(row.label)}</div>
            <div style="margin-top:4px;font-size:15px;line-height:1.5;color:${palette.ink};font-weight:600;word-break:break-word;">${row.valueHtml}</div>
          </div>`,
    )
    .join('')
  return `<div style="margin:0 0 8px 0;border:1px solid ${palette.hairline};border-radius:10px;padding:4px 16px;background:${palette.subtle};">${body}</div>`
}

function moneyRows(rows: readonly MoneyRow[]): string {
  const body = rows
    .map((row, index) => {
      const labelColor = row.emphasis ? palette.ink : palette.muted
      const valueColor = row.emphasis ? palette.accent : palette.ink
      const size = row.emphasis ? '17px' : '14px'
      // The rule above the total separates it from the rows it sums. With no
      // rows above it — an untaxed booking prints the total alone — there is
      // nothing to separate, and the rule would read as a stray line.
      const border =
        row.emphasis && index > 0
          ? `border-top:1px solid ${palette.hairline};margin-top:6px;`
          : ''
      return `<div style="overflow:hidden;padding:8px 0;${border}">
            <span style="float:left;font-size:${size};line-height:1.5;color:${labelColor};font-weight:${row.emphasis ? 700 : 400};">${escapeHtml(row.label)}</span>
            <span style="float:right;font-size:${size};line-height:1.5;color:${valueColor};font-weight:700;">${escapeHtml(row.value)}</span>
          </div>
          <div style="clear:both;font-size:0;line-height:0;">&nbsp;</div>`
    })
    .join('')
  return `<div style="margin:0 0 8px 0;border:1px solid ${palette.hairline};border-radius:10px;padding:6px 16px 10px 16px;background:${palette.subtle};">${body}</div>`
}

function button(url: string, label: string): string {
  return `<div style="margin:6px 0 18px 0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:${palette.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1;padding:14px 24px;border-radius:8px;">${escapeHtml(label)}</a>
    </div>
    <p style="margin:0 0 14px 0;font-size:12px;line-height:1.6;color:${palette.muted};word-break:break-all;">${escapeHtml(emailCopy.common.linkFallbackIntro)}<br /><a href="${escapeHtml(url)}" style="color:${palette.accent};">${escapeHtml(url)}</a></p>`
}

function signature(): string {
  return `<p style="margin:22px 0 0 0;font-size:15px;line-height:1.6;color:${palette.body};">${escapeHtml(emailCopy.common.signOff)}<br /><strong style="color:${palette.ink};">${escapeHtml(emailCopy.common.signature)}</strong></p>`
}

function layout(options: {
  preheader: string
  heading: string
  bodyHtml: string
  footerNote?: string
}): string {
  const footerNote = options.footerNote ?? emailCopy.common.footerReason
  return `<div style="margin:0;padding:24px 12px;background:${palette.canvas};font-family:${fontStack};">
    <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${palette.canvas};opacity:0;">${escapeHtml(options.preheader)}</div>
    <div style="max-width:560px;margin:0 auto;background:${palette.surface};border:1px solid ${palette.hairline};border-radius:14px;overflow:hidden;">
      <div style="padding:22px 28px;border-bottom:3px solid ${palette.accent};">
        <div style="font-size:19px;line-height:1.2;font-weight:800;letter-spacing:-0.01em;color:${palette.ink};">${escapeHtml(siteConfig.name)}</div>
        <div style="margin-top:4px;font-size:13px;line-height:1.4;color:${palette.muted};">${escapeHtml(siteConfig.tagline)}</div>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-0.01em;color:${palette.ink};">${escapeHtml(options.heading)}</h1>
        ${options.bodyHtml}
      </div>
      <div style="padding:18px 28px;background:${palette.subtle};border-top:1px solid ${palette.hairline};">
        <p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:${palette.muted};">${escapeHtml(emailCopy.common.footerLegal)}</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:${palette.muted};">${escapeHtml(footerNote)}</p>
      </div>
    </div>
  </div>`
}

/* ---------------------------------------------------------- text pieces -- */

function textLines(lines: readonly string[]): string {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function textLabelled(label: string, value: string, width = 12): string {
  return `  ${label.padEnd(width, ' ')}${value}`
}

function textBullets(items: readonly string[]): string[] {
  return items.map((item) => `  - ${item}`)
}

function textFooter(): string[] {
  return [
    '',
    emailCopy.common.signOff,
    emailCopy.common.signature,
    '',
    emailCopy.common.textDivider,
    emailCopy.common.footerLegal,
    emailCopy.common.footerReason,
  ]
}

/* --------------------------------------------------- funnel 1: enquiry --- */

export function enquiryAcknowledgement(input: EnquiryAcknowledgementInput): EmailContent {
  const copy = emailCopy.enquiry
  const greeting = greetingFor(input.name)

  const bodyHtml = [
    paragraph(escapeHtml(greeting)),
    paragraph(escapeHtml(copy.intro)),
    sectionTitle(copy.whatNextTitle),
    bulletList(copy.whatNext),
    paragraph(escapeHtml(copy.reassurance)),
    paragraph(escapeHtml(emailCopy.common.replyPrompt), { muted: true }),
    signature(),
  ].join('')

  const text = textLines([
    greeting,
    '',
    copy.intro,
    '',
    copy.whatNextTitle.toUpperCase(),
    ...textBullets(copy.whatNext),
    '',
    copy.reassurance,
    '',
    emailCopy.common.replyPrompt,
    ...textFooter(),
  ])

  return {
    subject: copy.subject,
    html: layout({ preheader: copy.preheader, heading: copy.heading, bodyHtml }),
    text,
  }
}

/* ------------------------------------------- funnel 2: booking confirmed -- */

export function bookingConfirmation(input: BookingConfirmationInput): EmailContent {
  const copy = emailCopy.booking
  const greeting = greetingFor(input.name)
  const consultationName = cleanText(input.consultationName) ?? siteConfig.name
  const when = formatIstDateTime(input.startsAt)
  const duration = copy.durationValue(input.durationMins)
  const meetingUrl = safeUrl(input.meetingUrl)
  const invoiceNumber = cleanText(input.invoiceNumber)

  const { gst } = input
  // No tax on this booking -> print the total and nothing else. See GstSummary:
  // the flag comes from the stored breakdown, never from siteConfig.
  const taxCharged = gst.gstRatePercent !== 0
  const interState = gst.isInterState ?? gst.igstPaise > 0
  const fullRate = formatRate(gst.gstRatePercent)
  const halfRate = formatRate(gst.gstRatePercent / 2)

  const totalRow: MoneyRow = {
    label: copy.payment.total,
    value: formatINR(gst.totalPaise),
    emphasis: true,
  }

  const money: MoneyRow[] = taxCharged
    ? [
        { label: copy.payment.taxable, value: formatINR(gst.taxablePaise) },
        ...(interState
          ? [{ label: copy.payment.igst(fullRate), value: formatINR(gst.igstPaise) }]
          : [
              { label: copy.payment.cgst(halfRate), value: formatINR(gst.cgstPaise) },
              { label: copy.payment.sgst(halfRate), value: formatINR(gst.sgstPaise) },
            ]),
        totalRow,
      ]
    : [totalRow]

  const details: DetailRow[] = [
    { label: copy.labels.consultation, valueHtml: escapeHtml(consultationName) },
    { label: copy.labels.when, valueHtml: escapeHtml(when) },
    { label: copy.labels.duration, valueHtml: escapeHtml(duration) },
    ...(invoiceNumber
      ? [{ label: copy.labels.invoiceNumber, valueHtml: escapeHtml(invoiceNumber) }]
      : []),
  ]

  // SAC, GSTIN and the "prices include GST" line are all assertions of a live
  // registration. An untaxed booking gets none of them.
  const taxNotes: string[] = taxCharged
    ? [
        copy.payment.sac(siteConfig.tax.sacCode),
        ...(siteConfig.tax.supplierGstin ? [copy.payment.gstin(siteConfig.tax.supplierGstin)] : []),
        ...(siteConfig.tax.pricesIncludeTax ? [copy.payment.inclusive] : []),
      ]
    : []

  const bodyHtml = [
    paragraph(escapeHtml(greeting)),
    paragraph(escapeHtml(copy.intro)),
    sectionTitle(copy.detailsTitle),
    detailRows(details),
    meetingUrl
      ? button(meetingUrl, copy.joinLabel)
      : paragraph(escapeHtml(copy.meetingPending), { muted: true }),
    sectionTitle(copy.paymentTitle),
    moneyRows(money),
    taxNotes.length > 0
      ? paragraph(taxNotes.map((note) => escapeHtml(note)).join(' &middot; '), { muted: true })
      : '',
    sectionTitle(copy.rescheduleTitle),
    copy.reschedule.map((line) => paragraph(escapeHtml(line))).join(''),
    paragraph(escapeHtml(copy.prep)),
    paragraph(escapeHtml(emailCopy.common.replyPrompt), { muted: true }),
    signature(),
  ].join('')

  const text = textLines([
    greeting,
    '',
    copy.intro,
    '',
    copy.detailsTitle.toUpperCase(),
    textLabelled(copy.labels.consultation, consultationName, 14),
    textLabelled(copy.labels.when, when, 14),
    textLabelled(copy.labels.duration, duration, 14),
    ...(invoiceNumber ? [textLabelled(copy.labels.invoiceNumber, invoiceNumber, 14)] : []),
    meetingUrl
      ? textLabelled(copy.labels.meetingLink, meetingUrl, 14)
      : `  ${copy.meetingPending}`,
    '',
    copy.paymentTitle.toUpperCase(),
    ...money.map((row) => textLabelled(row.label, row.value, 20)),
    ...(taxNotes.length > 0 ? [`  ${taxNotes.join(' · ')}`] : []),
    '',
    copy.rescheduleTitle.toUpperCase(),
    ...copy.reschedule.map((line) => `  ${line}`),
    '',
    copy.prep,
    '',
    emailCopy.common.replyPrompt,
    ...textFooter(),
  ])

  return {
    subject: copy.subject(consultationName),
    html: layout({ preheader: copy.preheader, heading: copy.heading, bodyHtml }),
    text,
  }
}

/* ------------------------------------------------------------- reminder -- */

export function consultationReminder(input: ConsultationReminderInput): EmailContent {
  const copy = emailCopy.reminder
  const greeting = greetingFor(input.name)
  const consultationName = cleanText(input.consultationName) ?? siteConfig.name
  const when = formatIstDateTime(input.startsAt)
  const meetingUrl = safeUrl(input.meetingUrl)

  const details: DetailRow[] = [
    { label: copy.labels.consultation, valueHtml: escapeHtml(consultationName) },
    { label: copy.labels.when, valueHtml: escapeHtml(when) },
  ]

  const bodyHtml = [
    paragraph(escapeHtml(greeting)),
    paragraph(escapeHtml(copy.intro)),
    detailRows(details),
    meetingUrl
      ? button(meetingUrl, copy.joinLabel)
      : paragraph(escapeHtml(copy.meetingPending), { muted: true }),
    bulletList(copy.tips),
    paragraph(escapeHtml(emailCopy.common.replyPrompt), { muted: true }),
    signature(),
  ].join('')

  const text = textLines([
    greeting,
    '',
    copy.intro,
    '',
    textLabelled(copy.labels.consultation, consultationName, 14),
    textLabelled(copy.labels.when, when, 14),
    meetingUrl
      ? textLabelled(copy.labels.meetingLink, meetingUrl, 14)
      : `  ${copy.meetingPending}`,
    '',
    ...textBullets(copy.tips),
    '',
    emailCopy.common.replyPrompt,
    ...textFooter(),
  ])

  return {
    subject: copy.subject(consultationName),
    html: layout({ preheader: copy.preheader, heading: copy.heading, bodyHtml }),
    text,
  }
}

/* ---------------------------------------------------------- owner alert -- */

export function ownerAlert(input: OwnerAlertInput): EmailContent {
  const copy = emailCopy.owner
  const kind: 'ENQUIRY' | 'CONSULTATION' = input.kind === 'CONSULTATION' ? 'CONSULTATION' : 'ENQUIRY'
  const name = cleanText(input.name) ?? emailCopy.common.notProvided
  const email = cleanText(input.email)
  const phone = cleanText(input.phone)
  const company = cleanText(input.company)
  const message = cleanText(input.message)
  const consultationName = cleanText(input.consultationName)
  const when = isValidDate(input.startsAt) ? formatIstDateTime(input.startsAt) : null
  const amount =
    typeof input.amount === 'number' && Number.isFinite(input.amount) && input.amount >= 0
      ? formatINR(input.amount)
      : null

  const rows: DetailRow[] = [
    { label: copy.labels.name, valueHtml: escapeHtml(name) },
    {
      label: copy.labels.email,
      valueHtml: email
        ? `<a href="mailto:${escapeHtml(email)}" style="color:${palette.accent};text-decoration:none;">${escapeHtml(email)}</a>`
        : escapeHtml(emailCopy.common.notProvided),
    },
    ...(phone ? [{ label: copy.labels.phone, valueHtml: escapeHtml(phone) }] : []),
    ...(company ? [{ label: copy.labels.company, valueHtml: escapeHtml(company) }] : []),
    ...(consultationName
      ? [{ label: copy.labels.consultation, valueHtml: escapeHtml(consultationName) }]
      : []),
    ...(when ? [{ label: copy.labels.when, valueHtml: escapeHtml(when) }] : []),
    ...(amount ? [{ label: copy.labels.amount, valueHtml: escapeHtml(amount) }] : []),
    ...(message ? [{ label: copy.labels.message, valueHtml: escapeMultiline(message) }] : []),
  ]

  const bodyHtml = [paragraph(escapeHtml(copy.intros[kind])), detailRows(rows)].join('')

  const text = textLines([
    copy.intros[kind],
    '',
    textLabelled(copy.labels.name, name, 16),
    textLabelled(copy.labels.email, email ?? emailCopy.common.notProvided, 16),
    ...(phone ? [textLabelled(copy.labels.phone, phone, 16)] : []),
    ...(company ? [textLabelled(copy.labels.company, company, 16)] : []),
    ...(consultationName ? [textLabelled(copy.labels.consultation, consultationName, 16)] : []),
    ...(when ? [textLabelled(copy.labels.when, when, 16)] : []),
    ...(amount ? [textLabelled(copy.labels.amount, amount, 16)] : []),
    ...(message ? ['', copy.labels.message.toUpperCase(), message] : []),
    '',
    emailCopy.common.textDivider,
    copy.footer,
  ])

  return {
    subject: copy.subjects[kind](name),
    html: layout({
      preheader: copy.preheaders[kind],
      heading: copy.headings[kind],
      bodyHtml,
      footerNote: copy.footer,
    }),
    text,
  }
}
