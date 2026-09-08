import { Faq } from '@/components/site/Faq'
import { FinalCta } from '@/components/site/FinalCta'
import { FitCheck } from '@/components/site/FitCheck'
import { Footer } from '@/components/site/Footer'
import { Founder } from '@/components/site/Founder'
import { Header } from '@/components/site/Header'
import { Hero } from '@/components/site/Hero'
import { Marquee } from '@/components/site/Marquee'
import { Pricing } from '@/components/site/Pricing'
import { Problems } from '@/components/site/Problems'
import { Process } from '@/components/site/Process'
import { Services } from '@/components/site/Services'
import { Stats } from '@/components/site/Stats'
import { Testimonials } from '@/components/site/Testimonials'
import { Work } from '@/components/site/Work'

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="top">
        <Hero />
        <Marquee />
        <Problems />
        <Services />
        <Work />
        <Founder />
        <Process />
        <Stats />
        <Testimonials />
        <Pricing />
        <FitCheck />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}
