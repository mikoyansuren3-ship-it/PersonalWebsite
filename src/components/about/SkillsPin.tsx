"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { Badge } from "@/components/ui/badge";

interface SkillsPinProps {
  scrollYProgress: MotionValue<number>;
}

const skillCategories = [
  {
    label: "Languages",
    skills: ["TypeScript", "JavaScript", "Python", "Go", "SQL"],
  },
  {
    label: "Frontend",
    skills: ["React", "Next.js", "Tailwind CSS", "Framer Motion", "HTML/CSS"],
  },
  {
    label: "Backend",
    skills: ["Node.js", "Express", "FastAPI", "PostgreSQL", "Redis"],
  },
  {
    label: "Tools",
    skills: ["Git", "Docker", "AWS", "Vercel", "Figma"],
  },
];

export default function SkillsPin({ scrollYProgress }: SkillsPinProps) {
  const containerOpacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);

  return (
    <motion.div
      style={{ opacity: containerOpacity }}
      className="flex max-w-3xl flex-col items-center gap-10 px-6"
    >
      <h2 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
        Tech Stack
      </h2>
      <div className="grid w-full gap-8 sm:grid-cols-2">
        {skillCategories.map((category, catIndex) => (
          <SkillCategory
            key={category.label}
            category={category}
            scrollYProgress={scrollYProgress}
            index={catIndex}
          />
        ))}
      </div>
    </motion.div>
  );
}

function SkillCategory({
  category,
  scrollYProgress,
  index,
}: {
  category: (typeof skillCategories)[number];
  scrollYProgress: MotionValue<number>;
  index: number;
}) {
  const start = 0.1 + index * 0.1;
  const opacity = useTransform(scrollYProgress, [start, start + 0.15], [0, 1]);
  const y = useTransform(scrollYProgress, [start, start + 0.15], [30, 0]);

  return (
    <motion.div style={{ opacity, y }} className="glass-card p-6">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-indigo-400">
        {category.label}
      </h3>
      <div className="flex flex-wrap gap-2">
        {category.skills.map((skill) => (
          <Badge
            key={skill}
            variant="secondary"
            className="border-white/10 bg-white/5 text-zinc-300"
          >
            {skill}
          </Badge>
        ))}
      </div>
    </motion.div>
  );
}
