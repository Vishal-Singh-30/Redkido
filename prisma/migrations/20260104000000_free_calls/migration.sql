-- Calls are free. Everything to do with taking money comes out.
--
-- Removed: the paid consultation catalogue, every money/GST/invoice column, the
-- Razorpay gateway columns, and the webhook de-duplication table. A session is
-- now just a Slot an admin published, and a Booking is a Lead attached to one.
--
-- Written as a transform rather than a squashed init so it is correct whether it
-- meets a database that already ran the earlier migrations or a fresh one that
-- is running the whole chain in order. Every statement is guarded.

-- ---------------------------------------------------------------------------
-- Indexes first.
--
-- The old partial unique index on Booking has `WHERE status = 'PAID'` in its
-- predicate, which binds it to the old BookingStatus type. Swapping the enum
-- while that index still exists fails with
--   operator does not exist: "BookingStatus_new" = "BookingStatus"
-- because Postgres tries to rebuild the dependent predicate against the new
-- type. Drop anything that references a column whose type is about to change.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "Booking_slotId_paid_key";
DROP INDEX IF EXISTS "Booking_razorpayOrderId_key";
DROP INDEX IF EXISTS "Booking_razorpayPaymentId_key";
DROP INDEX IF EXISTS "Booking_invoiceNumber_key";
DROP INDEX IF EXISTS "Booking_status_createdAt_idx";
DROP INDEX IF EXISTS "Slot_status_startsAt_idx";
DROP INDEX IF EXISTS "Slot_startsAt_consultationTypeId_key";
DROP INDEX IF EXISTS "Lead_kind_createdAt_idx";

-- ---------------------------------------------------------------------------
-- Enums. Postgres cannot remove a value from an enum, so each is rebuilt and
-- the column swapped across with an explicit mapping.
-- ---------------------------------------------------------------------------

-- LeadKind: CONSULTATION -> CALL
CREATE TYPE "LeadKind_new" AS ENUM ('ENQUIRY', 'CALL');
ALTER TABLE "Lead" ALTER COLUMN "kind" TYPE "LeadKind_new"
  USING (CASE WHEN "kind"::text = 'CONSULTATION' THEN 'CALL' ELSE "kind"::text END)::"LeadKind_new";
DROP TYPE "LeadKind";
ALTER TYPE "LeadKind_new" RENAME TO "LeadKind";

-- SlotStatus: HELD existed only to reserve a slot during checkout.
CREATE TYPE "SlotStatus_new" AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');
ALTER TABLE "Slot" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Slot" ALTER COLUMN "status" TYPE "SlotStatus_new"
  USING (CASE WHEN "status"::text = 'HELD' THEN 'AVAILABLE' ELSE "status"::text END)::"SlotStatus_new";
ALTER TABLE "Slot" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
DROP TYPE "SlotStatus";
ALTER TYPE "SlotStatus_new" RENAME TO "SlotStatus";

-- BookingStatus: no payment states. An unpaid PENDING row is now simply a
-- confirmed booking; anything that had failed or been refunded is cancelled.
CREATE TYPE "BookingStatus_new" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus_new"
  USING (CASE "status"::text
           WHEN 'PAID'     THEN 'CONFIRMED'
           WHEN 'PENDING'  THEN 'CONFIRMED'
           WHEN 'FAILED'   THEN 'CANCELLED'
           WHEN 'REFUNDED' THEN 'CANCELLED'
           ELSE 'CANCELLED'
         END)::"BookingStatus_new";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";

-- ---------------------------------------------------------------------------
-- Booking: strip money, tax, gateway and invoicing.
-- ---------------------------------------------------------------------------

ALTER TABLE "Booking"
  DROP COLUMN IF EXISTS "totalPaise",
  DROP COLUMN IF EXISTS "taxablePaise",
  DROP COLUMN IF EXISTS "cgstPaise",
  DROP COLUMN IF EXISTS "sgstPaise",
  DROP COLUMN IF EXISTS "igstPaise",
  DROP COLUMN IF EXISTS "gstRatePercent",
  DROP COLUMN IF EXISTS "sacCode",
  DROP COLUMN IF EXISTS "placeOfSupplyStateCode",
  DROP COLUMN IF EXISTS "clientStateCode",
  DROP COLUMN IF EXISTS "clientGstin",
  DROP COLUMN IF EXISTS "isInterState",
  DROP COLUMN IF EXISTS "razorpayOrderId",
  DROP COLUMN IF EXISTS "razorpayPaymentId",
  DROP COLUMN IF EXISTS "razorpaySignature",
  DROP COLUMN IF EXISTS "paidAt",
  DROP COLUMN IF EXISTS "invoiceNumber",
  DROP COLUMN IF EXISTS "invoiceFy",
  DROP COLUMN IF EXISTS "holdExpiresAt",
  DROP COLUMN IF EXISTS "slotConflict",
  DROP COLUMN IF EXISTS "consultationTypeId";

-- At most one live booking per session. Replaces the old WHERE status = 'PAID'
-- index; this is the invariant that stops a session being double-booked even if
-- the application logic is ever wrong.
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_slotId_active_key"
  ON "Booking"("slotId") WHERE "status" = 'CONFIRMED';

-- ---------------------------------------------------------------------------
-- Slot: a session is a start and an end. Nothing is priced or typed.
-- ---------------------------------------------------------------------------

ALTER TABLE "Slot" DROP COLUMN IF EXISTS "consultationTypeId";
ALTER TABLE "Slot" ADD COLUMN IF NOT EXISTS "label" TEXT;

-- The old unique key was (startsAt, consultationTypeId), so the same start time
-- could legitimately appear once per consultation type. Without types there can
-- only be one session at a given time, so collapse the duplicates first —
-- keeping any slot that has a booking attached, and otherwise the oldest.
DELETE FROM "Slot"
WHERE id IN (
  SELECT id FROM (
    SELECT s.id,
           row_number() OVER (
             PARTITION BY s."startsAt"
             ORDER BY (EXISTS (SELECT 1 FROM "Booking" b WHERE b."slotId" = s.id)) DESC,
                      s."createdAt",
                      s.id
           ) AS rn
    FROM "Slot" s
  ) ranked
  WHERE ranked.rn > 1
)
AND id NOT IN (SELECT "slotId" FROM "Booking");

CREATE UNIQUE INDEX IF NOT EXISTS "Slot_startsAt_key" ON "Slot"("startsAt");

-- ---------------------------------------------------------------------------
-- Tables that only existed to serve payments.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "ConsultationType" CASCADE;
DROP TABLE IF EXISTS "WebhookEvent" CASCADE;

-- Invoice serials were allotted from FY-scoped sequences. Nothing issues
-- invoices now, so drop any that were created.
DO $$
DECLARE seq record;
BEGIN
  FOR seq IN
    SELECT sequencename FROM pg_sequences
    WHERE schemaname = 'public' AND sequencename LIKE 'invoice_seq_%'
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', seq.sequencename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Recreate the non-unique indexes dropped above so they match schema.prisma.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Booking_slotId_idx"            ON "Booking"("slotId");
CREATE INDEX IF NOT EXISTS "Slot_status_startsAt_idx"      ON "Slot"("status", "startsAt");
CREATE INDEX IF NOT EXISTS "Lead_kind_createdAt_idx"       ON "Lead"("kind", "createdAt");
