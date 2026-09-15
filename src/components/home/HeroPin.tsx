"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

interface HeroPinProps {
  scrollYProgress: MotionValue<number>;
}

export default function HeroPin({ scrollYProgress }: HeroPinProps) {
  const opacity = useTransform(scrollYProgress, [0, 0.8, 1], [1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.8, 1], [1, 1, 0.95]);
  const y = useTransform(scrollYProgress, [0, 0.8, 1], [0, 0, -60]);

  return (
    <motion.div
      style={{ opacity, scale, y }}
      className="flex flex-col items-center gap-6 text-center px-6"
    >
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="text-sm font-medium uppercase tracking-widest text-indigo-400"
      >
        Welcome to my portfolio
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="font-heading text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl"
      >
        Hi, I&apos;m{" "}
        <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
          Your Name
        </span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="max-w-lg text-lg text-zinc-400"
      >
        Software Engineer &bull; Creative Developer &bull; Problem Solver
      </motion.p>
    </motion.div>
  );
}
