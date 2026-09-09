// MUST be the first import in this file.
//
// './env' loads .env.local BEFORE .env. dotenv keeps the FIRST value it sees
// for a key, so reversing this order lets the placeholder DATABASE_URL from
// .env win and the seed silently writes to the wrong host with no error that
// names the cause. Do not reorder, and do not move an import above it that
// reads process.env at module scope.
import './env'

import { hash } from 'bcryptjs'

import { prisma } from '@/lib/prisma'
import { siteConfig } from '@/config/site'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Password hashing is done inline with bcryptjs rather than through
 * '@/lib/auth' so this script stays runnable by plain `tsx` with no Next
 * runtime and no server-only module in the graph. The cost factor below must
 * match the one used at login.
 */
const BCRYPT_COST = 12

/** India Standard Time is a fixed UTC+05:30 with no DST, so a constant is exact. */
const IST_OFFSET_MINUTES = 5 * 60 + 30
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

/** Wall-clock start times in Asia/Kolkata for every bookable weekday. */
const SLOT_HOURS_IST = [11, 14, 16] as const

/** How far ahead the rolling availability window runs. */
const SLOT_HORIZON_DAYS = 21

/** Instant for `hour:00` IST on the IST calendar day that `istMidnightUtc` starts. */
function istWallTimeToUtc(istMidnightUtc: number, hour: number): Date {
  return new Date(istMidnightUtc + hour * 60 * MS_PER_MINUTE)
}

/**
 * UTC instant of 00:00 IST for the IST calendar day `dayOffset` days from now.
 * Shifting by the offset lets the UTC getters read IST civil fields directly.
 */
function istMidnightUtcMs(from: Date, dayOffset: number): number {
  const shifted = new Date(from.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE + dayOffset * MS_PER_DAY)
  const midnightAsIfUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0,
  )
  return midnightAsIfUtc - IST_OFFSET_MINUTES * MS_PER_MINUTE
}

/** Day of week (0 = Sunday) of the IST calendar day starting at `istMidnightUtc`. */
function istDayOfWeek(istMidnightUtc: number): number {
  return new Date(istMidnightUtc + IST_OFFSET_MINUTES * MS_PER_MINUTE).getUTCDay()
}

function isWeekday(dayOfWeek: number): boolean {
  return dayOfWeek >= 1 && dayOfWeek <= 5
}

async function seedAdmin(): Promise<string> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must both be set to seed the admin user. ' +
        'They live in .env.local for local development and are NOT set in Vercel. ' +
        'See .env.example.',
    )
  }

  const passwordHash = await hash(password, BCRYPT_COST)
  const name = process.env.ADMIN_NAME ?? `${siteConfig.name} Admin`

  const admin = await prisma.admin.upsert({
    where: { email },
    // Re-running the seed re-applies the password from the environment, so
    // rotating ADMIN_PASSWORD locally is just `npm run db:seed` again.
    update: { passwordHash, name },
    create: { email, passwordHash, name },
  })

  return admin.email
}


/** Every seeded session runs for this long. Admins can create any length later. */
const SESSION_MINUTES = 30

/**
 * Publishes a rolling window of bookable sessions.
 *
 * A session is now just a start and an end — there is no catalogue of types and
 * nothing is priced, so this creates ONE session per time rather than one per
 * type. Existing rows are left alone, which is what makes re-running the seed
 * safe, and the unique index on startsAt is the backstop.
 */
async function seedSlots(): Promise<number> {
  const now = new Date()
  const windowStart = new Date(istMidnightUtcMs(now, 0))
  const windowEnd = new Date(istMidnightUtcMs(now, SLOT_HORIZON_DAYS + 1))

  // One read, then a pure in-memory diff: cheaper and clearer than probing each
  // candidate, and it makes the "skip what already exists" rule explicit.
  const existing = await prisma.slot.findMany({
    where: { startsAt: { gte: windowStart, lt: windowEnd } },
    select: { startsAt: true },
  })
  const seen = new Set(existing.map((slot) => slot.startsAt.toISOString()))

  const rows: Prisma.SlotCreateManyInput[] = []

  for (let dayOffset = 0; dayOffset < SLOT_HORIZON_DAYS; dayOffset += 1) {
    const midnight = istMidnightUtcMs(now, dayOffset)
    if (!isWeekday(istDayOfWeek(midnight))) continue

    for (const hour of SLOT_HOURS_IST) {
      const startsAt = istWallTimeToUtc(midnight, hour)
      // Never publish availability that is already in the past today.
      if (startsAt.getTime() <= now.getTime()) continue

      const key = startsAt.toISOString()
      if (seen.has(key)) continue
      seen.add(key)

      rows.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + SESSION_MINUTES * MS_PER_MINUTE),
        status: 'AVAILABLE',
      })
    }
  }

  if (rows.length === 0) return 0

  const created = await prisma.slot.createMany({ data: rows, skipDuplicates: true })
  return created.count
}

async function main(): Promise<void> {
  const adminEmail = await seedAdmin()
  const slotCount = await seedSlots()

  console.log('Seed complete:')
  console.log(`  admin    : ${adminEmail}`)
  console.log(`  sessions : ${slotCount} created (weekdays, 11:00/14:00/16:00 IST, next ${SLOT_HORIZON_DAYS} days)`)
  console.log('  Add, block or remove sessions from /admin/sessions.')
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
