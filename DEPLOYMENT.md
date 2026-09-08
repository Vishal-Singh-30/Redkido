# Go-live runbook

Do these in order. Each step depends on the one before it, and two of them
(Razorpay webhook, Resend domain) genuinely cannot be done until the domain is
already resolving.

**Nothing is proven until Step 9 passes.** A green build is not evidence that
payments work.

---

## Step 0 — Two decisions that remove the slowest steps

Before anything technical:

1. **If this consultancy bills as REDKIDO or a related entity, reuse the existing
   Razorpay account and the existing Resend domain.** KYC verification and DNS
   propagation are the two slowest items here — days, not hours. Reusing an
   already-verified account removes both from the critical path entirely. Only
   open a fresh Razorpay account if the legal entity receiving the money is
   genuinely different.
2. **Ask the CA to confirm the GST head before the first invoice goes out.**
   See [GST.md](GST.md). Getting it wrong means reissuing invoices, which is far
   more painful than asking now.

Also do this on day one, before you need it:

3. **Create a Vercel Deploy Hook** (Project → Settings → Git → Deploy Hooks).
   Vercel's GitHub integration silently skips pushes — no error, no build, the
   commit just never deploys. When that happens the hook is your way out:
   `curl -X POST <hook-url>`. Save it somewhere you will find it at 11pm.

---

## Step 1 — Supabase project

1. Create a project in the **Mumbai (ap-south-1)** region. Latency to Indian
   clients and to Razorpay matters, and data residency is simpler.
2. Set a strong database password and store it immediately — Supabase shows it once.
3. Project Settings → Database → **Connection string**. Copy **both** of these:

   | Purpose | Port | Shape |
   |---|---|---|
   | Transaction pooler — the app on Vercel | **6543** | `postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres` |
   | Session pooler — migrations, seeding, local | **5432** | `postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` |

> **The single most expensive mistake in this stack.** These two URLs differ by
> four characters and both "work" when you test them by hand. Put the 5432
> session pooler where serverless traffic hits it and it exhausts connections
> under real load — not at deploy time, not in testing, but on your first busy
> afternoon. Put the 6543 transaction pooler in migrations and they fail on the
> advisory lock Prisma takes.
>
> - `DATABASE_URL` in **Vercel** = **6543**
> - `DATABASE_URL` in **.env.local** and for every `prisma migrate` = **5432**
>
> Append `?pgbouncer=true&connection_limit=1` to the 6543 URL.

---

## Step 2 — Migrate and seed Supabase

From your machine, with `.env.local` temporarily pointing at the **5432** URL:

```bash
npm run db:deploy      # prisma migrate deploy — applies prisma/migrations/*
npm run db:seed        # admin user + consultation catalogue + slots
```

`db:seed` reads `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Use a real password — this is
the live admin login. **These two vars never go into Vercel**; they exist only
for the seed script, and shipping them to the app is a standing credential leak
for no benefit.

Verify in the Supabase table editor that `ConsultationType` has rows and `Admin`
has exactly one. Then point `.env.local` back at PGlite.

> `db:deploy` is the real Prisma migrate path and works normally against
> Supabase. Locally we apply the same SQL with `npm run db:local` instead,
> because Prisma's migrate engine cannot complete a handshake with PGlite — see
> [README.md](README.md). Both paths consume the identical files in
> `prisma/migrations/`, so local and production cannot drift.

---

## Step 3 — Push to GitHub

```bash
git init && git add -A
git commit -m "Redkido consultancy site"
git branch -M main
git remote add origin git@github.com:<you>/redkido.git
git push -u origin main
```

`.gitignore` already excludes `.env.local`, `.pglite` and the generated Prisma
client. Confirm with `git status` that no `.env*` file is staged before pushing.

---

## Step 4 — Vercel import and environment variables

Import the repo. Framework preset: Next.js. Leave the build command at the
default — `package.json`'s `build` script already runs `prisma generate` first,
which is required because the generated client is gitignored.

Add these in Project → Settings → Environment Variables (Production, plus
Preview if you want previews to work):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **6543** transaction pooler + `?pgbouncer=true&connection_limit=1` |
| `DATABASE_POOL_MAX` | `1` |
| `AUTH_SECRET` | `openssl rand -base64 32` — fresh, not the dev one |
| `RAZORPAY_KEY_ID` | Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | **set in Step 7** — a different value from the key secret |
| `RESEND_API_KEY` | **set in Step 8** |
| `EMAIL_FROM` | `Redkido <hello@send.redkido.com>` — see Step 8 |
| `NEXT_PUBLIC_SITE_URL` | `https://redkido.com` (final domain, no trailing slash) |

Do **not** add `ADMIN_EMAIL` or `ADMIN_PASSWORD`.

> **Environment variables never reach an existing build.** Vercel bakes them in
> at build time. Adding or changing one does nothing to the running deployment
> until you redeploy. Every time this runbook says "add a variable", it also
> means "redeploy afterwards" — the dashboard's *Redeploy* button is enough, you
> do not need a new commit.

Deploy. Confirm the `.vercel.app` URL renders the marketing page before touching DNS.

---

## Step 5 — Domain

In Vercel: Project → Settings → Domains → add `redkido.com` and `www.redkido.com`.

At your registrar, add **only** the records Vercel shows you:

- an **A** record on the apex (`@`) pointing at the IP Vercel displays
- a **CNAME** on `www` pointing at the host Vercel displays

Use the values from Vercel's own panel. They have changed over time, so an IP
copied from an old blog post may point somewhere stale.

> **Never switch nameservers to Vercel if this domain already handles email.**
> Delegating nameservers moves *all* DNS, and your existing MX records do not
> come with it. Mail stops — usually silently, and usually noticed a day later
> when someone asks why a client never replied. Adding an A record and a CNAME
> changes web traffic only and leaves MX untouched. The same caution applies to
> the Resend records in Step 8.

Wait for Vercel to show the domain as Valid and the certificate as issued.

---

## Step 6 — Redeploy with the real site URL

`NEXT_PUBLIC_SITE_URL` is compiled into the client bundle. If it still says
`.vercel.app`, the Razorpay checkout callback and every email link point at the
wrong host. Redeploy now that the domain resolves.

---

## Step 7 — Razorpay webhook

Razorpay Dashboard → Settings → Webhooks → Add New Webhook.

- **URL:** `https://redkido.com/api/razorpay/webhook`
- **Secret:** generate a new random string. This is **not** your API key secret —
  it is a separate value that exists only to sign webhook deliveries.
- **Events:** `payment.captured`, `payment.failed`, `order.paid`

Put that secret in Vercel as `RAZORPAY_WEBHOOK_SECRET`, then **redeploy**.

> The handler answers 2xx to every correctly-signed event, including ones it does
> not act on. That is deliberate: a non-2xx makes Razorpay retry, and roughly 24
> hours of failing retries gets the endpoint **disabled** — after which payments
> succeed but bookings never confirm. That is the worst failure mode available,
> because the money arrives and the customer hears nothing.

---

## Step 8 — Resend

Add the domain in Resend as a **subdomain**: `send.redkido.com`, not the root.

Resend needs an MX record and an SPF TXT record. On the root domain those
collide with the MX records your actual mailbox provider (Google Workspace,
Zoho, etc.) uses, and inbound mail to `hello@redkido.com` breaks. On a dedicated
sending subdomain there is nothing to collide with.

Add the DKIM/SPF/MX records Resend gives you **at your registrar**, as individual
records — again, not by delegating nameservers.

Once verified, set in Vercel and redeploy:

- `RESEND_API_KEY`
- `EMAIL_FROM` = `Redkido <hello@send.redkido.com>`

> `EMAIL_FROM` must carry a display name — Resend rejects a bare address. The
> sending address must be on the domain you actually verified, so a `From` on the
> root domain fails when only the subdomain is verified. `replyTo` is set to the
> real `hello@redkido.com` so replies land in the human inbox.

---

## Step 8b — Google Calendar + Meet (optional, but this is the meeting link)

Without this, a confirmed booking carries whatever static link you put in
`/admin/settings`. With it, each booking gets its own Google Calendar event with
a real Meet conference, the client is invited, and the join link goes into the
confirmation email.

The app runs fine either way — every Google call returns `null` on failure and
fulfilment falls back to the settings link, because this sits on the payment
path and must never be able to break it.

1. **Google Cloud Console** → new (or existing) project → **APIs & Services**
   → Enable **Google Calendar API**.
2. **Credentials** → Create OAuth client ID → **Web application**.
   Authorised redirect URI: `http://localhost:53682/callback`
3. **OAuth consent screen** → add the calendar owner as a **Test user**.
4. Get a refresh token — this is the step that eats an afternoon otherwise:

   ```bash
   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/google-auth.mjs
   ```

   Open the printed URL **signed in as the calendar owner**, approve, and the
   script prints the token.

5. Set in Vercel and **redeploy**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`.

> **Publish the consent screen before go-live.** While it is in *Testing*,
> Google expires refresh tokens after **7 days** — the integration works all
> week, then silently stops minting Meet links. Consent screen → Publish app.

> Use a dedicated calendar id rather than `primary` if you would rather client
> consultations did not land on someone's personal calendar. `getBusyIntervals()`
> reads the same calendar to hide slots the team is genuinely busy for — advisory
> only, since our own `Slot` rows stay the booking authority and a Google outage
> must not be able to block a checkout.

---

## Step 9 — One real ₹1 payment, end to end

This is the only step that proves anything.

1. Temporarily set a consultation's `pricePaise` to `100` (₹1) in the Supabase
   table editor. Do not add a "test price" code path — you want to exercise the
   real one.
2. On the live domain, book that slot with a real card and pay.
3. Check, in this order:
   - the booking shows **PAID** in `/admin/leads`
   - an invoice number was assigned, in `RK/<FY>/0001` form
   - the confirmation email arrived, with the meeting link and the GST breakdown
   - if Google is connected: the Calendar event exists, carries a Meet link, and
     the client received the invite
   - the owner alert arrived
   - Razorpay Dashboard → Webhooks shows a **2xx** delivery
   - the slot no longer appears as available
4. Refund it from the Razorpay dashboard.
5. Put the real price back.

If the webhook shows a non-2xx, fix it before taking a real booking.

---

## Troubleshooting the failures that do not announce themselves

| Symptom | Almost always |
|---|---|
| Payment succeeds, booking stays PENDING | Webhook secret missing, wrong, or set but **not redeployed** |
| Webhook signature always fails | Something parsed the body as JSON before verifying. The HMAC covers exact bytes; `request.text()` is mandatory |
| Fine in testing, times out under load | 5432 session pooler in Vercel instead of 6543, or `DATABASE_POOL_MAX` > 1 |
| `prisma migrate` hangs or errors on a lock | 6543 transaction pooler used for migrations instead of 5432 |
| Migrations ran against the wrong database | `.env` loaded before `.env.local`; dotenv keeps the **first** value it sees |
| Env var change had no effect | No redeploy. Vercel bakes env vars in at build time |
| Push to GitHub produced no deployment | Vercel's GitHub integration skipped it. Fire the Deploy Hook from Step 0 |
| Emails silently never send | No `RESEND_API_KEY`. By design the mailer no-ops rather than throwing, so it cannot break checkout — check the logs for the skip line |
| Resend rejects the send | `EMAIL_FROM` is a bare address, or the from-domain is not the verified subdomain |
| Inbound mail to the domain broke | Nameservers were delegated, or Resend's MX went on the root domain |
| Local `P1001` against a running PGlite | Use `127.0.0.1`, not `localhost` — PGlite binds IPv4 only and `localhost` resolves to `::1` first on Windows |
| Meet links stop appearing after ~a week | The OAuth consent screen is still in *Testing*; Google expires those refresh tokens after 7 days. Publish the app and re-run `scripts/google-auth.mjs` |
| `scripts/google-auth.mjs` returns no refresh token | Google only issues one on the **first** approval for a client id. Revoke at myaccount.google.com/permissions and re-run |
| Invoice numbers have gaps | Should not happen — the serial is claimed under a row lock before `nextval`. Look for a second code path calling `nextval` outside `claimInvoiceNumber` |

---

## After go-live

- Schedule the reminder email (Vercel Cron → a route selecting bookings that
  start in ~24h with `reminderEmailSentAt IS NULL`). The claim column already
  exists on `Booking`; only the trigger is missing.
- Replace the placeholder WhatsApp number and the empty social handles in
  `src/config/site.ts`. They are in exactly one place.
- Point the CA at [GST.md](GST.md) and at the place-of-supply *basis* string
  shown on each booking in the admin detail page.
