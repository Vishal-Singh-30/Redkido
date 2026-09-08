/**
 * Founder's note section. Extracted verbatim from the source HTML.
 * The note itself is rendered as an image in the source; the alt text carries it.
 */

export type Founder = {
  readonly kicker: string
  readonly heading: string
  readonly image: {
    readonly src: string
    readonly alt: string
  }
}

export const founder = {
  kicker: 'A note from our founder',
  heading: 'Why Redkido exists, in plain terms.',
  image: {
    src: '/images/founder.jpg',
    alt: "Founder's Message from Anoushka Chauhan, Founder of Redkido",
  },
} as const satisfies Founder
