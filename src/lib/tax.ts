/**
 * GST, computed in integer paise.
 *
 * ── THE INVARIANT ───────────────────────────────────────────────────────────
 *
 *     taxablePaise + cgstPaise + sgstPaise + igstPaise === totalPaise
 *
 * EXACTLY, always, for every breakdown this module returns. `assertGstInvariant`
 * enforces it at runtime on the way out of `computeGst`; a violation throws
 * rather than reaching the database, the gateway or an invoice PDF.
 *
 * The way the invariant is kept is the important part: tax is NEVER computed as
 * a rounded percentage of an already-rounded base. Exactly ONE side is rounded
 * (the taxable value) and the other is derived by SUBTRACTION, so the remainder
 * absorbs the rounding error and the two halves can never drift apart by a
 * paisa. The same trick splits the tax into CGST/SGST: floor one half, subtract
 * for the other.
 *
 *     taxablePaise = round(totalPaise * 100 / (100 + rate))   // the only rounding
 *     taxTotal     = totalPaise - taxablePaise                // never re-rounded
 *     cgst         = floor(taxTotal / 2)
 *     sgst         = taxTotal - cgst                          // never re-rounded
 *
 * Prices in this business are tax-INCLUSIVE (siteConfig.tax.pricesIncludeTax):
 * the catalogue figure is the gross the client pays, and the taxable value is
 * back-computed out of it. `totalPaise` into `computeGst` is therefore always
 * the gross.
 *
 * ── PLACE OF SUPPLY ─────────────────────────────────────────────────────────
 *
 * Consultancy is governed by IGST Act s.12(2), the GENERAL rule. It is NOT the
 * event-admission rule of s.12(6) (place where the event is held) that a
 * ticketing app would use — that distinction decides whether an out-of-state
 * client is billed IGST or CGST+SGST, and getting it wrong means reissuing
 * invoices. See `resolvePlaceOfSupply`.
 *
 * This module is pure: no I/O, no database, no clock. Everything it needs comes
 * from its arguments and siteConfig.
 */

import { siteConfig } from '@/config/site'
import { assertPaise, type Paise } from '@/lib/money'

/**
 * GST state codes — the first two characters of every GSTIN.
 *
 * Statutory reference data, not user-facing copy: it exists so a typo'd GSTIN
 * can be rejected and so an unknown client state code cannot silently become a
 * place of supply. `25` (Daman & Diu) and `28` (undivided Andhra Pradesh) were
 * subsumed into `26` and `37`, but GSTINs issued under them are still in
 * circulation, so they stay valid for validation purposes.
 */
export const GST_STATE_CODES: Readonly<Record<string, string>> = Object.freeze({
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu', // legacy, merged into 26 in 2020
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh', // legacy, pre-bifurcation; current AP is 37
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
})

/** Human name for a GST state code, or null if the code is not a real one. */
export function stateNameForCode(code: string | null | undefined): string | null {
  const normalised = normalizeStateCode(code)
  if (normalised === null) return null
  return GST_STATE_CODES[normalised] ?? null
}

/**
 * Which branch of s.12(2) decided the place of supply. Returned on every
 * breakdown and shown on the admin booking detail page so a CA auditing one
 * invoice can see WHY it was taxed the way it was.
 */
export const PLACE_OF_SUPPLY_BASIS = {
  RECIPIENT_GSTIN: 'Recipient GSTIN state code — registered recipient, IGST Act s.12(2)(a)',
  ADDRESS_ON_RECORD: 'Client state on record — unregistered recipient, IGST Act s.12(2)(b)',
  SUPPLIER_LOCATION: 'Supplier location — no client address on record, IGST Act s.12(2)(b)',
  UNRECOGNISED_STATE:
    'Supplier location — client state code not recognised, treated as no address on record',
} as const

export type PlaceOfSupply = {
  placeOfSupplyStateCode: string
  isInterState: boolean
  basis: string
}

export type GstBreakdown = {
  /** Gross, tax-inclusive amount the client is charged. */
  totalPaise: Paise
  /** Value of supply excluding tax. The ONLY rounded figure in the breakdown. */
  taxablePaise: Paise
  cgstPaise: Paise
  sgstPaise: Paise
  igstPaise: Paise
  /** Combined rate applied. 0 when the supplier is not GST-registered. */
  gstRatePercent: number
  sacCode: string
  isInterState: boolean
  placeOfSupplyStateCode: string
  basis: string
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const GSTIN_LENGTH = 15

/**
 * Canonical form of a GSTIN: trimmed, internal whitespace and hyphens removed,
 * upper-cased. Store THIS, not what the client typed — `isValidGstin` accepts a
 * lower-cased or spaced entry, and persisting the raw string would leave a
 * value that later fails validation and silently flips the tax treatment.
 */
export function normalizeGstin(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase()
  return cleaned.length === 0 ? null : cleaned
}

/**
 * A GSTIN is valid when it is 15 characters in the statutory shape, carries a
 * real state code, AND passes the check-digit test.
 *
 * The checksum is not optional rigour: a transposed character in a GSTIN that
 * still "looks right" changes the leading state code or is accepted as a
 * registered recipient, which flips CGST+SGST to IGST (or the reverse). That is
 * a wrong tax head on a filed invoice, and the only fix is a credit note and a
 * reissue. Cheaper to reject it in the form.
 *
 * Algorithm (GSTN standard): map each of the first 14 characters to its value
 * in base-36, multiply by an alternating weight of 1, 2, 1, 2 …, fold each
 * product with floor(p / 36) + (p % 36), sum, and the check character is
 * (36 - sum % 36) % 36 mapped back into the alphabet.
 */
export function isValidGstin(value: string): boolean {
  const gstin = normalizeGstin(value)
  if (gstin === null || gstin.length !== GSTIN_LENGTH) return false
  if (!GSTIN_PATTERN.test(gstin)) return false
  if (!(gstin.slice(0, 2) in GST_STATE_CODES)) return false

  let sum = 0
  for (let i = 0; i < GSTIN_LENGTH - 1; i += 1) {
    const codePoint = GSTIN_ALPHABET.indexOf(gstin.charAt(i))
    if (codePoint < 0) return false
    const weight = i % 2 === 0 ? 1 : 2
    const product = codePoint * weight
    sum += Math.floor(product / 36) + (product % 36)
  }

  const expected = GSTIN_ALPHABET.charAt((36 - (sum % 36)) % 36)
  return expected === gstin.charAt(GSTIN_LENGTH - 1)
}

/**
 * Two-digit GST state code, or null when the input is absent or not a real
 * code. `9` is accepted and padded to `09`; anything unrecognised returns null
 * so it can be treated as "no address on record" rather than becoming a bogus
 * place of supply.
 */
export function normalizeStateCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const digits = value.trim()
  if (digits.length === 0) return null
  if (!/^[0-9]{1,2}$/.test(digits)) return null
  return digits.padStart(2, '0')
}

/**
 * Place of supply for a consultancy service — IGST Act s.12(2), in order:
 *
 *   1. Recipient is GST-REGISTERED (a well-formed, checksum-valid GSTIN is on
 *      the booking) -> the place of supply is the LOCATION OF THE RECIPIENT,
 *      which for a registered person is the state encoded in the first two
 *      characters of their GSTIN. That is the statutory answer for B2B and it
 *      beats whatever state the form happened to collect, so it is checked
 *      first. An invalid GSTIN is ignored entirely and falls through to (2) —
 *      an unverified number must never be allowed to decide the tax head.
 *
 *   2. Recipient is UNREGISTERED but a state IS on record -> the place of
 *      supply is that state. This is the subtle one and it is easy to get
 *      backwards: asking for the client's state on the booking form IS what
 *      creates the "address on record", so a B2C client in another state makes
 *      the supply INTER-STATE and is charged IGST. Defaulting B2C to the
 *      supplier's own state is correct ONLY when no address was captured at
 *      all — see (3).
 *
 *   3. Nothing on record -> the place of supply is the supplier's own state,
 *      and whether that counts as inter-state is the configured fallback
 *      (siteConfig.tax.interStateFallback).
 *
 * `isInterState` is simply (place of supply !== supplier's state) in cases 1
 * and 2; only case 3 consults the fallback.
 */
export function resolvePlaceOfSupply(input: {
  clientStateCode?: string | null
  clientGstin?: string | null
}): PlaceOfSupply {
  const supplierStateCode: string = siteConfig.tax.supplierStateCode

  // (1) Registered recipient — the GSTIN is the statutory source of truth.
  const gstin = normalizeGstin(input.clientGstin)
  if (gstin !== null && isValidGstin(gstin)) {
    const placeOfSupplyStateCode = gstin.slice(0, 2)
    return {
      placeOfSupplyStateCode,
      isInterState: placeOfSupplyStateCode !== supplierStateCode,
      basis: PLACE_OF_SUPPLY_BASIS.RECIPIENT_GSTIN,
    }
  }

  // (2) Unregistered, but the form captured a state — that is the address on record.
  const rawStateCode = typeof input.clientStateCode === 'string' ? input.clientStateCode.trim() : ''
  const stateCode = normalizeStateCode(rawStateCode)
  if (stateCode !== null && stateCode in GST_STATE_CODES) {
    return {
      placeOfSupplyStateCode: stateCode,
      isInterState: stateCode !== supplierStateCode,
      basis: PLACE_OF_SUPPLY_BASIS.ADDRESS_ON_RECORD,
    }
  }

  // (3) Nothing usable on record — supplier's location, configured fallback.
  return {
    placeOfSupplyStateCode: supplierStateCode,
    isInterState: siteConfig.tax.interStateFallback,
    basis:
      rawStateCode.length > 0
        ? PLACE_OF_SUPPLY_BASIS.UNRECOGNISED_STATE
        : PLACE_OF_SUPPLY_BASIS.SUPPLIER_LOCATION,
  }
}

/**
 * The runtime guard behind the invariant at the top of this file. Every
 * breakdown leaves `computeGst` through here, and payment verification can call
 * it again on the figures read back out of the database before an invoice is
 * issued.
 *
 * Throws rather than returning a boolean: there is no sane way to continue a
 * checkout with money that does not add up.
 */
export function assertGstInvariant(breakdown: GstBreakdown): GstBreakdown {
  assertPaise(breakdown.totalPaise, 'totalPaise')
  assertPaise(breakdown.taxablePaise, 'taxablePaise')
  assertPaise(breakdown.cgstPaise, 'cgstPaise')
  assertPaise(breakdown.sgstPaise, 'sgstPaise')
  assertPaise(breakdown.igstPaise, 'igstPaise')

  const sum =
    breakdown.taxablePaise + breakdown.cgstPaise + breakdown.sgstPaise + breakdown.igstPaise
  if (sum !== breakdown.totalPaise) {
    throw new Error(
      `GST invariant violated: taxable(${breakdown.taxablePaise}) + cgst(${breakdown.cgstPaise}) ` +
        `+ sgst(${breakdown.sgstPaise}) + igst(${breakdown.igstPaise}) = ${sum}, ` +
        `expected total ${breakdown.totalPaise}`,
    )
  }

  // A supply is either intra-state (CGST+SGST) or inter-state (IGST). Never both.
  if (breakdown.isInterState && (breakdown.cgstPaise !== 0 || breakdown.sgstPaise !== 0)) {
    throw new Error('Inter-state supply must not carry CGST or SGST')
  }
  if (!breakdown.isInterState && breakdown.igstPaise !== 0) {
    throw new Error('Intra-state supply must not carry IGST')
  }
  // CGST and SGST are always levied at the same rate, so the halves differ by at
  // most the single paisa that `sgst = taxTotal - cgst` leaves on the odd side.
  if (Math.abs(breakdown.sgstPaise - breakdown.cgstPaise) > 1) {
    throw new Error(
      `CGST(${breakdown.cgstPaise}) and SGST(${breakdown.sgstPaise}) must be equal within one paisa`,
    )
  }

  return breakdown
}

/**
 * Break a gross, tax-inclusive amount into its taxable value and GST heads.
 *
 * `totalPaise` is the catalogue price straight off the ConsultationType row —
 * see src/lib/pricing.ts, which is the only place that reads it.
 */
export function computeGst(totalPaise: number, pos: PlaceOfSupply): GstBreakdown {
  assertPaise(totalPaise, 'totalPaise')
  // `totalPaise * 100` below must stay exact; assertPaise only bounds totalPaise itself.
  if (!Number.isSafeInteger(totalPaise * 100)) {
    throw new Error(`totalPaise ${totalPaise} is too large for exact tax arithmetic`)
  }

  const sacCode: string = siteConfig.tax.sacCode
  const registered: boolean = siteConfig.tax.registered

  // Below the registration threshold, no GST may be charged AT ALL — not a zero
  // rate on a split total, but no tax component in existence. The whole amount
  // is the value of the supply.
  if (!registered) {
    return assertGstInvariant({
      totalPaise,
      taxablePaise: totalPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      gstRatePercent: 0,
      sacCode,
      isInterState: pos.isInterState,
      placeOfSupplyStateCode: pos.placeOfSupplyStateCode,
      basis: pos.basis,
    })
  }

  // Widened to boolean on purpose: siteConfig pins this to `true`, and this
  // guard is what stops the wrong arithmetic from shipping silently if it is
  // ever flipped. Tax-exclusive pricing would mean `totalPaise` is the NET, not
  // the gross, and every figure below would be understated. Fail loudly.
  const pricesIncludeTax: boolean = siteConfig.tax.pricesIncludeTax
  if (!pricesIncludeTax) {
    throw new Error(
      'computeGst() implements tax-INCLUSIVE pricing only; siteConfig.tax.pricesIncludeTax is false',
    )
  }

  const gstRatePercent: number = siteConfig.tax.gstRatePercent
  if (!Number.isInteger(gstRatePercent) || gstRatePercent < 0 || gstRatePercent >= 100) {
    throw new Error(`Invalid siteConfig.tax.gstRatePercent: ${gstRatePercent}`)
  }

  // The single rounding in the whole module.
  const taxablePaise = Math.round((totalPaise * 100) / (100 + gstRatePercent))
  // Derived by subtraction so the remainder can never drift by a paisa.
  const taxTotalPaise = totalPaise - taxablePaise

  // Intra-state: split the SAME tax total in two, second half by subtraction, so
  // an odd number of paise lands on SGST instead of vanishing.
  const cgstPaise = pos.isInterState ? 0 : Math.floor(taxTotalPaise / 2)
  const sgstPaise = pos.isInterState ? 0 : taxTotalPaise - cgstPaise
  const igstPaise = pos.isInterState ? taxTotalPaise : 0

  return assertGstInvariant({
    totalPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    gstRatePercent,
    sacCode,
    isInterState: pos.isInterState,
    placeOfSupplyStateCode: pos.placeOfSupplyStateCode,
    basis: pos.basis,
  })
}

/**
 * Rate to print against each of the CGST and SGST lines of an invoice: half the
 * combined rate (18% -> 9%). May be fractional for odd rates, which is why it
 * is a display helper and never feeds arithmetic on money.
 */
export function cgstSgstRatePercent(breakdown: GstBreakdown): number {
  return breakdown.gstRatePercent / 2
}

/** Total tax charged, across whichever heads apply. */
export function taxTotalPaise(breakdown: GstBreakdown): Paise {
  return breakdown.cgstPaise + breakdown.sgstPaise + breakdown.igstPaise
}
