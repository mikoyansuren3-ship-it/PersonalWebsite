import type { Project } from '@/types'

export const projects: Project[] = [
  {
    id: 'project-1',
    title: 'Project One',
    description: 'A full-stack web application built with modern technologies. Replace this with your actual project description.',
    tags: ['Next.js', 'TypeScript', 'Supabase', 'Tailwind CSS'],
    imageUrl: '/projects/project-1.webp',
    liveUrl: 'https://example.com',
    repoUrl: 'https://github.com',
  },
  {
    id: 'project-2',
    title: 'Project Two',
    description: 'Another awesome project. Replace this with your actual project description.',
    tags: ['React', 'Node.js', 'PostgreSQL'],
    imageUrl: '/projects/project-2.webp',
    liveUrl: 'https://example.com',
    repoUrl: 'https://github.com',
  },
  {
    id: 'project-3',
    title: 'Project Three',
    description: 'Yet another project. Replace this with your actual project description.',
    tags: ['Vue.js', 'Python', 'FastAPI'],
    imageUrl: '/projects/project-3.webp',
    repoUrl: 'https://github.com',
  },
]
