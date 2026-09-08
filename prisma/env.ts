/**
 * Env loading order matters and has bitten this stack before.
 *
 * dotenv KEEPS THE FIRST value it sees for a given key. If .env loads first,
 * its placeholder DATABASE_URL wins and `prisma migrate` silently runs against
 * the wrong (or non-existent) host with no error that names the cause.
 *
 * .env.local must therefore load BEFORE .env. Every entrypoint that runs
 * outside Next's own env handling (prisma.config.ts, prisma/seed.ts) must
 * import this module first, before anything reads process.env.
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}
