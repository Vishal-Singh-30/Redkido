/**
 * The session-booking invariants.
 *
 * Calls are free now, but the CONCURRENCY has not gone anywhere: two visitors
 * can still choose the same session seconds apart. These check the two things
 * that stop that becoming a double-booking — the transactional row lock, and
 * the partial unique index behind it.
 */
import '../prisma/env'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { lockSlotForBooking, isSlotUnavailableError } from '../src/lib/slots'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 })
const prisma = new PrismaClient({ adapter })

let failures = 0
function assert(cond: boolean, label: string) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) failures++
}

const TEST_EMAIL_DOMAIN = '@slot-lifecycle-test.local'
let seq = 0

async function mkSlot(offsetMs: number, status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED' = 'AVAILABLE') {
  // Unique startsAt: the schema has a unique index on it.
  const startsAt = new Date(Date.now() + offsetMs + seq++ * 60_000)
  return prisma.slot.create({
    data: { startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), status },
  })
}

async function mkBooking(slotId: string, status: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED') {
  const lead = await prisma.lead.create({
    data: { kind: 'CALL', name: 'T', email: `t${seq++}${TEST_EMAIL_DOMAIN}` },
  })
  return prisma.booking.create({ data: { leadId: lead.id, slotId, status } })
}

async function main() {
  const DAY = 24 * 60 * 60 * 1000

  console.log('\n1. an available future session can be locked')
  const open = await mkSlot(DAY)
  let locked = false
  await prisma.$transaction(async (tx) => {
    await lockSlotForBooking(tx, open.id)
    locked = true
  })
  assert(locked, 'lockSlotForBooking accepts an AVAILABLE future session')

  console.log('\n2. a session already taken is refused')
  const taken = await mkSlot(DAY, 'BOOKED')
  let refusedTaken = false
  try {
    await prisma.$transaction(async (tx) => { await lockSlotForBooking(tx, taken.id) })
  } catch (e) { refusedTaken = isSlotUnavailableError(e) }
  assert(refusedTaken, 'a BOOKED session cannot be booked again')

  console.log('\n3. a blocked session is refused')
  const blocked = await mkSlot(DAY, 'BLOCKED')
  let refusedBlocked = false
  try {
    await prisma.$transaction(async (tx) => { await lockSlotForBooking(tx, blocked.id) })
  } catch (e) { refusedBlocked = isSlotUnavailableError(e) }
  assert(refusedBlocked, 'an admin-BLOCKED session cannot be booked')

  console.log('\n4. a session in the past is refused')
  const past = await mkSlot(-2 * DAY)
  let refusedPast = false
  try {
    await prisma.$transaction(async (tx) => { await lockSlotForBooking(tx, past.id) })
  } catch (e) { refusedPast = isSlotUnavailableError(e) }
  assert(refusedPast, 'a session whose start time has passed cannot be booked')

  console.log('\n5. a session that does not exist is refused')
  let refusedMissing = false
  try {
    await prisma.$transaction(async (tx) => { await lockSlotForBooking(tx, 'no-such-slot') })
  } catch (e) { refusedMissing = isSlotUnavailableError(e) }
  assert(refusedMissing, 'an unknown slot id is a typed error, not a crash')

  console.log('\n6. Postgres refuses a second CONFIRMED booking on one session')
  const contested = await mkSlot(2 * DAY)
  await mkBooking(contested.id, 'CONFIRMED')
  let dbRefused = false
  try { await mkBooking(contested.id, 'CONFIRMED') } catch { dbRefused = true }
  assert(dbRefused, 'partial unique index blocks the double-book even if app logic is wrong')

  console.log('\n7. a cancelled booking frees the session for someone else')
  const reused = await mkSlot(3 * DAY)
  const first = await mkBooking(reused.id, 'CONFIRMED')
  await prisma.booking.update({ where: { id: first.id }, data: { status: 'CANCELLED' } })
  let rebooked = false
  try { await mkBooking(reused.id, 'CONFIRMED'); rebooked = true } catch { rebooked = false }
  assert(rebooked, 'the index is partial, so a cancelled booking does not hold the session')

  // cleanup
  const leads = await prisma.lead.findMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
    select: { id: true },
  })
  await prisma.booking.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } })
  await prisma.lead.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } })
  await prisma.slot.deleteMany({
    where: { id: { in: [open.id, taken.id, blocked.id, past.id, contested.id, reused.id] } },
  })

  console.log(failures === 0 ? '\nSLOT LIFECYCLE CORRECT' : `\n${failures} FAILURES`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
