import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { siteConfig } from '@/config/site'
import { MotionRoot } from '@/components/motion/motion-root'
import { ScrollProgress } from '@/components/motion/scroll-progress'
import { SmoothScroll } from '@/components/motion/smooth-scroll'

import './globals.css'

/**
 * Fonts are loaded with plain <link> tags rather than next/font on purpose:
 * next/font downloads the font files at build time, and a sandboxed CI build
 * with no network egress must not fail on that. The href is byte-identical to
 * the one in the source HTML so the rendered page matches pixel for pixel.
 */
const FONT_CSS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&display=swap'

function safeMetadataBase(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    console.warn(`[layout] NEXT_PUBLIC_SITE_URL is not a valid URL (${JSON.stringify(url)}); omitting metadataBase`)
    return undefined
  }
}

export const metadata: Metadata = {
  // Defensive: metadata is evaluated at module load, so anything that throws
  // here takes down the whole build before any page is rendered. resolveSiteUrl()
  // should make this impossible, but a bad value in an env var must degrade to
  // relative URLs rather than a failed deployment.
  metadataBase: safeMetadataBase(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_CSS_HREF} />
      </head>
      <body>
        {/* Motion is opted into at runtime: MotionRoot sets html[data-motion="on"]
            only when the visitor has not asked for reduced motion, and every
            enhancement in globals.css hangs off that attribute. With JS off the
            page renders exactly as authored. */}
        <MotionRoot />
        <ScrollProgress />
        <div className="noise" />
        {/* Inertial scrolling. SmoothScroll renders its children untouched and
            only starts Lenis when the visitor has a fine pointer and has not
            asked for reduced motion, so the no-JS and reduced-motion paths get
            plain native scrolling. */}
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  )
}
