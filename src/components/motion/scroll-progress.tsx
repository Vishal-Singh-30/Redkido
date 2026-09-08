'use client'

import { motion, useScroll, useSpring } from 'motion/react'

/**
 * Reading-progress rail pinned above the sticky header.
 * Hidden entirely under prefers-reduced-motion (see globals.css).
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 })

  return (
    <div className="scroll-progress" aria-hidden="true">
      <motion.i style={{ scaleX }} />
    </div>
  )
}

export default ScrollProgress
