"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

interface BioPinProps {
  scrollYProgress: MotionValue<number>;
}

export default function BioPin({ scrollYProgress }: BioPinProps) {
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [60, 0, 0, -60]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="flex max-w-2xl flex-col items-center gap-8 px-6 text-center"
    >
      <h2 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
        About Me
      </h2>
      <p className="text-lg leading-relaxed text-zinc-300">
        I&apos;m a passionate developer who loves building beautiful, performant web experiences.
        With a focus on modern technologies and clean design, I create applications
        that make a difference. Replace this with your own bio.
      </p>
      <div className="h-px w-24 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
    </motion.div>
  );
}
