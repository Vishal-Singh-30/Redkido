/**
 * Transactional email templates.
 *
 * Plain string templates — React Email is not a dependency. Inline CSS only,
 * no <table> layout, 560px content column, brand red for the accent, and a
 * hand-written plain-text alternative for every message (not stripped HTML).
 *
 * Every user-facing string lives in `emailCopy` below; the render functions
 * contain markup only. Booking a call is FREE, so nothing in this file names a
 * price, a tax head, an invoice or a payment — there is no money in the model.
 * All dates are formatted explicitly for Asia/Kolkata — the server's local zone
 * is never trusted.
 */

import { siteConfig } from '@/config/site'

export type EmailContent = { subject: string; html: string; text: string }

export type EnquiryAcknowledgementInput = { name: string }

export type BookingConfirmationInput = {
  name: string
  startsAt: Date
  /** Used only to print a duration. Omit it and the duration row is dropped. */
  endsAt?: Date | null
  /** The slot's cosmetic label, e.g. "Intro call". Falls back to a generic one. */
  sessionLabel?: string | null
  meetingUrl?: string | null
}

export type CallReminderInput = {
  name: string
  startsAt: Date
  sessionLabel?: string | null
  meetingUrl?: string | null
}

export type OwnerAlertInput = {
  kind: 'ENQUIRY' | 'CALL'
  name: string
  email: string
  phone?: string | null
  company?: string | null
  message?: string | null
  sessionLabel?: string | null
  startsAt?: Date | null
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
      'If it looks like a fit, we book you a call — free, no deck, no pitch theatre.',
    ],
    reassurance:
      'Nothing is on autopilot here. One accountable team handles marketing and operations end to end, and the same team answers this inbox.',
  },

  booking: {
    subject: (sessionLabel: string) => `Confirmed: ${sessionLabel} — ${siteConfig.name}`,
    preheader: 'Your call is booked. Time and joining link inside.',
    heading: 'Your call is booked',
    intro:
      'Your session is locked in and the time is now blocked out on our side. Everything you need to join is below.',
    /** Said plainly, because the old version of this email asked for money. */
    free: 'There is nothing to pay. The call is free — we only ask that you turn up or tell us if you cannot.',
    detailsTitle: 'Your call',
    labels: {
      session: 'Session',
      when: 'When',
      duration: 'Duration',
      meetingLink: 'Meeting link',
    },
    sessionFallback: 'Intro call',
    joinLabel: 'Join the call',
    meetingPending:
      'The meeting link is being generated and will land in your inbox shortly, well before the call.',
    durationValue: (mins: number) => `${mins} minutes`,
    rescheduleTitle: 'Need a different time?',
    /**
     * Derived from siteConfig.reschedule so the numbers can never drift from
     * the values the booking API enforces.
     */
    reschedule: [
      `You can move this call up to ${siteConfig.reschedule.maxReschedules} times, as long as you give us at least ${siteConfig.reschedule.minNoticeHours} hours' notice before the start time.`,
      'To move or cancel it, just reply to this email with the times that suit you. Inside the notice window the slot stays yours — tell us anyway and we will work something out.',
    ],
    prep: 'Come with the messy version of the problem. We would rather see the real constraints than a tidy summary.',
  },

  reminder: {
    subject: (sessionLabel: string) => `Reminder: your ${sessionLabel} is coming up`,
    preheader: 'Your call is coming up. Meeting link inside.',
    heading: 'Your call is coming up',
    intro: 'A quick reminder so the call does not sneak up on you. Here are the details again.',
    labels: { session: 'Session', when: 'When', meetingLink: 'Meeting link' },
    sessionFallback: 'Intro call',
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
      CALL: (name: string) => `[${siteConfig.name}] New call booked — ${name}`,
    },
    preheaders: {
      ENQUIRY: 'A new enquiry just came in through the website.',
      CALL: 'Someone just booked a call through the website.',
    },
    headings: {
      ENQUIRY: 'New enquiry',
      CALL: 'New call booked',
    },
    intros: {
      ENQUIRY: 'Someone submitted the enquiry form. Details below.',
      CALL: 'Someone booked a call and the session is now taken. Details below.',
    },
    labels: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      message: 'Message',
      session: 'Session',
      when: 'When',
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

/**
 * Whole minutes between two instants, or null when the pair is unusable.
 *
 * The Slot row carries both ends, so the duration is derived rather than
 * stored — there is no catalogue of fixed-length session types any more.
 */
function durationMinutes(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
  if (!isValidDate(startsAt) || !isValidDate(endsAt)) return null
  const mins = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000)
  return mins > 0 ? mins : null
}

function greetingFor(name: string | null | undefined): string {
  const clean = cleanText(name)
  return clean ? emailCopy.common.greeting(clean) : emailCopy.common.greetingFallback
}

/* ---------------------------------------------------------- html pieces -- */

type DetailRow = { label: string; valueHtml: string }

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

/**
 * The confirmation that goes to the client: who the call is with, when it is in
 * IST with the zone named, the meeting link, and how to move it.
 *
 * There is deliberately nothing else. This message used to carry a GST
 * breakdown and an invoice number; calls are free now, so a money section here
 * would be an invoice for nothing.
 */
export function bookingConfirmation(input: BookingConfirmationInput): EmailContent {
  const copy = emailCopy.booking
  const greeting = greetingFor(input.name)
  const sessionLabel = cleanText(input.sessionLabel) ?? copy.sessionFallback
  const when = formatIstDateTime(input.startsAt)
  const mins = durationMinutes(input.startsAt, input.endsAt)
  const duration = mins === null ? null : copy.durationValue(mins)
  const meetingUrl = safeUrl(input.meetingUrl)

  const details: DetailRow[] = [
    { label: copy.labels.session, valueHtml: escapeHtml(sessionLabel) },
    { label: copy.labels.when, valueHtml: escapeHtml(when) },
    ...(duration ? [{ label: copy.labels.duration, valueHtml: escapeHtml(duration) }] : []),
  ]

  const bodyHtml = [
    paragraph(escapeHtml(greeting)),
    paragraph(escapeHtml(copy.intro)),
    paragraph(escapeHtml(copy.free)),
    sectionTitle(copy.detailsTitle),
    detailRows(details),
    meetingUrl
      ? button(meetingUrl, copy.joinLabel)
      : paragraph(escapeHtml(copy.meetingPending), { muted: true }),
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
    copy.free,
    '',
    copy.detailsTitle.toUpperCase(),
    textLabelled(copy.labels.session, sessionLabel, 14),
    textLabelled(copy.labels.when, when, 14),
    ...(duration ? [textLabelled(copy.labels.duration, duration, 14)] : []),
    meetingUrl
      ? textLabelled(copy.labels.meetingLink, meetingUrl, 14)
      : `  ${copy.meetingPending}`,
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
    subject: copy.subject(sessionLabel),
    html: layout({ preheader: copy.preheader, heading: copy.heading, bodyHtml }),
    text,
  }
}

/* ------------------------------------------------------------- reminder -- */

export function callReminder(input: CallReminderInput): EmailContent {
  const copy = emailCopy.reminder
  const greeting = greetingFor(input.name)
  const sessionLabel = cleanText(input.sessionLabel) ?? copy.sessionFallback
  const when = formatIstDateTime(input.startsAt)
  const meetingUrl = safeUrl(input.meetingUrl)

  const details: DetailRow[] = [
    { label: copy.labels.session, valueHtml: escapeHtml(sessionLabel) },
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
    textLabelled(copy.labels.session, sessionLabel, 14),
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
    subject: copy.subject(sessionLabel),
    html: layout({ preheader: copy.preheader, heading: copy.heading, bodyHtml }),
    text,
  }
}

/* ---------------------------------------------------------- owner alert -- */

export function ownerAlert(input: OwnerAlertInput): EmailContent {
  const copy = emailCopy.owner
  const kind: 'ENQUIRY' | 'CALL' = input.kind === 'CALL' ? 'CALL' : 'ENQUIRY'
  const name = cleanText(input.name) ?? emailCopy.common.notProvided
  const email = cleanText(input.email)
  const phone = cleanText(input.phone)
  const company = cleanText(input.company)
  const message = cleanText(input.message)
  const sessionLabel = cleanText(input.sessionLabel)
  const when = isValidDate(input.startsAt) ? formatIstDateTime(input.startsAt) : null

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
    ...(sessionLabel
      ? [{ label: copy.labels.session, valueHtml: escapeHtml(sessionLabel) }]
      : []),
    ...(when ? [{ label: copy.labels.when, valueHtml: escapeHtml(when) }] : []),
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
    ...(sessionLabel ? [textLabelled(copy.labels.session, sessionLabel, 16)] : []),
    ...(when ? [textLabelled(copy.labels.when, when, 16)] : []),
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
