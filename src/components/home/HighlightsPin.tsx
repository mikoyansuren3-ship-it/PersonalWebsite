'use client'

import { useTransform } from 'framer-motion'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useScrollProgress } from '@/components/scroll/ScrollContext'

const highlights = [
  { stat: '3+', label: 'Years Experience', delay: 0 },
  { stat: '10+', label: 'Projects Shipped', delay: 0.12 },
  { stat: '∞', label: 'Problems Solved', delay: 0.24 },
]

export default function HighlightsPin() {
  const scrollYProgress = useScrollProgress()

  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.8, 1], [0, 1, 1, 0])
  const y = useTransform(scrollYProgress, [0, 0.15, 1], [50, 0, -30])

  return (
    <motion.div
      style={{ opacity, y }}
      className="w-full h-full flex flex-col items-center justify-center px-8 gap-16"
    >
      {/* Heading */}
      <div className="text-center">
        <p className="font-body text-[clamp(0.65rem,1.2vw,0.8rem)] text-orange-400 uppercase tracking-[0.3em] mb-4">
          By the Numbers
        </p>
        <h2 className="font-heading text-[clamp(2rem,4.5vw,3.5rem)] font-bold text-white">
          What I bring to the table
        </h2>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {highlights.map((item) => (
          <motion.div
            key={item.stat}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: item.delay, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="glass-card p-8 text-center hover:glass-card-hover"
          >
            <p className="font-heading text-5xl font-black text-orange-400 mb-2">{item.stat}</p>
            <p className="font-body text-gray-400 text-sm tracking-wide uppercase">{item.label}</p>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex gap-4"
      >
        <Link
          href="/projects"
          className="px-8 py-3 rounded-full bg-orange-500 hover:bg-orange-400 text-white font-body font-medium text-sm tracking-wide transition-all duration-200 hover:shadow-[0_0_28px_rgba(249,115,22,0.5)]"
        >
          See My Work
        </Link>
        <Link
          href="/about"
          className="px-8 py-3 rounded-full border border-white/20 hover:border-orange-400/50 text-white font-body font-medium text-sm tracking-wide transition-all duration-200 hover:text-orange-300"
        >
          Learn More
        </Link>
      </motion.div>
    </motion.div>
  )
}
