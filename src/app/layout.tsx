import type { Metadata } from 'next'
import { Outfit, Work_Sans } from 'next/font/google'
import './globals.css'
import GlowBackground from '@/components/layout/GlowBackground'
import Navbar from '@/components/layout/Navbar'

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
})

const workSans = Work_Sans({
  variable: '--font-work-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'Your Name — Portfolio',
  description: 'Software developer. Builder. Problem solver.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${workSans.variable} scroll-smooth`}
    >
      <body className="bg-[#0A0A12] text-white antialiased min-h-screen">
        <GlowBackground />
        <Navbar />
        <main className="relative z-10">
          {children}
        </main>
      </body>
    </html>
  )
}
