'use client'

import { motion } from 'framer-motion'
import { Code2, AtSign, Link2, Mail } from 'lucide-react'
import ContactForm from '@/components/contact/ContactForm'
import { staggerContainer, fadeInUp } from '@/lib/motion'

const socials = [
  { icon: Code2, label: 'GitHub', href: 'https://github.com' },
  { icon: AtSign, label: 'Twitter / X', href: 'https://twitter.com' },
  { icon: Link2, label: 'LinkedIn', href: 'https://linkedin.com' },
  { icon: Mail, label: 'Email', href: 'mailto:you@example.com' },
]

export default function ContactPage() {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 py-32">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="w-full max-w-2xl flex flex-col gap-10"
      >
        {/* Heading */}
        <div className="text-center">
          <motion.p
            variants={fadeInUp}
                       className="font-body text-xs text-orange-400 uppercase tracking-[0.3em] mb-4"
          >
            Get In Touch
          </motion.p>
          <motion.h1
            variants={fadeInUp}
                       className="font-heading text-[clamp(2.5rem,7vw,5rem)] font-black uppercase text-white leading-none"
          >
            Let&apos;s Talk
          </motion.h1>
          <motion.p
            variants={fadeInUp}
                       className="font-body text-gray-400 text-base mt-4 max-w-md mx-auto"
          >
            Have a project in mind, a question, or just want to say hi? Drop me a message.
          </motion.p>
        </div>

        {/* Form card */}
        <motion.div variants={fadeInUp} className="glass-card p-8">
          <ContactForm />
        </motion.div>

        {/* Socials */}
        <motion.div
          variants={fadeInUp}
                   className="flex justify-center gap-6"
        >
          {socials.map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="w-10 h-10 rounded-full glass-card hover:glass-card-hover flex items-center justify-center text-gray-400 hover:text-orange-400 transition-all duration-200"
            >
              <Icon size={16} />
            </a>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
