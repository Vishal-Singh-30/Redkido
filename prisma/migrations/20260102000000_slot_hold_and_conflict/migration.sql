-- Slot holds expire, and a slot may be referenced by more than one booking.
--
-- WHY: a Razorpay order stays payable after a failed attempt. Releasing the
-- slot on payment.failed and then deleting the failed booking meant (a) a late
-- capture on that still-live order found no booking and orphaned the payment,
-- and (b) an abandoned checkout held a slot BOOKED forever with nothing to
-- release it. Both are fixed by giving the hold an expiry and keeping the
-- booking row.

-- AlterEnum: PENDING bookings now HOLD a slot rather than BOOKing it.
ALTER TYPE "SlotStatus" ADD VALUE IF NOT EXISTS 'HELD';

-- DropIndex: one slot may now have several bookings over time (a failed
-- attempt, then a retry). The real invariant is enforced below.
DROP INDEX IF EXISTS "Booking_slotId_key";

-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "holdExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "slotConflict"  BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_slotId_idx" ON "Booking"("slotId");

-- THE invariant: at most one PAID booking per slot, ever. Prisma's schema
-- language cannot express a partial unique index, so it lives here. This is
-- the last line of defence behind the transactional SELECT ... FOR UPDATE —
-- if application logic is ever wrong, Postgres refuses the double-book.
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_slotId_paid_key"
  ON "Booking"("slotId") WHERE "status" = 'PAID';
