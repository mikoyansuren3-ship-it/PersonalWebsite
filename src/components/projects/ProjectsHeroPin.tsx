"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

interface ProjectsHeroPinProps {
  scrollYProgress: MotionValue<number>;
}

export default function ProjectsHeroPin({ scrollYProgress }: ProjectsHeroPinProps) {
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0.85, 1, 1, 0.95]);

  return (
    <motion.div
      style={{ opacity, scale }}
      className="flex flex-col items-center gap-4 px-6 text-center"
    >
      <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">Portfolio</p>
      <h1 className="font-heading text-5xl font-bold text-white sm:text-7xl">My Work</h1>
      <p className="max-w-md text-lg text-zinc-400">
        A selection of projects I&apos;ve built and contributed to.
      </p>
    </motion.div>
  );
}
