'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ExternalLink, Code2 } from 'lucide-react'
import type { Project } from '@/types'

interface ProjectCardProps {
  project: Project
  index: number
}

export default function ProjectCard({ project, index }: ProjectCardProps) {
  const isEven = index % 2 === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: index * 0.1 }}
      className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} gap-8 items-center`}
    >
      {/* Image placeholder */}
      <div className="w-full md:w-3/5 aspect-video glass-card overflow-hidden group">
        <div
          className="w-full h-full flex items-center justify-center text-gray-600 font-body text-sm"
          style={{
            background: 'linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(30,27,75,0.3) 100%)',
          }}
        >
          {/* Replace with next/image when you have actual screenshots */}
          <span className="text-gray-500">Project Screenshot</span>
        </div>
      </div>

      {/* Content */}
      <div className="w-full md:w-2/5 flex flex-col gap-4">
        <p className="font-body text-xs text-orange-400 uppercase tracking-[0.25em]">
          Project {String(index + 1).padStart(2, '0')}
        </p>
        <h3 className="font-heading text-2xl md:text-3xl font-bold text-white">
          {project.title}
        </h3>
        <p className="font-body text-gray-400 text-sm leading-relaxed">
          {project.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 rounded-full text-xs font-body text-orange-300 border border-orange-500/20 bg-orange-500/8"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Links */}
        <div className="flex gap-4 pt-2">
          {project.liveUrl && (
            <Link
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-body text-white hover:text-orange-400 transition-colors duration-200"
            >
              <ExternalLink size={14} />
              Live Site
            </Link>
          )}
          {project.repoUrl && (
            <Link
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-body text-gray-400 hover:text-white transition-colors duration-200"
            >
              <Code2 size={14} />
              Source
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  )
}
