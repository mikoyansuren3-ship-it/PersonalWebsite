'use client'

import { createContext, useContext } from 'react'
import type { MotionValue } from 'framer-motion'

interface ScrollContextValue {
  scrollYProgress: MotionValue<number>
}

export const ScrollContext = createContext<ScrollContextValue | null>(null)

export function useScrollProgress() {
  const ctx = useContext(ScrollContext)
  if (!ctx) throw new Error('useScrollProgress must be used inside <PinnedSection>')
  return ctx.scrollYProgress
}
