/**
 * Money is integer paise. Never a float near a payment.
 *
 * Every amount crossing a boundary — DB column, Razorpay order, invoice line,
 * email template — is an integer number of paise. Rupees exist only for display.
 */

export type Paise = number

export function assertPaise(value: number, label = 'amount'): Paise {
  if (!Number.isInteger(value)) throw new Error(`${label} must be integer paise, got ${value}`)
  if (value < 0) throw new Error(`${label} must not be negative, got ${value}`)
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds safe integer range`)
  return value
}

/** Only for authoring the catalogue in source. Not for arithmetic on money. */
export function rupees(amount: number): Paise {
  return assertPaise(Math.round(amount * 100), 'rupees()')
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100
}

/** "₹2,500" / "₹2,500.50" — trailing paise shown only when non-zero. */
export function formatINR(paise: Paise, opts: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = opts
  const hasPaise = paise % 100 !== 0
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(paise / 100)
  return withSymbol ? `₹${formatted}` : formatted
}
