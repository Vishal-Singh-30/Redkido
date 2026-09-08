/**
 * The scrolling service marquee under the hero.
 *
 * This is the DISTINCT set only. The source HTML repeats the list twice so the
 * -50% translate loop is seamless; the component duplicates it, not this file.
 */

export const marqueeItems = [
  'Content Creation',
  'Social Media Management',
  'Video Editing',
  'Event Management',
  'Performance Marketing',
  'Workforce Training',
  'Automation & Follow-up',
  'Email Marketing',
  'WhatsApp Marketing',
  'Websites & Landing Pages',
  'Influencer Marketing',
] as const

export type MarqueeItem = (typeof marqueeItems)[number]
