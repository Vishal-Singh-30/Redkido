# Redkido Consultancy

Marketing site, free call booking and admin for Redkido Consultancy.

Next 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 (CSS `@theme`, no
`tailwind.config.js`) · Prisma 7 with `@prisma/adapter-pg` · Resend · Google Calendar.

Booking a call is **free** — there is no payment step, no gateway and no invoicing
anywhere in this codebase.

---

## Local setup

Run these in order. Steps 2 and 3+ need two terminals.

```bash
# 1. Install
npm install

# 2. Copy the env template and fill nothing in — the defaults already work
cp .env.example .env.local        # skip if .env.local is already present
```

```bash
# 3. SECOND TERMINAL — start the local database and leave it running.
#    PGlite listens on port 5433; data lives in ./.pglite (gitignored).
npm run db:up
```

```bash
# 4. Back in the first terminal
npm run db:local                  # applies prisma/migrations to PGlite
npm run db:seed                   # admin user + a rolling window of bookable sessions
npm run dev                       # http://localhost:3000
```

Order matters. `db:local` and `db:seed` both connect to the server from step 3,
so starting them before `db:up` fails with a connection refused on 5433.

### Three local-only gotchas, each of which costs an hour

**Use `127.0.0.1`, never `localhost`.** PGlite's socket server binds IPv4 only,
and on Windows `localhost` resolves to `::1` first. The symptom is Prisma
`P1001: Can't reach database server` pointing at a server that `netstat` shows
`LISTENING` and that `psql` connects to happily. `.env.local` is already correct.

**`prisma migrate dev` does not work against PGlite — use `npm run db:local`.**
Prisma 7's migrate engine is a native binary that speaks the wire protocol
directly, and it cannot complete a handshake with PGlite; the TCP connection
succeeds and the handshake does not. Nothing else is affected: the app runtime
goes through `@prisma/adapter-pg` → `pg` and works fine, and `prisma migrate
deploy` against Supabase works normally.

So the migration workflow is split, and both halves consume the SAME files in
`prisma/migrations/`, so local and production cannot drift:

| | Author a migration | Apply it |
| --- | --- | --- |
| Local (PGlite) | `prisma migrate diff --from-empty --to-schema ... --script` | `npm run db:local` |
| Supabase | same files | `npm run db:deploy` |

**Scripts run through `tsx` are CJS, so top-level `await` is a hard error.**
`package.json` has no `"type": "module"`, so anything under `prisma/` or
`scripts/` that `tsx` executes must wrap its awaits in an `async main()`.
(`.mjs` files are exempt — they are ESM.)

### Why `DATABASE_POOL_MAX=1` is mandatory

PGlite is a single-connection Postgres. A second concurrent connection does not
error — it **hangs**, and the request that opened it never returns. Anything above
`1` therefore turns into a stalled dev server that looks like a Next.js problem.

The same value is required in production for a different reason: on Vercel each
lambda instance holds its own pool, so a pool size of _n_ becomes _n_ × instances
against the Supabase pooler.

`src/lib/prisma.ts` and `prisma.config.ts` both read it, defaulting to `1` if unset.

### Working without a hosted database

The entire admin — auth, leads, bookings, slot management — can be built and
exercised against PGlite alone. You do not need Supabase, and you do not need
Resend or Google credentials: with those keys empty (as they are in `.env.local`)
the app runs in a degraded-but-working mode. Calls can still be booked and the
admin is fully usable; the confirmation email and the Google Meet link are simply
skipped rather than throwing.

Paste a Resend key or Google OAuth credentials into `.env.local` only when you
are actually exercising email or Meet links.

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server on :3000 |
| `npm run build` | `prisma generate` then `next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:up` | PGlite server on :5433 (run in its own terminal) |
| `npm run db:local` | Apply `prisma/migrations/*` to PGlite — **use this locally** |
| `npm run db:migrate` | `prisma migrate dev` — real Postgres only, NOT PGlite |
| `npm run db:deploy` | `prisma migrate deploy` — apply only, for real environments |
| `npm run db:seed` | Idempotent seed; safe to re-run any time |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset:local` | Delete `.pglite` and start over |

### Verification scripts

These are executable checks, not documentation. Run them after touching the
money, slot or validation code.

| Script | Proves |
| --- | --- |
| `npx tsx scripts/slot-lifecycle-test.ts` | the transactional row lock, past/blocked sessions, and the database double-book guard |
| `npx tsx scripts/slot-lifecycle-test.ts` | The row lock rejects taken, blocked and past sessions; Postgres refuses a second CONFIRMED booking on one session |
| `npx tsx scripts/validation-check.ts` | `.strict()` rejects any field the client invents; the honeypot works |
| `node scripts/content-fidelity.mjs <clean.html>` | Every user-facing string from the original HTML still exists in `src/content` |

---

## Things that bite

**Env load order.** `dotenv` keeps the **first** value it sees for a key.
`prisma/env.ts` therefore loads `.env.local` before `.env`, and every entrypoint
outside Next's own env handling (`prisma.config.ts`, `prisma/seed.ts`) imports it
as its first line. Reordering those imports makes a placeholder `DATABASE_URL`
win silently.

**Migration port.** Migrations always go through the **session** pooler — 5432 on
Supabase, 5433 for local PGlite. The transaction pooler (6543) is for the running
app only; `prisma migrate` needs prepared statements and advisory locks it does
not provide.

**The slot race is real even without payment.** Two visitors can pick the same
session seconds apart, so `lockSlotForBooking` takes `SELECT ... FOR UPDATE`
inside the booking transaction, and a partial unique index
(`WHERE status = 'CONFIRMED'`) makes Postgres refuse a double-book regardless.
It is partial on purpose: cancelling a booking frees the session again.

**Copy lives in data, not components.** Every user-facing string and list is in
`src/content/*.ts` or `src/config/site.ts`. Components read them.

**The seed is idempotent.** It upserts the admin (re-applying `ADMIN_PASSWORD`)
and tops up a rolling 21-day window of `AVAILABLE` weekday sessions at 11:00 /
14:00 / 16:00 IST, skipping any that already exist. Publish more from
`/admin/sessions` — the site cannot take a booking for a day with no sessions.

---

## Deployment

Not covered here — see [DEPLOYMENT.md](DEPLOYMENT.md) for Supabase, Vercel, DNS,
Resend and Google Meet.
