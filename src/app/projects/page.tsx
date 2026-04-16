'use client'

import { motion } from 'framer-motion'
import PinnedSection from '@/components/scroll/PinnedSection'
import { useScrollProgress } from '@/components/scroll/ScrollContext'
import { useTransform } from 'framer-motion'
import ProjectCard from '@/components/projects/ProjectCard'
import { projects } from '@/data/projects'

function ProjectsHeroPin() {
  const scrollYProgress = useScrollProgress()
  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96])

  return (
    <motion.div
      style={{ opacity, scale }}
      className="w-full h-full flex flex-col items-center justify-center text-center px-8"
    >
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="font-body text-xs text-orange-400 uppercase tracking-[0.3em] mb-6"
      >
        Selected Work
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="font-heading text-[clamp(3rem,8vw,7rem)] font-black uppercase text-white leading-none"
      >
        My Work
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="font-body text-gray-400 text-base mt-6 max-w-xl"
      >
        A collection of projects I&apos;ve built — from side projects to production systems.
      </motion.p>
    </motion.div>
  )
}

export default function ProjectsPage() {
  return (
    <>
      {/* Hero pin */}
      <PinnedSection height="200vh">
        <ProjectsHeroPin />
      </PinnedSection>

      {/* Projects list */}
      <section className="relative z-10 px-8 md:px-16 lg:px-24 py-24 flex flex-col gap-24 max-w-6xl mx-auto w-full">
        {projects.map((project, i) => (
          <ProjectCard key={project.id} project={project} index={i} />
        ))}
      </section>

      {/* Footer padding */}
      <div className="h-24" />
    </>
  )
}
