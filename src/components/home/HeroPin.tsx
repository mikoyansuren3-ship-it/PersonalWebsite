'use client'

import { useTransform } from 'framer-motion'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useScrollProgress } from '@/components/scroll/ScrollContext'
import { fadeInUp, staggerContainer } from '@/lib/motion'

// Load Three.js scene client-side only
const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false })

function ScrollIndicator() {
  return (
    <div className="scroll-indicator absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-500">
      <svg width="24" height="36" viewBox="0 0 24 36" fill="none" className="opacity-60">
        <rect x="1" y="1" width="22" height="34" rx="11" stroke="currentColor" strokeWidth="1.5"/>
        <motion.rect
          x="10.5" y="7" width="3" height="7" rx="1.5"
          fill="currentColor"
          animate={{ y: [7, 14, 7], opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>
      <span className="text-xs tracking-[0.2em] uppercase font-body">Scroll</span>
    </div>
  )
}

export default function HeroPin() {
  const scrollYProgress = useScrollProgress()

  // Fade out as user scrolls past this pin
  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.95])
  const y = useTransform(scrollYProgress, [0, 1], [0, -40])

  return (
    <motion.div
      style={{ opacity, scale, y }}
      className="relative w-full h-full flex flex-col items-center justify-center text-center px-6"
    >
      {/* 3D scene fills the background */}
      <HeroScene />

      {/* Text content on top */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <motion.h1
          variants={fadeInUp}
          className="font-heading text-[clamp(3rem,10vw,8rem)] font-black uppercase tracking-tight leading-none text-white"
        >
          I&apos;M YOUR NAME
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          className="font-body text-[clamp(0.75rem,1.5vw,0.95rem)] text-gray-400 tracking-[0.25em] uppercase"
        >
          Software Developer&nbsp;&nbsp;|&nbsp;&nbsp;Open Source Enthusiast&nbsp;&nbsp;|&nbsp;&nbsp;Problem Solver
        </motion.p>

        <motion.div
          variants={fadeInUp}
          className="flex gap-4 mt-4"
        >
          <Link
            href="/projects"
            className="px-7 py-2.5 rounded-full bg-orange-500 hover:bg-orange-400 text-white font-body font-medium text-sm tracking-wide transition-all duration-200 hover:shadow-[0_0_24px_rgba(249,115,22,0.5)]"
          >
            View Work
          </Link>
          <Link
            href="/contact"
            className="px-7 py-2.5 rounded-full border border-white/20 hover:border-white/40 text-white font-body font-medium text-sm tracking-wide transition-all duration-200 hover:bg-white/5"
          >
            Contact Me
          </Link>
        </motion.div>
      </motion.div>

      <ScrollIndicator />
    </motion.div>
  )
}
