"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
  scrollYProgress: MotionValue<number>;
  index: number;
}

export default function ProjectCard({ project, scrollYProgress, index }: ProjectCardProps) {
  const isEven = index % 2 === 0;
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const x = useTransform(
    scrollYProgress,
    [0, 0.2, 0.8, 1],
    [isEven ? -80 : 80, 0, 0, isEven ? -80 : 80]
  );

  return (
    <motion.div
      style={{ opacity, x }}
      className="glass-card mx-auto flex max-w-3xl flex-col gap-6 p-8 sm:p-12"
    >
      <div className="flex flex-wrap items-center gap-2">
        {project.tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="border-white/10 bg-white/5 text-xs text-zinc-300"
          >
            {tag}
          </Badge>
        ))}
      </div>
      <h2 className="font-heading text-3xl font-bold text-white">{project.title}</h2>
      <p className="text-zinc-400 leading-relaxed">
        {project.longDescription || project.description}
      </p>
      <div className="flex gap-3">
        {project.liveUrl && (
          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm" }), "bg-indigo-500 hover:bg-indigo-600 text-white")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Live Demo
          </a>
        )}
        {project.githubUrl && (
          <a
            href={project.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/20 text-white hover:bg-white/10")}
          >
            <Code2 className="mr-2 h-4 w-4" />
            Source
          </a>
        )}
      </div>
    </motion.div>
  );
}
