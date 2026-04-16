'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
})

type FormData = z.infer<typeof schema>

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setStatus('loading')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      setStatus('success')
      reset()
    } catch {
      setStatus('error')
    }
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl font-body text-sm text-white placeholder:text-gray-600
    bg-white/[0.04] border border-white/[0.10] outline-none
    focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10
    transition-all duration-200
  `

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      {/* Name */}
      <div>
        <input
          {...register('name')}
          placeholder="Your name"
          className={inputClass}
          disabled={status === 'loading'}
        />
        {errors.name && (
          <p className="mt-1.5 text-xs text-orange-400 font-body">{errors.name.message}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <input
          {...register('email')}
          type="email"
          placeholder="your@email.com"
          className={inputClass}
          disabled={status === 'loading'}
        />
        {errors.email && (
          <p className="mt-1.5 text-xs text-orange-400 font-body">{errors.email.message}</p>
        )}
      </div>

      {/* Message */}
      <div>
        <textarea
          {...register('message')}
          placeholder="What's on your mind?"
          rows={5}
          className={`${inputClass} resize-none`}
          disabled={status === 'loading'}
        />
        {errors.message && (
          <p className="mt-1.5 text-xs text-orange-400 font-body">{errors.message.message}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'loading' || status === 'success'}
        className="flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-orange-500 hover:bg-orange-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-body font-medium text-sm tracking-wide transition-all duration-200 hover:shadow-[0_0_28px_rgba(249,115,22,0.4)]"
      >
        {status === 'loading' && <Loader2 size={16} className="animate-spin" />}
        {status === 'loading' ? 'Sending…' : 'Send Message'}
      </button>

      {/* Feedback messages */}
      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm font-body text-green-400">
          <CheckCircle size={16} />
          Message sent! I&apos;ll get back to you soon.
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm font-body text-red-400">
          <AlertCircle size={16} />
          Something went wrong — please try again.
        </div>
      )}
    </form>
  )
}
