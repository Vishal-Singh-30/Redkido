import '../prisma/env'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { lockSlotForBooking, reacquireSlotForPaidBooking, isSlotUnavailableError } from '../src/lib/slots'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 })
const prisma = new PrismaClient({ adapter })

let failures = 0
function assert(cond: boolean, label: string) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) failures++
}

async function mkBooking(slotId: string, ctId: string, status: 'PENDING' | 'PAID', holdExpiresAt: Date | null) {
  const lead = await prisma.lead.create({
    data: { kind: 'CONSULTATION', name: 'T', email: `t${Math.floor(performance.now() * 1000)}@x.com` },
  })
  return prisma.booking.create({
    data: {
      leadId: lead.id, slotId, consultationTypeId: ctId, status, holdExpiresAt,
      totalPaise: 250000, taxablePaise: 211864, cgstPaise: 19068, sgstPaise: 19068, igstPaise: 0,
      gstRatePercent: 18, sacCode: '9983', placeOfSupplyStateCode: '09', isInterState: false,
      razorpayOrderId: `order_${Math.floor(performance.now() * 1000)}_${Math.random().toString(36).slice(2)}`,
      ...(status === 'PAID' ? { paidAt: new Date() } : {}),
    },
  })
}

async function main() {
  const ct = await prisma.consultationType.findFirstOrThrow()
  const slot = await prisma.slot.findFirstOrThrow({ where: { status: 'AVAILABLE' } })

  console.log('\n1. live hold blocks a second checkout')
  const b1 = await mkBooking(slot.id, ct.id, 'PENDING', new Date(Date.now() + 15 * 60_000))
  await prisma.slot.update({ where: { id: slot.id }, data: { status: 'HELD' } })
  let blocked = false
  try {
    await prisma.$transaction(async (tx) => { await lockSlotForBooking(tx, slot.id) })
  } catch (e) { blocked = isSlotUnavailableError(e) }
  assert(blocked, 'second checkout rejected while the hold is live')

  console.log('\n2. lapsed hold returns the slot to the market')
  await prisma.booking.update({ where: { id: b1.id }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } })
  let reclaimed = false
  await prisma.$transaction(async (tx) => { await lockSlotForBooking(tx, slot.id); reclaimed = true })
  assert(reclaimed, 'second checkout reclaims the slot once the hold lapses')
  const b1after = await prisma.booking.findUniqueOrThrow({ where: { id: b1.id } })
  assert(b1after.status === 'CANCELLED', `stale booking retired to CANCELLED (got ${b1after.status})`)

  console.log('\n3. capture re-acquisition detects a resold slot')
  const paid = await mkBooking(slot.id, ct.id, 'PAID', null)
  const late = await mkBooking(slot.id, ct.id, 'PENDING', null)
  const owns = await prisma.$transaction((tx) => reacquireSlotForPaidBooking(tx, slot.id, late.id))
  assert(owns === false, 'a late capture on a resold slot reports NOT owned (-> slotConflict)')
  const ownsSelf = await prisma.$transaction((tx) => reacquireSlotForPaidBooking(tx, slot.id, paid.id))
  assert(ownsSelf === true, 'the genuine owner still re-acquires its own slot')

  console.log('\n4. Postgres refuses a second PAID booking on one slot')
  let refused = false
  try { await prisma.booking.update({ where: { id: late.id }, data: { status: 'PAID' } }) }
  catch { refused = true }
  assert(refused, 'partial unique index blocks the double-book even if app logic is wrong')

  // cleanup
  await prisma.booking.deleteMany({ where: { slotId: slot.id } })
  await prisma.lead.deleteMany({ where: { email: { contains: '@x.com' } } })
  await prisma.slot.update({ where: { id: slot.id }, data: { status: 'AVAILABLE' } })

  console.log(failures === 0 ? '\nSLOT LIFECYCLE CORRECT' : `\n${failures} FAILURES`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
