export interface Project {
  id: string
  title: string
  description: string
  tags: string[]
  imageUrl: string
  liveUrl?: string
  repoUrl?: string
}

export interface ContactSubmission {
  name: string
  email: string
  message: string
}

export interface Experience {
  id: string
  role: string
  company: string
  period: string
  description: string
  type: 'work' | 'education'
}
