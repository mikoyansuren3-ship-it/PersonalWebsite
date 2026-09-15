"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

interface AboutHeroPinProps {
  scrollYProgress: MotionValue<number>;
}

export default function AboutHeroPin({ scrollYProgress }: AboutHeroPinProps) {
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.2], [40, 0]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="flex flex-col items-center gap-8 px-6 text-center sm:flex-row sm:text-left sm:gap-12"
    >
      {/* Photo placeholder */}
      <div className="glass-card flex h-48 w-48 shrink-0 items-center justify-center sm:h-56 sm:w-56">
        <span className="text-4xl text-zinc-600">📷</span>
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">About Me</p>
        <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
          Your Name
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-zinc-300">
          A brief introduction about yourself, your background, and what drives you
          as a developer. Replace this placeholder text with your own story.
        </p>
      </div>
    </motion.div>
  );
}
