/**
 * Portfolio marquees. Extracted verbatim from the source HTML.
 *
 * Each track holds only the DISTINCT cards — 16 for the hero strip, 9 for the
 * first portfolio track, 8 for the reversed second track. The source HTML
 * repeats each list once more so the -50% translate loop is seamless; the
 * component performs that duplication, not this file.
 */

export type WorkImage = {
  readonly src: string
  readonly alt: string
  readonly tag: string
}

export type Work = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly heroTrack: readonly WorkImage[]
  readonly trackOne: readonly WorkImage[]
  readonly trackTwo: readonly WorkImage[]
}

export const work = {
  kicker: 'Portfolio',
  heading: 'A glimpse of what we create.',
  sub: 'A sample of real creative output across the categories we run most often — interiors, beauty, and product-led brands.',
  heroTrack: [
    {
      src: '/images/work-01.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-02.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    { src: '/images/work-03.jpg', alt: 'Fragrance sample creative', tag: 'Fragrance' },
    {
      src: '/images/work-04.jpg',
      alt: 'Interior Design sample creative',
      tag: 'Interior Design',
    },
    {
      src: '/images/work-05.jpg',
      alt: 'Makeup & Cosmetics sample creative',
      tag: 'Makeup & Cosmetics',
    },
    {
      src: '/images/work-06.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    {
      src: '/images/work-07.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    { src: '/images/work-08.jpg', alt: 'Fragrance sample creative', tag: 'Fragrance' },
    {
      src: '/images/work-09.jpg',
      alt: 'Interior Design sample creative',
      tag: 'Interior Design',
    },
    {
      src: '/images/work-10.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-11.jpg',
      alt: 'Makeup & Cosmetics sample creative',
      tag: 'Makeup & Cosmetics',
    },
    {
      src: '/images/work-12.jpg',
      alt: 'Interior Design sample creative',
      tag: 'Interior Design',
    },
    {
      src: '/images/work-13.jpg',
      alt: 'Makeup & Cosmetics sample creative',
      tag: 'Makeup & Cosmetics',
    },
    {
      src: '/images/work-14.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-15.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    {
      src: '/images/work-16.jpg',
      alt: 'Product Photography sample creative',
      tag: 'Product Photography',
    },
  ],
  trackOne: [
    {
      src: '/images/work-04.jpg',
      alt: 'Interior Design sample creative',
      tag: 'Interior Design',
    },
    {
      src: '/images/work-01.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-09.jpg',
      alt: 'Interior Design sample creative',
      tag: 'Interior Design',
    },
    {
      src: '/images/work-07.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-12.jpg',
      alt: 'Interior Design sample creative',
      tag: 'Interior Design',
    },
    {
      src: '/images/work-10.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-02.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    {
      src: '/images/work-14.jpg',
      alt: 'Skincare & Body Care sample creative',
      tag: 'Skincare & Body Care',
    },
    {
      src: '/images/work-13.jpg',
      alt: 'Makeup & Cosmetics sample creative',
      tag: 'Makeup & Cosmetics',
    },
  ],
  trackTwo: [
    {
      src: '/images/work-17.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    {
      src: '/images/work-05.jpg',
      alt: 'Makeup & Cosmetics sample creative',
      tag: 'Makeup & Cosmetics',
    },
    {
      src: '/images/work-06.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    {
      src: '/images/work-11.jpg',
      alt: 'Makeup & Cosmetics sample creative',
      tag: 'Makeup & Cosmetics',
    },
    {
      src: '/images/work-15.jpg',
      alt: 'Beauty & Skincare sample creative',
      tag: 'Beauty & Skincare',
    },
    {
      src: '/images/work-16.jpg',
      alt: 'Product Photography sample creative',
      tag: 'Product Photography',
    },
    { src: '/images/work-03.jpg', alt: 'Fragrance sample creative', tag: 'Fragrance' },
    { src: '/images/work-08.jpg', alt: 'Fragrance sample creative', tag: 'Fragrance' },
  ],
} as const satisfies Work
