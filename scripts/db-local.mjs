/**
 * Apply prisma/migrations/*'s SQL to the local PGlite database.
 *
 * WHY THIS EXISTS
 * Prisma 7's migrate engine is a native binary that speaks the Postgres wire
 * protocol directly, and it cannot complete a handshake with PGlite's socket
 * server — you get P1001 against a server that is demonstrably listening and
 * that the `pg` driver connects to happily. The app runtime is unaffected
 * (it goes through @prisma/adapter-pg -> pg), and so is Supabase, where
 * `prisma migrate deploy` works normally.
 *
 * So: author migrations with `prisma migrate diff` (no DB needed), apply them
 * locally with this script, and deploy them to Supabase with `migrate deploy`.
 * The SAME .sql files are used in all three places, so local and production
 * never drift.
 *
 * Rows are recorded in _prisma_migrations in Prisma's own format, so a later
 * `migrate deploy` against a real Postgres sees a consistent history.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
config({ path: '.env' })

const DIR = join(process.cwd(), 'prisma', 'migrations')
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set (check .env.local)')
if (!existsSync(DIR)) throw new Error(`No migrations directory at ${DIR}`)

const client = new pg.Client({ connectionString: url, ssl: false })
await client.connect()

await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                  VARCHAR(36) PRIMARY KEY,
    checksum            VARCHAR(64)  NOT NULL,
    finished_at         TIMESTAMPTZ,
    migration_name      VARCHAR(255) NOT NULL,
    logs                TEXT,
    rolled_back_at      TIMESTAMPTZ,
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    applied_steps_count INTEGER      NOT NULL DEFAULT 0
  )`)

const { rows } = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL')
const applied = new Set(rows.map((r) => r.migration_name))

const pending = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, 'migration.sql')))
  .map((d) => d.name)
  .sort()
  .filter((name) => !applied.has(name))

if (pending.length === 0) {
  console.log(`No pending migrations. ${applied.size} already applied.`)
} else {
  for (const name of pending) {
    const sql = readFileSync(join(DIR, name, 'migration.sql'), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    process.stdout.write(`applying ${name} ... `)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)`,
        [randomUUID(), checksum, name]
      )
      await client.query('COMMIT')
      console.log('ok')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log('FAILED')
      throw err
    }
  }
  console.log(`Applied ${pending.length} migration(s).`)
}

await client.end()
