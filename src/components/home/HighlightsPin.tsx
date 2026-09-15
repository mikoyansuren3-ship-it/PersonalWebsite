"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HighlightsPinProps {
  scrollYProgress: MotionValue<number>;
}

const highlights = [
  { label: "Projects", value: "10+", description: "Completed projects" },
  { label: "Technologies", value: "15+", description: "In my toolbox" },
  { label: "Experience", value: "3+", description: "Years building software" },
];

export default function HighlightsPin({ scrollYProgress }: HighlightsPinProps) {
  const containerOpacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 1]);

  return (
    <motion.div
      style={{ opacity: containerOpacity }}
      className="flex flex-col items-center gap-12 px-6"
    >
      <div className="grid gap-6 sm:grid-cols-3">
        {highlights.map((item, i) => {
          const start = 0.1 + i * 0.1;
          return (
            <HighlightCard
              key={item.label}
              item={item}
              scrollYProgress={scrollYProgress}
              range={[start, start + 0.2]}
            />
          );
        })}
      </div>
      <motion.div
        className="flex gap-4"
        style={{
          opacity: useTransform(scrollYProgress, [0.5, 0.65], [0, 1]),
        }}
      >
        <Link
          href="/projects"
          className={cn(buttonVariants({ size: "lg" }), "bg-indigo-500 hover:bg-indigo-600 text-white")}
        >
          View My Work
        </Link>
        <Link
          href="/contact"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/20 text-white hover:bg-white/10")}
        >
          Get in Touch
        </Link>
      </motion.div>
    </motion.div>
  );
}

function HighlightCard({
  item,
  scrollYProgress,
  range,
}: {
  item: (typeof highlights)[number];
  scrollYProgress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(scrollYProgress, range, [0, 1]);
  const y = useTransform(scrollYProgress, range, [40, 0]);

  return (
    <motion.div style={{ opacity, y }} className="glass-card p-8 text-center">
      <p className="font-heading text-4xl font-bold text-indigo-400">{item.value}</p>
      <p className="mt-2 text-sm font-medium text-white">{item.label}</p>
      <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
    </motion.div>
  );
}
