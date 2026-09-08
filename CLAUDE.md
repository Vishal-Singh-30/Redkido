# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Marketing site + paid-consultation booking for Redkido Consultancy (India). Next 16
App Router, React 19, TypeScript strict, Tailwind v4, Prisma 7 on Postgres,
Razorpay for payments, Resend for email.

It was converted from `redkido-consultancy_10.html`, a single 6.6MB static page that
is still in the repo as the design reference. The 67 inline base64 JPEGs it carried
are now 18 real files in `public/images/`. **The original CSS lives verbatim inside
`src/app/globals.css`** below the `@theme` block — the marketing components depend on
those exact class names, keyframes and breakpoints, so treat that region as
copied-in rather than authored.

Two funnels share one `Lead` table, tagged by `kind`:
- **ENQUIRY** — free, no payment, no slot
- **CONSULTATION** — a paid, time-slotted booking with a `Booking` row

## Commands

```bash
npm run dev                # :3000
npm run db:up              # SECOND TERMINAL — PGlite (Postgres 17 in WASM) on :5433
npm run db:local           # apply prisma/migrations to PGlite   <- local only
npm run db:seed            # idempotent: admin + catalogue + 21 days of slots
npm run typecheck          # tsc --noEmit
npm run build              # prisma generate && next build
```

The whole admin and both funnels can be built with no hosted database.

### Verification scripts — run these after touching money, slots or validation

```bash
npx tsx scripts/tax-invariant-test.ts    # 60k amounts + place-of-supply table + GSTIN checksum
npx tsx scripts/slot-lifecycle-test.ts   # holds, reclaim, resale detection, DB double-book guard
npx tsx scripts/validation-check.ts      # price-injection rejection, state/GSTIN errors
node scripts/content-fidelity.mjs <clean.html>   # no original copy lost
```

## Architecture

**Copy and prices live in data, never in components.** `src/content/*.ts` holds every
user-facing string; `src/config/site.ts` holds identity, contact channels and the GST
configuration. A hardcoded string in a component is a defect — `content-fidelity.mjs`
exists to catch it. The WhatsApp number and social handles are placeholders with
exactly one place to fix.

**One price resolver.** `src/lib/pricing.ts` is the only thing that may know a price,
and it reads the `ConsultationType` row. Both the booking page and `/api/checkout`
call it, so the advertised and charged figures are one value rather than two that
agree by luck. `src/lib/validation.ts` schemas contain no price/amount/total field at
all and are `.strict()`, so an injected one is a 400 rather than a silently ignored key.

**Money is integer paise everywhere.** `src/lib/money.ts` has the primitives; no float
goes near a payment. GST is computed in `src/lib/tax.ts` under a hard invariant:

```
taxablePaise + cgstPaise + sgstPaise + igstPaise === totalPaise    exactly, always
```

Tax is derived by *subtraction* from a tax-inclusive total, never rounded twice.

**Place of supply is a per-transaction resolver, not a config flag** — see `GST.md`.
Consultancy falls under IGST Act s.12(2), so a captured client state makes an
out-of-state B2C booking inter-state; a valid GSTIN overrides the form. Each booking
stores a human-readable `basis` string so the CA can audit one invoice without
reading code.

**Slot lifecycle** (`src/lib/slots.ts`) — this is the consultancy replacement for a
capacity check, and the constraint is binary: "this slot is taken".

- A PENDING checkout sets the slot `HELD` with a 15-minute `holdExpiresAt`
- Availability includes `HELD` slots whose hold has lapsed
- `lockSlotForBooking` takes `SELECT ... FOR UPDATE` **inside** the transaction and
  retires lapsed holds to `CANCELLED`
- `payment.failed` does **not** release the slot — a Razorpay order stays payable
  after a decline, so the hold is left to expire instead
- `payment.captured` re-acquires the slot; if it was resold, the booking is still
  PAID (the money is real) but flagged `slotConflict` with the confirmation withheld
- A **partial unique index** (`WHERE status = 'PAID'`) makes Postgres refuse a
  double-book even if application logic is wrong

**Idempotency** — the browser callback and the webhook race on every payment. Each
side effect is claimed with `UPDATE ... WHERE <col> IS NULL` (`paidAt`,
`confirmationEmailSentAt`, `ownerAlertSentAt`). Losing the race is a normal 200.

The one exception is the **invoice serial**: `src/lib/invoice.ts` takes the row lock
*before* calling `nextval`, because a GST invoice series must be gapless. The
claim-then-check pattern used everywhere else would leave holes.

**Email never breaks a payment.** `src/lib/email.ts` no-ops without `RESEND_API_KEY`
and never throws; `fulfilBooking` swallows everything.

## Gotchas that have already cost time here

| | |
|---|---|
| `localhost` vs `127.0.0.1` | PGlite binds IPv4 only; on Windows `localhost` hits `::1` first and yields Prisma `P1001` against a server that is demonstrably listening |
| `prisma migrate dev` locally | Its native engine cannot handshake with PGlite. Author migrations with `migrate diff --from-empty --to-schema`, apply locally with `npm run db:local`, deploy to Supabase with `migrate deploy` — all from the same files |
| `datasource.url` in `prisma.config.ts` | Required for `migrate`. The driver adapter alone is not enough |
| `tsx` scripts are CJS | No `"type": "module"`, so top-level `await` is a hard error in `prisma/` and `scripts/`. Wrap in `async main()` |
| Two Supabase poolers | 6543 (transaction) for the app on Vercel, 5432 (session) for migrations and local. Swapping them fails under load, not at startup |
| dotenv order | `.env.local` must load before `.env` — dotenv keeps the **first** value. `prisma/env.ts` does this and every CLI entrypoint imports it first |
| Webhook body | `request.text()`, never `.json()`. The HMAC covers exact bytes |
| Webhook status | Answer 2xx to every *signed* event, including unhandled types and internal errors. ~24h of retries disables the endpoint |
| Webhook dedup | Keyed on `processedAt`, not row existence — otherwise a delivery killed mid-handler is answered "duplicate" on retry and dropped forever |
| Admin enum unions | `src/components/admin/shell.tsx` derives its types from the Prisma enums and uses `satisfies Record<Enum, string>`, so a new enum member breaks the build instead of rendering `undefined` |
| `next dev` rewrites this file | It appends a `nextjs-agent-rules` block on every run. Leave it; commit it with your work |


## Front-end enhancement layer

Added after the conversion, all of it **additive**: with JS off or
`prefers-reduced-motion` set, the page renders exactly as the original HTML did.

- `src/app/globals.css` — the original CSS verbatim, then an "enhancement layer"
  at the end (scroll offsets, reveal states, `.spot`, `.proc-rail`, marquee
  pause-on-hover). Reveal styles are scoped to `html[data-motion="on"]`, which
  only JS sets — so a no-JS visitor is never left looking at `opacity: 0`.
- `src/components/motion/reveal.tsx` — IntersectionObserver + CSS, fires once.
  The default way to bring anything in on scroll. No animation-library runtime.
- `motion` (framer-motion successor) is used ONLY for scroll-**linked** values
  (progress rail, process rail).
- `src/components/three/` — Three.js hero layer, behind the copy. `hero-canvas.tsx`
  gates it: no SSR, no reduced-motion, no coarse pointer, no ≤4-core device, no
  WebGL → no load. The original CSS glows remain underneath as the fallback.
  (Spline was asked for but is not usable here — it needs a scene authored in
  their editor and served from their CDN.)
- `src/lib/section-nav.ts` — `resolveSectionHref()`. Nav hrefs are `#services`
  on `/` and `/#services` everywhere else. **Bare hashes were dead on every
  non-home route**; every nav surface must route through this.

### Layout traps this page has already hit

- **`<fieldset>` and grid items need `min-width: 0`.** Both default to a
  content-based minimum and refuse to shrink, so one wide child (the day strip)
  blows out its column and gives the whole page a horizontal scrollbar.
- **`document.scrollWidth` lies** when a descendant is a clipped scroller. To
  test real horizontal overflow, `window.scrollTo(300, 0)` and read `scrollX`.
- Images that are the sole content of a section need explicit `width`/`height`
  (see `Founder.tsx`) or the section collapses to 0px until the file loads.


### WebGL portfolio

`src/components/three/portfolio-strip.tsx` renders the original CSS marquee AND,
where the browser can run it, `webgl-strip.tsx` on top — cards bow and skew with
scroll velocity and ripple under the cursor.

- The DOM track is **never removed**. When WebGL takes over it goes to
  `opacity: 0` with its animation stopped — not `display:none` — because it
  still supplies the wrapper's height (the canvas is absolutely positioned) and
  still carries every card's alt text for assistive tech and crawlers.
- Each card is **pre-composited** into a 2D canvas (cover-fitted image + the
  `.work-card::after` gradient + the `.work-tag` pill) and used as a texture, so
  a WebGL card is pixel-identical to a CSS one. The shader only does what CSS
  cannot: rounded-corner masking, velocity deformation, the ripple.
- Card size is **measured from the live DOM**, so the responsive breakpoints in
  globals.css keep working without being restated in JS.
- Positions are computed on the mesh in `useFrame`, never via React state —
  setting state per frame would re-render 40 components at 60fps.
- Hover is hit-tested against the host element's box, not the canvas: the canvas
  is `pointer-events: none` so it is never returned by `elementFromPoint`.

`scripts/shader-preview.mjs` renders the hero fragment shader to a PNG on the
CPU — a faithful JS port of the GLSL. It exists because shaders can only be
judged by looking at them, and a headless environment that will not execute
JavaScript cannot run WebGL. **If you edit the shader, edit the port too or
delete it** — a preview that has silently drifted is worse than none.

## Google Calendar + Meet

`src/lib/google-calendar.ts` creates a Calendar event with a Meet conference on
payment confirmation; `fulfilment.ts` claims it once per booking via
`googleEventId` and puts the link in the confirmation email. Zero dependencies —
the OAuth refresh is hand-rolled `fetch`.

Never throws: it is on the payment path, so every call returns `null` on failure
and fulfilment falls back to the meeting link in `/admin/settings`. Our own
`Slot` rows stay the booking authority; `getBusyIntervals()` is advisory only.

Refresh token: `node scripts/google-auth.mjs`. **While the OAuth consent screen
is in Testing, Google expires refresh tokens after 7 days** — publish it before
go-live or Meet links silently stop appearing a week in.

## Related documents

- `DEPLOYMENT.md` — go-live runbook (Supabase → Vercel → domain → Razorpay → Resend → a real ₹1 payment)
- `GST.md` — the place-of-supply analysis and the open questions for the CA
- `README.md` — local setup

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
