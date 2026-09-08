/**
 * Google Calendar + Meet.
 *
 * WHY NOT AN EMBEDDED BOOKING PAGE
 * Google's own appointment schedules (and Calendly/Cal.com embeds) are quicker
 * to bolt on, but they take over the whole transaction: the visitor books in
 * someone else's UI, so this app never sees the lead, never takes the payment,
 * never computes GST and never issues an invoice. Since all of that is already
 * built, Google is used the other way round — our slot picker stays the source
 * of truth, and Calendar is written to once the payment is confirmed.
 *
 * So the flow is:
 *   1. visitor picks one of OUR slots and pays
 *   2. fulfilment creates a Calendar event with a real Meet conference
 *   3. the Meet URL is stored on the booking and put in the confirmation email
 *
 * AUTH
 * A single refresh token for the account that owns the calendar (OAuth
 * "installed app" flow, done once — see DEPLOYMENT.md). No service account, so
 * no Workspace domain-wide delegation to get approved, and this works on a
 * plain Gmail account too.
 *
 * FAILURE POSTURE
 * Identical to email: it is on the payment path, so it NEVER throws. Every
 * function returns null on failure and the caller carries on. A booking with no
 * Meet link is a booking someone has to send a link for — a booking that
 * failed to record a payment is a disaster.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const LOG = '[google-calendar]'

export type MeetingDetails = {
  eventId: string
  meetUrl: string | null
  htmlLink: string | null
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  )
}

function calendarId(): string {
  return encodeURIComponent(process.env.GOOGLE_CALENDAR_ID ?? 'primary')
}

/**
 * Access tokens last an hour. Cached in module scope, which on serverless means
 * per warm instance — a cold start costs one extra round trip, which is the
 * right trade against storing tokens somewhere shared.
 */
let cached: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  if (!isGoogleCalendarConfigured()) return null
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN as string,
      grant_type: 'refresh_token',
    })

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.error(`${LOG} token refresh failed: ${res.status} ${await res.text()}`)
      return null
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) return null

    cached = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    }
    return cached.token
  } catch (error) {
    console.error(`${LOG} token refresh threw`, error)
    return null
  }
}

export type CreateMeetingInput = {
  summary: string
  description: string
  startsAt: Date
  endsAt: Date
  /** Invitee addresses. The organiser is whoever owns the refresh token. */
  attendees: string[]
  /** Stable key so a retry cannot create a second event for the same booking. */
  idempotencyKey: string
}

/**
 * Creates a Calendar event WITH a Meet conference and returns the join URL.
 *
 * conferenceDataVersion=1 plus a createRequest is what actually mints a Meet
 * link; without it Google silently creates a plain event with no conference and
 * the confirmation email goes out with nothing to click.
 */
export async function createMeetingEvent(
  input: CreateMeetingInput,
): Promise<MeetingDetails | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${calendarId()}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.startsAt.toISOString(), timeZone: 'Asia/Kolkata' },
          end: { dateTime: input.endsAt.toISOString(), timeZone: 'Asia/Kolkata' },
          attendees: input.attendees.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: input.idempotencyKey,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!res.ok) {
      console.error(`${LOG} event create failed: ${res.status} ${await res.text()}`)
      return null
    }

    const json = (await res.json()) as {
      id?: string
      hangoutLink?: string
      htmlLink?: string
      conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
    }

    if (!json.id) return null

    const fromEntryPoints =
      json.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null

    return {
      eventId: json.id,
      meetUrl: json.hangoutLink ?? fromEntryPoints,
      htmlLink: json.htmlLink ?? null,
    }
  } catch (error) {
    console.error(`${LOG} event create threw`, error)
    return null
  }
}

export async function cancelMeetingEvent(eventId: string): Promise<boolean> {
  const token = await getAccessToken()
  if (!token) return false

  try {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${calendarId()}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    )
    // 410 means it is already gone, which is the outcome we wanted.
    return res.ok || res.status === 410
  } catch (error) {
    console.error(`${LOG} event delete threw`, error)
    return false
  }
}

export type BusyInterval = { start: Date; end: Date }

/**
 * Real busy intervals from the team calendar, used to hide slots the team is
 * not actually free for.
 *
 * Advisory only. Our own Slot rows remain the booking authority — Google is not
 * consulted inside the checkout transaction, because an outage there must not
 * be able to block a payment. The worst case is a slot that stays visible and
 * gets double-booked against a personal appointment, which a human resolves.
 */
export async function getBusyIntervals(from: Date, to: Date): Promise<BusyInterval[] | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const res = await fetch(`${CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        timeZone: 'Asia/Kolkata',
        items: [{ id: decodeURIComponent(calendarId()) }],
      }),
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) {
      console.error(`${LOG} freeBusy failed: ${res.status}`)
      return null
    }

    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>
    }

    const entries = Object.values(json.calendars ?? {})
    return entries.flatMap(
      (c) => c.busy?.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })) ?? [],
    )
  } catch (error) {
    console.error(`${LOG} freeBusy threw`, error)
    return null
  }
}
