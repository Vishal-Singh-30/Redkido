/**
 * Local Postgres for development: PGlite (Postgres 17 compiled to WASM) served
 * over a real TCP socket, so Prisma and `pg` talk to it exactly as they would
 * talk to Supabase. No Docker, no hosted database — the entire admin and both
 * funnels can be built offline.
 *
 * WHY NOT THE `pglite-server` CLI
 * The bundled CLI installs no error handler on its client sockets, so the first
 * abrupt client disconnect — a test process calling process.exit(), Ctrl-C in a
 * psql session, a Next.js dev-server restart — raises an unhandled ECONNRESET
 * and takes the whole database process down with it. That reads as "my database
 * randomly died", which is a miserable thing to debug at 11pm.
 *
 * This wrapper is the same server with the error handling it should have had.
 *
 * Bind host is 127.0.0.1 and connection strings must use 127.0.0.1, NOT
 * localhost: PGlite listens on IPv4 only, and on Windows "localhost" resolves
 * to ::1 first, producing Prisma P1001 "can't reach database server" against a
 * server that is demonstrably listening.
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const PORT = Number(process.env.PGLITE_PORT ?? 5433)
const HOST = '127.0.0.1'
const DATA_DIR = process.env.PGLITE_DIR ?? './.pglite'

// A dropped client connection is routine, not fatal. Without these the process
// exits on the first reset.
const isClientDisconnect = (e) =>
  Boolean(e) && (e.code === 'ECONNRESET' || e.code === 'EPIPE' || e.code === 'ECONNABORTED')

// A dropped client connection is routine, not fatal. Node surfaces it as an
// unhandled REJECTION (not an exception) from inside the socket handler, and an
// unhandled rejection terminates the process by default — which is exactly how
// the stock CLI dies. Handling both channels is what keeps the server up.
process.on('uncaughtException', (err) => {
  if (isClientDisconnect(err)) {
    console.warn(`[pglite] client disconnected (${err.code}) — server still up`)
    return
  }
  console.error('[pglite] fatal:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  if (isClientDisconnect(reason)) {
    console.warn(`[pglite] client disconnected (${reason.code}) — server still up`)
    return
  }
  console.error('[pglite] unhandled rejection:', reason)
})

const db = await PGlite.create({ dataDir: DATA_DIR })
await db.waitReady

const server = new PGLiteSocketServer({ db, port: PORT, host: HOST })
// Swallowed: the per-connection error is already reported by the handlers above.
server.addEventListener?.('error', () => {})

await server.start()
console.log(`[pglite] listening on ${HOST}:${PORT}  (data: ${DATA_DIR})`)
console.log(`[pglite] DATABASE_URL="postgresql://postgres:postgres@${HOST}:${PORT}/postgres"`)
console.log('[pglite] Ctrl-C to stop.')

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n[pglite] ${sig} — shutting down`)
    try { await server.stop(); await db.close() } catch {}
    process.exit(0)
  })
}
