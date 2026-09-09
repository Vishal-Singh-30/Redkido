# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Marketing site + FREE call booking for Redkido Consultancy (India). Next 16
App Router, React 19, TypeScript strict, Tailwind v4, Prisma 7 on Postgres,
Resend for email, Google Calendar for Meet links.

**There is no payment anywhere.** Booking a call is free. An earlier version sold
paid consultations through Razorpay with GST and FY-scoped invoices; all of that
was removed (see the migration 20260104000000_free_calls and the commit that
added it). If you find a reference to a price, tax, invoice or gateway, it is a
leftover and should be deleted, not revived.

It was converted from `redkido-consultancy_10.html`, a single 6.6MB static page that
is still in the repo as the design reference. The 67 inline base64 JPEGs it carried
are now 18 real files in `public/images/`. **The original CSS lives verbatim inside
`src/app/globals.css`** below the `@theme` block — the marketing components depend on
those exact class names, keyframes and breakpoints, so treat that region as
copied-in rather than authored.

Two funnels share one `Lead` table, tagged by `kind`:
- **ENQUIRY** — a contact form submission. No slot, no meeting.
- **CALL** — a booked call. Has exactly one `Booking` pointing at one `Slot`.

Storing who reached out IS the product requirement; `/admin/leads` is where both
funnels land.

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
npx tsx scripts/slot-lifecycle-test.ts   # the row lock, past/blocked sessions, DB double-book guard
npx tsx scripts/validation-check.ts      # .strict() rejects injected fields; honeypot
node scripts/content-fidelity.mjs <clean.html>   # no original copy lost
```

## Architecture

**Copy and prices live in data, never in components.** `src/content/*.ts` holds every
user-facing string; `src/config/site.ts` holds identity, contact channels and the
reschedule policy. A hardcoded string in a component is a defect — `content-fidelity.mjs`
exists to catch it. The WhatsApp number and social handles are placeholders with
exactly one place to fix.

**Sessions are the product.** A `Slot` is a start and an end that an admin
published from `/admin/sessions`. There is no catalogue, no duration to choose
and nothing priced. A visitor picks a date on `/book`, sees that date's
AVAILABLE sessions in IST, and books one.

**The slot race is still real.** Payment is gone; concurrency is not. Two
visitors can choose the same session seconds apart, so `lockSlotForBooking`
still takes `SELECT ... FOR UPDATE` **inside** the transaction that writes the
booking, and rejects a session that is BOOKED, BLOCKED, past or unknown. Behind
it, a **partial unique index** (`WHERE status = 'CONFIRMED'`) makes Postgres
refuse a double-book even if the application logic is wrong. It is partial on
purpose: cancelling a booking frees the session again.

**Request schemas are `.strict()`.** `src/lib/validation.ts` rejects any key it
did not ask for rather than ignoring it. There is no price to protect any more,
but the same rule keeps a client from smuggling in a `status`, a `leadId`, or
anything else the server owns. `scripts/validation-check.ts` covers this.

**Idempotency** — `fulfilBooking` runs after the booking transaction commits and
each side effect is claimed with `UPDATE ... WHERE <col> IS NULL`
(`googleEventId`, `confirmationEmailSentAt`, `ownerAlertSentAt`), so a retry
cannot double-send or create two calendar events.

**Email never breaks a booking.** `src/lib/email.ts` no-ops without
`RESEND_API_KEY` and never throws; `fulfilBooking` swallows everything. A booking
must still succeed when Resend or Google is down — the person has committed to a
time and that is the thing worth keeping.

## Gotchas that have already cost time here

| | |
|---|---|
| `localhost` vs `127.0.0.1` | PGlite binds IPv4 only; on Windows `localhost` hits `::1` first and yields Prisma `P1001` against a server that is demonstrably listening |
| `prisma migrate dev` locally | Its native engine cannot handshake with PGlite. Author migrations with `migrate diff --from-empty --to-schema`, apply locally with `npm run db:local`, deploy to Supabase with `migrate deploy` — all from the same files |
| `datasource.url` in `prisma.config.ts` | Required for `migrate`. The driver adapter alone is not enough |
| `tsx` scripts are CJS | No `"type": "module"`, so top-level `await` is a hard error in `prisma/` and `scripts/`. Wrap in `async main()` |
| Two Supabase poolers | 6543 (transaction) for the app on Vercel, 5432 (session) for migrations and local. Swapping them fails under load, not at startup |
| dotenv order | `.env.local` must load before `.env` — dotenv keeps the **first** value. `prisma/env.ts` does this and every CLI entrypoint imports it first |
| Postgres enums | A value cannot be removed from an enum. Changing one means creating `<Name>_new`, swapping the column across with an explicit `USING` mapping, dropping the old type and renaming. Drop any index whose predicate references the column FIRST, or the swap fails with `operator does not exist` |
| Admin enum unions | `src/components/admin/shell.tsx` derives its types from the Prisma enums and uses `satisfies Record<Enum, string>`, so a changed enum breaks the build instead of rendering `undefined`. This is what caught `LeadKind` losing CONSULTATION |
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

`src/lib/google-calendar.ts` creates a Calendar event with a Meet conference when
a call is booked; `fulfilment.ts` claims it once per booking via
`googleEventId` and puts the link in the confirmation email. Zero dependencies —
the OAuth refresh is hand-rolled `fetch`.

Never throws: it is on the booking path, so every call returns `null` on failure
and fulfilment falls back to the meeting link in `/admin/settings`. Our own
`Slot` rows stay the booking authority; `getBusyIntervals()` is advisory only.

Refresh token: `node scripts/google-auth.mjs`. **While the OAuth consent screen
is in Testing, Google expires refresh tokens after 7 days** — publish it before
go-live or Meet links silently stop appearing a week in.

## Related documents

- `DEPLOYMENT.md` — go-live runbook (Supabase → Vercel → domain → Resend → Google Meet)
- `README.md` — local setup

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
