/**
 * THE price resolver. One module, one source of truth.
 *
 * The consultation page and the checkout API both import from here, so the
 * figure the client is shown and the figure the client is charged are read from
 * the same row by the same code. They cannot diverge.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * THE PRICE ALWAYS COMES FROM THE ConsultationType ROW.
 *
 * There is no parameter, anywhere in this module, that lets a caller supply an
 * amount — not an override, not a discount, not a "trusted" internal amount.
 * Every exported function takes a slug and returns money; none of them takes
 * money. That is deliberate and it is the whole point of the module: a request
 * body cannot influence what is charged, because there is no code path from a
 * request body to a price. If a promotional price is ever needed, it belongs in
 * a column on ConsultationType, resolved here, never in a call site.
 *
 * Amounts are integer paise throughout (src/lib/money.ts) and every row read is
 * re-validated with `assertPaise`, so a hand-edited or half-migrated price
 * fails here rather than reaching Razorpay.
 *
 * Server-only: this module touches the database.
 */

import type { ConsultationType } from '@/generated/prisma/client'
import { assertPaise, type Paise } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { computeGst, resolvePlaceOfSupply, type GstBreakdown } from '@/lib/tax'

export type ResolvedConsultation = {
  id: string
  slug: string
  name: string
  summary: string
  durationMins: number
  /** Gross, tax-inclusive price in integer paise. The authority is the DB row. */
  pricePaise: Paise
}

export type ConsultationQuote = {
  consultation: ResolvedConsultation
  gst: GstBreakdown
}

/**
 * Tied to the Prisma model so that renaming or retyping a column in
 * schema.prisma breaks this file instead of silently changing a price.
 */
type ConsultationRow = Pick<
  ConsultationType,
  'id' | 'slug' | 'name' | 'summary' | 'durationMins' | 'pricePaise'
>

const CONSULTATION_FIELDS = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  durationMins: true,
  pricePaise: true,
} as const

function toResolved(row: ConsultationRow): ResolvedConsultation {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    durationMins: row.durationMins,
    // Guards the one number that matters against a bad row: negative, floating
    // or absurd prices die here, before a checkout is created.
    pricePaise: assertPaise(row.pricePaise, `pricePaise for consultation "${row.slug}"`),
  }
}

/**
 * Active consultation types in display order: explicit sortOrder first, then
 * name so the order is stable when two rows share a sortOrder.
 */
export async function listConsultations(): Promise<ResolvedConsultation[]> {
  const rows = await prisma.consultationType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: CONSULTATION_FIELDS,
  })
  return rows.map(toResolved)
}

/**
 * One consultation type by slug, or null.
 *
 * An INACTIVE type resolves to null on purpose. Retiring a consultation has to
 * close the checkout route as well as the marketing card, otherwise a stale
 * link or a bookmarked checkout keeps selling a withdrawn product at a price
 * nobody is maintaining.
 */
export async function resolveConsultation(slug: string): Promise<ResolvedConsultation | null> {
  const key = typeof slug === 'string' ? slug.trim() : ''
  if (key.length === 0) return null

  const row = await prisma.consultationType.findUnique({
    where: { slug: key },
    select: { ...CONSULTATION_FIELDS, active: true },
  })
  if (row === null || !row.active) return null

  return toResolved(row)
}

/**
 * The advertised consultation plus the GST breakdown for a specific client.
 *
 * Returns null for an unknown or retired slug so a caller can answer 404
 * instead of quoting something. The amount handed to `computeGst` is the row's
 * own `pricePaise`; the client-supplied fields decide only the PLACE OF SUPPLY
 * (which tax heads apply), never the total.
 */
export async function quoteConsultation(input: {
  slug: string
  clientStateCode?: string | null
  clientGstin?: string | null
}): Promise<ConsultationQuote | null> {
  const consultation = await resolveConsultation(input.slug)
  if (consultation === null) return null

  const placeOfSupply = resolvePlaceOfSupply({
    clientStateCode: input.clientStateCode,
    clientGstin: input.clientGstin,
  })

  return {
    consultation,
    gst: computeGst(consultation.pricePaise, placeOfSupply),
  }
}
