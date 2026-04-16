'use client'

import { motion } from 'framer-motion'
import { useTransform } from 'framer-motion'
import PinnedSection from '@/components/scroll/PinnedSection'
import { useScrollProgress } from '@/components/scroll/ScrollContext'
import { experiences } from '@/data/experience'
import { fadeInUp, staggerContainer } from '@/lib/motion'

const skills = [
  'TypeScript', 'React', 'Next.js', 'Node.js',
  'PostgreSQL', 'Supabase', 'Tailwind CSS', 'Framer Motion',
  'Git', 'Docker', 'AWS', 'Figma',
]

function AboutHeroPin() {
  const scrollYProgress = useScrollProgress()
  const opacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 1, 0])
  const y = useTransform(scrollYProgress, [0, 1], [0, -30])

  return (
    <motion.div
      style={{ opacity, y }}
      className="w-full h-full flex items-center justify-center px-8 md:px-16"
    >
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center"
      >
        {/* Photo placeholder */}
        <motion.div variants={fadeInUp}>
          <div className="glass-card aspect-square max-w-sm mx-auto md:mx-0 flex items-center justify-center overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(10,10,18,0.8) 100%)' }}
          >
            <span className="font-body text-gray-500 text-sm">Your Photo</span>
          </div>
        </motion.div>

        {/* Text */}
        <div className="flex flex-col gap-6">
          <motion.p variants={fadeInUp} className="font-body text-xs text-orange-400 uppercase tracking-[0.3em]">
            About Me
          </motion.p>
          <motion.h1 variants={fadeInUp} className="font-heading text-[clamp(2.5rem,5vw,4rem)] font-black text-white leading-tight">
            Hi, I&apos;m<br />Your Name.
          </motion.h1>
          <motion.p variants={fadeInUp} className="font-body text-gray-400 leading-relaxed">
            Replace this with your bio. Where are you based? What do you work on?
            What drives you? Keep it personal and genuine.
          </motion.p>
          <motion.p variants={fadeInUp} className="font-body text-gray-400 leading-relaxed">
            A second paragraph about your background, education, or what you&apos;re
            currently working on or learning.
          </motion.p>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SkillsPin() {
  const scrollYProgress = useScrollProgress()
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.8, 1], [0, 1, 1, 0])
  const y = useTransform(scrollYProgress, [0, 0.15, 1], [40, 0, -30])

  return (
    <motion.div
      style={{ opacity, y }}
      className="w-full h-full flex flex-col items-center justify-center px-8 gap-12"
    >
      <div className="text-center">
        <p className="font-body text-xs text-orange-400 uppercase tracking-[0.3em] mb-4">
          Tech Stack
        </p>
        <h2 className="font-heading text-[clamp(2rem,4.5vw,3.5rem)] font-bold text-white">
          Tools I Work With
        </h2>
      </div>

      <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
        {skills.map((skill, i) => (
          <motion.span
            key={skill}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className="px-4 py-2 rounded-full glass-card hover:glass-card-hover font-body text-sm text-white cursor-default"
          >
            {skill}
          </motion.span>
        ))}
      </div>
    </motion.div>
  )
}

export default function AboutPage() {
  return (
    <>
      {/* Hero pin — photo + intro */}
      <PinnedSection height="200vh">
        <AboutHeroPin />
      </PinnedSection>

      {/* Skills pin */}
      <PinnedSection height="250vh">
        <SkillsPin />
      </PinnedSection>

      {/* Experience timeline */}
      <section className="relative z-10 px-8 md:px-16 lg:px-24 py-24 max-w-4xl mx-auto w-full">
        <div className="text-center mb-16">
          <p className="font-body text-xs text-orange-400 uppercase tracking-[0.3em] mb-4">
            Background
          </p>
          <h2 className="font-heading text-[clamp(2rem,4vw,3rem)] font-bold text-white">
            Experience & Education
          </h2>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10" />

          <div className="flex flex-col gap-12">
            {experiences.map((exp, i) => (
              <motion.div
                key={exp.id}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="relative pl-12"
              >
                {/* Dot */}
                <div className="absolute left-[12px] top-1.5 w-2.5 h-2.5 rounded-full bg-orange-500 -translate-x-1/2 shadow-[0_0_10px_rgba(249,115,22,0.6)]" />

                <div className="glass-card p-6 hover:glass-card-hover">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-white">{exp.role}</h3>
                      <p className="font-body text-orange-400 text-sm">{exp.company}</p>
                    </div>
                    <span className="font-body text-xs text-gray-500 whitespace-nowrap">{exp.period}</span>
                  </div>
                  <p className="font-body text-gray-400 text-sm leading-relaxed">{exp.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="h-24" />
    </>
  )
}
