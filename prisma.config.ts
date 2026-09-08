import './prisma/env'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 takes the connection string from a driver adapter here rather than
 * from `url` in schema.prisma.
 *
 * DATABASE_URL must be the SESSION pooler (port 5432) for migrations, both
 * locally and against Supabase. The transaction pooler (6543) does not support
 * the prepared statements and advisory locks that migrations need.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  /**
   * `prisma migrate` needs a real connection string here — the driver adapter
   * below is NOT enough on its own and migrate fails with
   * "The datasource.url property is required" if you omit it.
   *
   * This must be the SESSION pooler (5432). The transaction pooler (6543) that
   * the app runs on cannot hold the advisory lock migrations take.
   */
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
})
