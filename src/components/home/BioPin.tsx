'use client'

import { useTransform } from 'framer-motion'
import { motion } from 'framer-motion'
import { useScrollProgress } from '@/components/scroll/ScrollContext'

export default function BioPin() {
  const scrollYProgress = useScrollProgress()

  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.75, 1], [0, 1, 1, 0])
  const y = useTransform(scrollYProgress, [0, 0.2, 1], [60, 0, -40])

  return (
    <motion.div
      style={{ opacity, y }}
      className="w-full h-full flex items-center justify-center px-8"
    >
      <div className="max-w-3xl text-center">
        <p className="font-body text-[clamp(0.65rem,1.2vw,0.8rem)] text-orange-400 uppercase tracking-[0.3em] mb-6">
          About Me
        </p>
        <h2 className="font-heading text-[clamp(2rem,5vw,4rem)] font-bold text-white leading-tight mb-8">
          I build things for the web.
        </h2>
        <p className="font-body text-gray-400 text-lg leading-relaxed">
          Replace this with a short, punchy bio about yourself. What do you do?
          What are you passionate about? What makes you different?
          Keep it authentic and concise — two or three sentences is ideal.
        </p>
      </div>
    </motion.div>
  )
}
