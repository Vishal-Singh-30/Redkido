/**
 * FY-scoped invoice serials, claimed atomically and idempotently.
 *
 * Rule 46 of the CGST Rules wants a "consecutive serial number", unique for a
 * financial year. Two properties follow, and they pull in opposite directions:
 *
 *   IDEMPOTENT — the Razorpay webhook and the browser callback both land on the
 *   same booking, often within the same second. A booking must end up with ONE
 *   invoice number no matter how many times, or how concurrently, the claim
 *   runs.
 *
 *   GAPLESS — the series must not skip. A sequence is not transactional:
 *   whatever `nextval` hands out is consumed even if the transaction later
 *   rolls back. So the number of `nextval` calls that can be wasted has to be
 *   driven to as close to zero as possible.
 *
 * Both come from ONE ordering decision, made in `claimInvoiceNumber`:
 *
 *   TAKE THE BOOKING ROW LOCK FIRST, AND ONLY CALL nextval IF THE ROW IS STILL
 *   UNNUMBERED.
 *
 * The pattern used elsewhere in this codebase for the email/status claims —
 * do the work, then `UPDATE ... WHERE <col> IS NULL` and check the row count —
 * is the RIGHT pattern there and the WRONG one here. Applied to invoices it
 * would call `nextval` before discovering that the racing request already
 * numbered the booking, throw the number away, and burn a hole in the series
 * on every single race. Here the lock comes first, so the loser of a race
 * consumes nothing at all and simply returns the winner's number.
 *
 * ── CALLING CONTRACT ────────────────────────────────────────────────────────
 * `claimInvoiceNumber` opens its OWN interactive transaction. Do NOT call it
 * from inside another `prisma.$transaction(...)`: Prisma would need a second
 * connection for the inner transaction and DATABASE_POOL_MAX is 1, so it would
 * wait for a connection held by its own caller and hang until the pool times
 * out. Claim the number before or after the surrounding transaction, never
 * within it.
 */

import { siteConfig } from '@/config/site'
import { prisma } from '@/lib/prisma'

/**
 * India runs a fixed UTC+05:30 with no DST, ever, so a constant offset gives
 * the exact civil date in Asia/Kolkata without a timezone library.
 *
 * This matters at exactly one moment and it is the expensive one: a payment
 * captured at 01:00 IST on 1 April is 19:30 UTC on 31 March. A server running
 * in UTC — which is every Vercel lambda — would file that invoice under the
 * closing financial year and put it out of order in the new year's series.
 */
const IST_OFFSET_MINUTES = 330
const MS_PER_MINUTE = 60_000

/** Serial width before the padding gives up and simply grows: RK/2025-26/0007. */
const SERIAL_PAD_WIDTH = 4

/**
 * Advisory-lock namespace for invoice serial claims. Any constant will do; it
 * only has to be unlikely to collide with another advisory lock in this app.
 */
const INVOICE_LOCK_NAMESPACE = 90183

/**
 * Indian financial year for a date, April to March, formatted "2025-26".
 * Evaluated in IST, not in the server's timezone. See IST_OFFSET_MINUTES.
 */
export function financialYearOf(date: Date): string {
  const time = date.getTime()
  if (!Number.isFinite(time)) throw new Error('financialYearOf() received an invalid Date')

  const ist = new Date(time + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  const istYear = ist.getUTCFullYear()
  const istMonth = ist.getUTCMonth() // 0 = January, 3 = April

  const startYear = istMonth >= 3 ? istYear : istYear - 1
  const endYear = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endYear}`
}

/**
 * Postgres sequence name for a financial year, e.g. "invoice_seq_2025_26".
 *
 * The name is the ONLY thing in this module that cannot be a bound parameter —
 * Postgres will not accept an identifier as a placeholder — so it is built from
 * digits this module produced itself and re-validated here before it is ever
 * concatenated into SQL. Nothing that came from a request can reach it.
 */
function invoiceSequenceName(financialYear: string): string {
  const match = /^([0-9]{4})-([0-9]{2})$/.exec(financialYear)
  if (match === null) {
    throw new Error(`Refusing to build a sequence name from "${financialYear}"`)
  }
  return `invoice_seq_${match[1]}_${match[2]}`
}

/** `RK/2025-26/0007` */
function formatInvoiceNumber(financialYear: string, serial: number): string {
  const prefix: string = siteConfig.invoice.prefix
  return `${prefix}/${financialYear}/${String(serial).padStart(SERIAL_PAD_WIDTH, '0')}`
}

/**
 * `nextval` comes back as int8. Depending on driver settings that arrives as a
 * BigInt, a number or a string, so all three are accepted and then bounded.
 */
function toSerial(value: bigint | number | string): number {
  const serial = typeof value === 'bigint' ? Number(value) : Number(value)
  if (!Number.isSafeInteger(serial) || serial < 1) {
    throw new Error(`Sequence returned an unusable invoice serial: ${String(value)}`)
  }
  return serial
}

type InvoiceClaim = { invoiceNumber: string; invoiceFy: string }

type BookingInvoiceRow = {
  invoiceNumber: string | null
  invoiceFy: string | null
  paidAt: Date | null
}

/**
 * Claim the invoice number for a booking, or return the one it already has.
 *
 * Safe to call repeatedly and concurrently. The first caller to win the row
 * lock numbers the booking; everyone after it reads that number back out and
 * touches neither the sequence nor the row.
 */
export async function claimInvoiceNumber(bookingId: string): Promise<InvoiceClaim> {
  return prisma.$transaction(async (tx) => {
    // ── 1. Lock the booking row FIRST. Everything else depends on this. ──────
    const rows = await tx.$queryRaw<BookingInvoiceRow[]>`
      SELECT "invoiceNumber", "invoiceFy", "paidAt"
      FROM "Booking"
      WHERE "id" = ${bookingId}
      FOR UPDATE
    `

    const booking = rows[0]
    if (booking === undefined) {
      throw new Error(`Cannot claim an invoice number: booking ${bookingId} not found`)
    }

    // ── 2. Already numbered? Return it untouched. This is the idempotency. ───
    if (booking.invoiceNumber !== null) {
      if (booking.invoiceFy === null) {
        // Both columns are written by the single UPDATE below, so one without
        // the other means the row was edited outside this code path. Guessing a
        // financial year for an already-issued invoice would be worse.
        throw new Error(
          `Booking ${bookingId} has invoiceNumber ${booking.invoiceNumber} but no invoiceFy`,
        )
      }
      return { invoiceNumber: booking.invoiceNumber, invoiceFy: booking.invoiceFy }
    }

    // ── 3. Unnumbered. The financial year is the one the supply fell in. ─────
    // `paidAt` is the taxable event; `now` only applies to a booking being
    // numbered before payment landed. Either way the FY is decided once, here,
    // and the racing caller in step 2 inherits it rather than recomputing.
    const financialYear = financialYearOf(booking.paidAt ?? new Date())
    const sequenceName = invoiceSequenceName(financialYear)

    // Serialise all claims within this financial year. Two purposes:
    //   - CREATE SEQUENCE IF NOT EXISTS is not race-proof; two transactions
    //     creating the FY's first sequence at once can raise a duplicate-key
    //     error from the catalogue, and an error inside a transaction poisons
    //     it, so it cannot be caught and retried in place.
    //   - It stops two different bookings interleaving nextval and UPDATE, so a
    //     rollback can only ever strand the most recently issued number.
    // The lock is taken AFTER the row lock, and every caller takes them in this
    // same order, so no cycle and no deadlock.
    const fyStartYear = Number(financialYear.slice(0, 4))
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${INVOICE_LOCK_NAMESPACE}::int, ${fyStartYear}::int)`

    // Sequence name is validated above and contains only [a-z_0-9]; every VALUE
    // in this module is a bound parameter.
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${sequenceName}" AS bigint MINVALUE 1 START WITH 1 INCREMENT BY 1`,
    )

    const nextRows = await tx.$queryRawUnsafe<Array<{ next_value: bigint | number | string }>>(
      `SELECT nextval('"${sequenceName}"') AS next_value`,
    )
    const nextRow = nextRows[0]
    if (nextRow === undefined) {
      throw new Error(`Sequence ${sequenceName} returned no value`)
    }

    const invoiceNumber = formatInvoiceNumber(financialYear, toSerial(nextRow.next_value))

    // ── 4. Write both columns together, under the lock we still hold. ────────
    // `updatedAt` is set explicitly: @updatedAt is applied by the Prisma client
    // layer, which a raw UPDATE bypasses, so it would otherwise go stale.
    const updated = await tx.$executeRaw`
      UPDATE "Booking"
      SET "invoiceNumber" = ${invoiceNumber},
          "invoiceFy" = ${financialYear},
          "updatedAt" = NOW()
      WHERE "id" = ${bookingId}
    `
    if (updated !== 1) {
      throw new Error(
        `Invoice claim for booking ${bookingId} updated ${updated} rows, expected exactly 1`,
      )
    }

    return { invoiceNumber, invoiceFy: financialYear }
  })
}
