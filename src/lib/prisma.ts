import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * DATABASE_POOL_MAX=1 is mandatory, not tuning:
 *   - PGlite (local) serves a single connection and hangs on a second one.
 *   - On Vercel every lambda holds its own pool; >1 multiplies across instances
 *     and exhausts the Supabase transaction pooler under load.
 *
 * DATABASE_URL is the TRANSACTION pooler (6543) in Vercel, and the SESSION
 * pooler (5432) locally and for migrations. Swapping them fails under load
 * rather than at startup, so it does not show up in testing.
 */
function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? '1'),
  })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
