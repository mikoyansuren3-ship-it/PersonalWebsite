"use client";

import PinnedSection from "@/components/scroll/PinnedSection";
import ProjectsHeroPin from "@/components/projects/ProjectsHeroPin";
import ProjectCard from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";

export default function ProjectsPage() {
  return (
    <>
      <PinnedSection height="200vh">
        {(progress) => <ProjectsHeroPin scrollYProgress={progress} />}
      </PinnedSection>

      {projects.map((project, i) => (
        <PinnedSection key={project.id} height="250vh">
          {(progress) => (
            <ProjectCard project={project} scrollYProgress={progress} index={i} />
          )}
        </PinnedSection>
      ))}
    </>
  );
}
