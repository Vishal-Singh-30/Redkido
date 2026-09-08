import type { ReactNode, SVGProps } from 'react'

/**
 * Every inline SVG the marketing page needs, keyed by the short kebab-case
 * names used in src/content/*.ts. The path data is copied verbatim from the
 * source markup so each icon renders pixel-identically to the original page.
 *
 * Size and colour are NOT set here: they come from the surrounding CSS in
 * globals.css (`.problem-icon svg`, `.svc-icon svg`, `.fact svg`,
 * `.price-list li svg`, `.fit-yes svg`, `.foot-social svg`), which overrides
 * the `stroke="currentColor"` fallback below.
 *
 * Some keys are shared by two call sites whose source SVGs differed slightly
 * (`calendar`, `whatsapp`); the richer variant is used and the alternates are
 * kept under explicit keys.
 */

type IconDef = {
  /** Attributes that differ from the shared <svg> defaults in the source HTML. */
  readonly attrs?: SVGProps<SVGSVGElement>
  readonly body: ReactNode
}

const round: SVGProps<SVGSVGElement> = { strokeLinecap: 'round', strokeLinejoin: 'round' }

// ---------------------------------------------------------------------------
// Problems grid
// ---------------------------------------------------------------------------

const clock: IconDef = {
  body: (
    <>
      <path d="M12 8v5l3 2" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
}

const chat: IconDef = {
  body: <path d="M4 4h16v12H8l-4 4V4z" />,
}

const chart: IconDef = {
  body: <path d="M4 18l5-6 4 3 7-9" />,
}

const user: IconDef = {
  body: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </>
  ),
}

/** The problems-grid WhatsApp mark: plain circle plus the handset curve. */
const whatsappCircle: IconDef = {
  body: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 10.5c.3 2.5 2.3 4.5 4.8 4.8" />
    </>
  ),
}

/** The problems-grid calendar: no date hangers. */
const calendarPlain: IconDef = {
  body: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
    </>
  ),
}

// ---------------------------------------------------------------------------
// Services grid
// ---------------------------------------------------------------------------

const messageLines: IconDef = {
  attrs: round,
  body: (
    <>
      <path d="M4 5h16v11H7l-3 3V5z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
}

const sparkle: IconDef = {
  attrs: round,
  body: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </>
  ),
}

const video: IconDef = {
  attrs: round,
  body: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="1.5" />
      <path d="M16 10l5-3v10l-5-3" />
    </>
  ),
}

const calendar: IconDef = {
  attrs: round,
  body: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </>
  ),
}

const trendUp: IconDef = {
  attrs: round,
  body: (
    <>
      <path d="M4 18l5-6 4 3 7-9" />
      <path d="M15 6h5v5" />
    </>
  ),
}

const users: IconDef = {
  attrs: round,
  body: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 11c2 0 3.5 1.6 3.5 4" />
      <circle cx="16" cy="7" r="2.2" />
    </>
  ),
}

const automation: IconDef = {
  attrs: round,
  body: (
    <>
      <path d="M4 12a8 8 0 1113 6" />
      <path d="M17 15v3h3" />
    </>
  ),
}

const mail: IconDef = {
  attrs: round,
  body: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
}

/** WhatsApp: speech bubble plus the handset curve. */
const whatsapp: IconDef = {
  attrs: round,
  body: (
    <>
      <path d="M12 3a9 9 0 100 18 9 9 0 004.5-1.2L21 21l-1.2-4.5A9 9 0 0012 3z" />
      <path d="M8.5 10.5c.3 2.5 2.3 4.5 4.8 4.8" />
    </>
  ),
}

const browser: IconDef = {
  attrs: round,
  body: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 8.5h17" />
      <circle cx="6.3" cy="6.2" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
}

const share: IconDef = {
  attrs: round,
  body: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="15" r="3" />
      <path d="M10.5 9.5L14.5 13" />
    </>
  ),
}

// ---------------------------------------------------------------------------
// Ticks, crosses, chrome
// ---------------------------------------------------------------------------

/** Fact-row tick — stroke-width 1.6, no caps, exactly as in the source. */
const check: IconDef = {
  body: <path d="M4 12l5 5L20 6" />,
}

/** Pricing-list tick — the source <svg> carries no stroke-width, so it is 1. */
const checkThin: IconDef = {
  attrs: { strokeWidth: 1, ...round },
  body: <path d="M4 12l5 5L20 6" />,
}

/** "This is for you if" tick — stroke-width 1.8, round caps. */
const checkBold: IconDef = {
  attrs: { strokeWidth: 1.8, strokeLinecap: 'round' },
  body: <path d="M4 12l5 5L20 6" />,
}

/** "This is not for you if" cross — stroke-width 1.8, round caps. */
const close: IconDef = {
  attrs: { strokeWidth: 1.8, strokeLinecap: 'round' },
  body: <path d="M6 6l12 12M18 6L6 18" />,
}

/** Nav hamburger — the source svg sets width/height 24 explicitly. */
const menu: IconDef = {
  attrs: { width: 24, height: 24 },
  body: <path d="M3 6h18M3 12h18M3 18h18" />,
}

const instagram: IconDef = {
  body: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.5" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
}

const linkedin: IconDef = {
  body: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 10.5v6M8 8v.01M12 16.5v-4a2 2 0 014 0v4M12 16.5v-6" />
    </>
  ),
}

/** Footer social WhatsApp: the bubble outline on its own. */
const whatsappSocial: IconDef = {
  body: <path d="M12 3a9 9 0 100 18 9 9 0 004.5-1.2L21 21l-1.2-4.5A9 9 0 0012 3z" />,
}

const icons = {
  // problems grid
  clock,
  chat,
  chart,
  user,
  'whatsapp-circle': whatsappCircle,
  'chat-circle': whatsappCircle,
  'calendar-plain': calendarPlain,
  // services grid
  'message-lines': messageLines,
  content: messageLines,
  sparkle,
  social: sparkle,
  video,
  calendar,
  events: calendar,
  event: calendar,
  'trend-up': trendUp,
  performance: trendUp,
  users,
  training: users,
  automation,
  mail,
  email: mail,
  whatsapp,
  'whatsapp-social': whatsappSocial,
  browser,
  website: browser,
  web: browser,
  share,
  influencer: share,
  link: share,
  // ticks, crosses, chrome
  check,
  tick: check,
  'check-thin': checkThin,
  'check-bold': checkBold,
  close,
  x: close,
  menu,
  instagram,
  linkedin,
} satisfies Record<string, IconDef>

export type IconName = keyof typeof icons

export type IconProps = {
  name: IconName
  className?: string
}

export function Icon({ name, className }: IconProps) {
  const def: IconDef | undefined = icons[name]
  if (!def) return null

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
      className={className}
      {...def.attrs}
    >
      {def.body}
    </svg>
  )
}

export default Icon
