import { marqueeItems } from '@/content/marquee'
import { Reveal } from '@/components/motion/reveal'

/**
 * The text marquee band between the hero and the problems section.
 * @keyframes scroll runs translateX(0) -> translateX(-50%), so the items are
 * rendered twice, in the same order, to make the loop seamless.
 *
 * The band itself is untouched: the scroll animation and the pause-on-hover are
 * both pure CSS. The only addition is <Reveal> on the wrapper — it carries the
 * original .marquee-wrap class, so this is the same single element it always
 * was, just faded in as it enters.
 */
export function Marquee() {
  const items = [...marqueeItems, ...marqueeItems]

  return (
    <Reveal className="marquee-wrap">
      <div className="marquee">
        {items.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </Reveal>
  )
}

export default Marquee
