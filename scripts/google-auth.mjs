/**
 * One-time helper: obtain a Google OAuth REFRESH TOKEN for the account that
 * owns the consultation calendar.
 *
 * This is the step people lose an afternoon to. The Calendar API needs a
 * long-lived credential, and the OAuth playground either hands you an access
 * token that expires in an hour or a refresh token bound to Google's own client
 * id, which then does not work with yours.
 *
 * Usage:
 *   1. Google Cloud Console -> APIs & Services -> Enable "Google Calendar API"
 *   2. Credentials -> Create OAuth client ID -> application type "Web application"
 *      Authorised redirect URI:  http://localhost:53682/callback
 *   3. OAuth consent screen: add the calendar owner as a Test user (if the app
 *      is in Testing, which is fine for internal use).
 *   4. Run:
 *        GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/google-auth.mjs
 *   5. Sign in as the calendar owner, approve, and copy the printed refresh
 *      token into GOOGLE_REFRESH_TOKEN.
 *
 * Refresh tokens issued while the consent screen is in "Testing" expire after
 * 7 days. Publish the app (Consent screen -> Publish) before go-live, or the
 * integration silently stops creating Meet links a week later.
 */
import { createServer } from 'node:http'
import { URL } from 'node:url'

const PORT = 53682
const REDIRECT = `http://localhost:${PORT}/callback`
const SCOPE = 'https://www.googleapis.com/auth/calendar'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then re-run.')
  process.exit(1)
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    // Both are required to be handed a refresh token at all.
    access_type: 'offline',
    prompt: 'consent',
  })

console.log('\nOpen this URL, signed in as the CALENDAR OWNER:\n')
console.log(authUrl)
console.log('\nWaiting for the redirect on ' + REDIRECT + ' ...\n')

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Authorisation failed: ${error ?? 'no code'}`)
    console.error('Authorisation failed:', error ?? 'no code returned')
    server.close()
    process.exit(1)
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    })

    const json = await tokenRes.json()

    if (!tokenRes.ok || !json.refresh_token) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('No refresh token returned. See terminal.')
      console.error('\nNo refresh_token in the response:', JSON.stringify(json, null, 2))
      console.error(
        '\nGoogle only returns one on the FIRST approval for a client. Revoke this app at\n' +
          'https://myaccount.google.com/permissions and run this script again.',
      )
      server.close()
      process.exit(1)
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<body style="font:16px/1.5 system-ui;padding:48px;max-width:34em">' +
        '<h1 style="font-size:20px">Connected.</h1>' +
        '<p>The refresh token has been printed in your terminal. You can close this tab.</p>' +
        '</body>',
    )

    console.log('\n--- add to .env.local (and to Vercel, then REDEPLOY) ---\n')
    console.log(`GOOGLE_REFRESH_TOKEN="${json.refresh_token}"`)
    console.log(`GOOGLE_CALENDAR_ID="primary"   # or a specific calendar's id\n`)
    console.log('Scope granted:', json.scope)
    server.close()
    process.exit(0)
  } catch (err) {
    console.error('Token exchange threw:', err)
    res.writeHead(500).end()
    server.close()
    process.exit(1)
  }
})

server.listen(PORT)
