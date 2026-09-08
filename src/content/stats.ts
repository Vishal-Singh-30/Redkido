/**
 * The stats band. Extracted verbatim from the source HTML.
 *
 * The source splits the numeral from its suffix so the suffix can be tinted:
 * "120+" is value "120" with accent "+". A stat with no suffix omits `accent`.
 */

export type Stat = {
  readonly value: string
  readonly accent?: string
  readonly label: string
}

export const stats = [
  { value: '120', accent: '+', label: 'Brands run end to end' },
  { value: '40', accent: '+', label: 'Events curated and delivered' },
  { value: '11', label: 'Services under a single retainer' },
  { value: '94', accent: '%', label: 'Client retention past year one' },
] as const satisfies readonly Stat[]
