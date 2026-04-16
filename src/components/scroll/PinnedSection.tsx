'use client'

import { useRef } from 'react'
import { useScroll } from 'framer-motion'
import { ScrollContext } from './ScrollContext'

interface PinnedSectionProps {
  children: React.ReactNode
  height?: string   // e.g. "200vh", "300vh"
  className?: string
}

export default function PinnedSection({
  children,
  height = '200vh',
  className = '',
}: PinnedSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  return (
    <ScrollContext.Provider value={{ scrollYProgress }}>
      <div
        ref={containerRef}
        className={`relative ${className}`}
        style={{ height }}
      >
        {/* Sticky viewport-height inner */}
        <div className="sticky top-0 h-screen overflow-hidden">
          {children}
        </div>
      </div>
    </ScrollContext.Provider>
  )
}
