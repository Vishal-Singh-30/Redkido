# Go-live runbook

The site is already on Vercel. What follows is what it needs to actually work:
a database to store the people who reach out, and (optionally) email and Google
Meet links.

There is **no payment step anywhere** — booking a call is free, so there is no
Razorpay account, no KYC, no webhook and no GST to sign off.

---

## Do you need Supabase? Yes — and only for this

Everything the admin shows is stored in Postgres:

- **Leads** — everyone who reached out, from the contact form or by booking a call
- **Sessions** — the bookable times you publish from `/admin/sessions`
- **Bookings** — which lead took which session
- **Your admin login**

Locally this runs on PGlite (Postgres compiled to WASM, no install). That is a
file on your machine, so it cannot back a deployed site. Supabase is the hosted
Postgres that replaces it. Nothing else about the app changes.

---

## Step 1 — Create the project

1. supabase.com → New project. Region **Mumbai (ap-south-1)**.
2. Set a strong database password and save it — Supabase shows it once.
3. Project Settings → Database → **Connection string**. Copy **both**:

   | Purpose | Port | Shape |
   |---|---|---|
   | The app on Vercel | **6543** | `postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres` |
   | Migrations and seeding | **5432** | `postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` |

> **The one mistake that costs real money here.** Those two URLs differ by four
> characters and both work when you test them by hand. Put the 5432 session
> pooler where serverless traffic hits it and it exhausts connections under real
> load — not at deploy time, not in testing, but on your first busy afternoon.
> Put the 6543 transaction pooler in migrations and they fail on the advisory
> lock Prisma takes.
>
> - `DATABASE_URL` in **Vercel** = **6543**, plus `?pgbouncer=true&connection_limit=1`
> - `DATABASE_URL` for **migrations** = **5432**

---

## Step 2 — Create the tables and your admin login

From your machine. Open `.env.local` and temporarily point `DATABASE_URL` at the
**5432** URL, and set a real `ADMIN_EMAIL` / `ADMIN_PASSWORD` — that becomes the
live admin login.

```bash
npm run db:deploy    # creates every table
npm run db:seed      # your admin user + 3 weeks of weekday sessions
```

Check in the Supabase table editor that `Admin` has one row and `Slot` has
sessions. Then point `.env.local` back at PGlite:

```
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres"
```

> `ADMIN_EMAIL` and `ADMIN_PASSWORD` are read **only** by the seed script. They
> must never be added to Vercel — the app does not read them, and shipping them
> is a standing credential leak for no benefit.

---

## Step 3 — Point Vercel at it

Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the **6543** URL + `?pgbouncer=true&connection_limit=1` |
| `DATABASE_POOL_MAX` | `1` |
| `AUTH_SECRET` | `openssl rand -base64 32` — fresh, not the dev one |
| `NEXT_PUBLIC_SITE_URL` | `https://redkido.com` once the domain is live |

Then **redeploy**. Vercel bakes environment variables in at build time, so
adding one does nothing to the running deployment until you rebuild. The
dashboard's *Redeploy* button is enough; you do not need a new commit.

At this point the whole product works: visitors book calls, and `/admin` shows
who reached out.

---

## Step 4 — Domain

Vercel → Settings → Domains → add `redkido.com` and `www.redkido.com`. At your
registrar add **only** the records Vercel shows you: an **A** record on the apex
and a **CNAME** on `www`. Use the values from Vercel's own panel — they have
changed over time.

> **Never delegate nameservers to Vercel if this domain already handles email.**
> That moves *all* DNS and your MX records do not come with it. Mail stops,
> silently, and is usually noticed a day later. An A record and a CNAME change
> web traffic only.

Redeploy once more with `NEXT_PUBLIC_SITE_URL` set to the real domain — it is
compiled into the client bundle and into every email link.

---

## Step 5 — Email (optional)

Without this the app still works; it just never emails anyone. `src/lib/email.ts`
no-ops without a key and never throws, so nothing breaks.

Add the domain in Resend as a **subdomain**: `send.redkido.com`, not the root.
Resend needs an MX and an SPF record, and on the root domain those collide with
your actual mailbox provider's MX, breaking inbound mail to `hello@redkido.com`.

Then in Vercel, and redeploy:

- `RESEND_API_KEY`
- `EMAIL_FROM` = `Redkido <hello@send.redkido.com>` — the display name is
  required, Resend rejects a bare address, and the from-domain must be the one
  you verified.

---

## Step 6 — Google Meet links (optional)

Without this, confirmed bookings carry whatever link you set in
`/admin/settings`. With it, each booking gets its own Calendar event with a real
Meet conference and the client is invited.

1. Google Cloud Console → enable **Google Calendar API**
2. Credentials → OAuth client ID → **Web application**, redirect URI
   `http://localhost:53682/callback`
3. OAuth consent screen → add the calendar owner as a **Test user**
4. `GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/google-auth.mjs`,
   sign in as the calendar owner
5. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
   `GOOGLE_CALENDAR_ID` in Vercel and redeploy

> **Publish the consent screen before go-live.** While it is in *Testing*,
> Google expires refresh tokens after **7 days** — Meet links appear all week and
> then quietly stop.

---

## Step 7 — Prove it end to end

1. On the live domain, open `/book`
2. Pick a day, pick a session, submit
3. Check, in order:
   - the booking appears in `/admin/leads` tagged **Call**
   - the session no longer appears as available on `/book`
   - `/admin/sessions` shows it as booked, with the lead attached
   - if email is configured: the confirmation arrived
   - if Google is configured: the Calendar event exists with a Meet link
4. Cancel it from the admin so the session is free again

---

## Troubleshooting the failures that do not announce themselves

| Symptom | Almost always |
|---|---|
| Fine in testing, times out under load | 5432 session pooler in Vercel instead of 6543, or `DATABASE_POOL_MAX` > 1 |
| `prisma migrate` hangs or errors on a lock | 6543 transaction pooler used for migrations instead of 5432 |
| Migrations ran against the wrong database | `.env` loaded before `.env.local`; dotenv keeps the **first** value |
| Env var change had no effect | No redeploy. Vercel bakes env vars in at build time |
| Push to GitHub produced no deployment | Vercel's GitHub integration skipped it. Fire a Deploy Hook (Settings → Git) |
| Emails silently never send | No `RESEND_API_KEY` — by design the mailer no-ops rather than throwing, so it cannot break a booking. Check the logs for the skip line |
| Resend rejects the send | `EMAIL_FROM` is a bare address, or the from-domain is not the verified subdomain |
| Inbound mail to the domain broke | Nameservers were delegated, or Resend's MX went on the root domain |
| Meet links stop after ~a week | The OAuth consent screen is still in *Testing*. Publish it and re-run `scripts/google-auth.mjs` |
| Local `P1001` against a running PGlite | Use `127.0.0.1`, not `localhost` — PGlite binds IPv4 only and Windows resolves `::1` first |
| A session shows as available but booking it 409s | Someone took it between the page loading and the submit. The transaction is doing its job; the UI should refresh the day |

---

## After go-live

- Publish sessions for the coming months from `/admin/sessions` — the seed only
  creates three weeks, and the site cannot take a booking for a day with no
  sessions.
- Replace the placeholder WhatsApp number and the empty social handles in
  `src/config/site.ts`. They are in exactly one place.
- Schedule the reminder email (Vercel Cron → a route selecting bookings starting
  in ~24h with `reminderEmailSentAt IS NULL`). The claim column already exists;
  only the trigger is missing.
