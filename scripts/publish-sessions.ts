/**
 * Publish bookable sessions in bulk, from the command line.
 *
 * The admin at /admin/sessions can do this too, and is the right tool day to
 * day. This exists for the first fill and for topping up a long window without
 * clicking: `npm run db:seed` only lays down 21 days, and a day with no sessions
 * simply cannot be booked.
 *
 *   npx tsx scripts/publish-sessions.ts [days] [times] [minutes]
 *
 *   days     how far ahead to publish        (default 90)
 *   times    comma-separated IST start times (default 11:00,14:00,16:00)
 *   minutes  length of each session          (default 30)
 *
 * Weekdays only. Existing sessions are left alone — the unique index on
 * startsAt is the backstop, and this skips them explicitly so re-running is
 * safe and idempotent.
 */
import '../prisma/env'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/** IST is a fixed UTC+05:30 with no DST, so a constant offset is exact. */
const IST_OFFSET_MIN = 5 * 60 + 30
const MS_MIN = 60_000
const MS_DAY = 24 * 60 * MS_MIN

/** UTC instant of 00:00 IST on the IST calendar day `offset` days from now. */
function istMidnightUtcMs(now: Date, offset: number): number {
  const istNow = now.getTime() + IST_OFFSET_MIN * MS_MIN
  const istMidnight = Math.floor(istNow / MS_DAY) * MS_DAY
  return istMidnight - IST_OFFSET_MIN * MS_MIN + offset * MS_DAY
}

function istDayOfWeek(istMidnightUtc: number): number {
  return new Date(istMidnightUtc + IST_OFFSET_MIN * MS_MIN).getUTCDay()
}

const isWeekday = (d: number) => d >= 1 && d <= 5

async function main() {
  const days = Number(process.argv[2] ?? 90)
  const times = (process.argv[3] ?? '11:00,14:00,16:00').split(',').map((t) => t.trim())
  const minutes = Number(process.argv[4] ?? 30)

  const parsed = times.map((t) => {
    const [h, m] = t.split(':').map(Number)
    if (!Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`bad time: ${t}`)
    return { h, m, label: t }
  })

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? '1'),
    }),
  })

  const now = new Date()
  const windowEnd = new Date(istMidnightUtcMs(now, days + 1))

  const existing = await prisma.slot.findMany({
    where: { startsAt: { gte: new Date(istMidnightUtcMs(now, 0)), lt: windowEnd } },
    select: { startsAt: true },
  })
  const seen = new Set(existing.map((s) => s.startsAt.toISOString()))

  const rows: { startsAt: Date; endsAt: Date; status: 'AVAILABLE' }[] = []
  let weekdayCount = 0

  for (let d = 0; d < days; d += 1) {
    const midnight = istMidnightUtcMs(now, d)
    if (!isWeekday(istDayOfWeek(midnight))) continue
    weekdayCount += 1

    for (const t of parsed) {
      const startsAt = new Date(midnight + (t.h * 60 + t.m) * MS_MIN)
      if (startsAt.getTime() <= now.getTime()) continue
      if (seen.has(startsAt.toISOString())) continue
      seen.add(startsAt.toISOString())
      rows.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + minutes * MS_MIN),
        status: 'AVAILABLE',
      })
    }
  }

  const created =
    rows.length === 0
      ? { count: 0 }
      : await prisma.slot.createMany({ data: rows, skipDuplicates: true })

  const total = await prisma.slot.count()
  const open = await prisma.slot.count({ where: { status: 'AVAILABLE' } })

  console.log(`window        : next ${days} days (${weekdayCount} weekdays)`)
  console.log(`times (IST)   : ${times.join(', ')} · ${minutes} min each`)
  console.log(`created       : ${created.count}`)
  console.log(`already there : ${rows.length - created.count + existing.length}`)
  console.log(`sessions now  : ${total} total, ${open} open`)

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
