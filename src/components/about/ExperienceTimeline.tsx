"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

interface ExperienceTimelineProps {
  scrollYProgress: MotionValue<number>;
}

const timelineItems = [
  {
    type: "work" as const,
    title: "Software Engineer",
    org: "Company Name",
    period: "2023 — Present",
    description: "Description of your role and key accomplishments.",
  },
  {
    type: "work" as const,
    title: "Junior Developer",
    org: "Another Company",
    period: "2021 — 2023",
    description: "Description of your role and key accomplishments.",
  },
  {
    type: "education" as const,
    title: "B.S. Computer Science",
    org: "University Name",
    period: "2017 — 2021",
    description: "Relevant coursework, achievements, or activities.",
  },
];

export default function ExperienceTimeline({ scrollYProgress }: ExperienceTimelineProps) {
  const containerOpacity = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 1]);

  return (
    <motion.div
      style={{ opacity: containerOpacity }}
      className="flex max-w-2xl flex-col items-center gap-10 px-6"
    >
      <h2 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
        Experience & Education
      </h2>
      <div className="relative w-full">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10 sm:left-1/2" />
        <div className="flex flex-col gap-8">
          {timelineItems.map((item, i) => (
            <TimelineItem
              key={item.title}
              item={item}
              scrollYProgress={scrollYProgress}
              index={i}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function TimelineItem({
  item,
  scrollYProgress,
  index,
}: {
  item: (typeof timelineItems)[number];
  scrollYProgress: MotionValue<number>;
  index: number;
}) {
  const start = 0.15 + index * 0.15;
  const opacity = useTransform(scrollYProgress, [start, start + 0.12], [0, 1]);
  const y = useTransform(scrollYProgress, [start, start + 0.12], [40, 0]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="relative pl-12 sm:pl-0 sm:grid sm:grid-cols-2 sm:gap-8"
    >
      {/* Dot on the line */}
      <div className="absolute left-[13px] top-2 h-2.5 w-2.5 rounded-full bg-indigo-500 sm:left-1/2 sm:-translate-x-1/2" />

      <div className={`${index % 2 === 0 ? "sm:text-right" : "sm:col-start-2"}`}>
        <div className="glass-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">
            {item.period}
          </p>
          <h3 className="mt-1 font-heading text-lg font-semibold text-white">{item.title}</h3>
          <p className="text-sm text-zinc-400">{item.org}</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{item.description}</p>
        </div>
      </div>
    </motion.div>
  );
}
