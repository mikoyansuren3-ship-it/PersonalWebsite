'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'

const navLinks = [
  { label: 'Projects', href: '/projects' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5"
    >
      {/* Logo / Name */}
      <Link
        href="/"
        className="font-heading text-xl font-semibold text-white tracking-tight hover:text-orange-400 transition-colors duration-200"
      >
        Your Name.
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-8">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`
              font-body text-sm tracking-wide transition-colors duration-200
              ${pathname === link.href
                ? 'text-orange-400'
                : 'text-gray-400 hover:text-white'
              }
            `}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </motion.header>
  )
}
