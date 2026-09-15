"use client";

import { useRef } from "react";
import { useScroll, type MotionValue } from "framer-motion";

interface PinnedSectionProps {
  height?: string;
  children: (scrollYProgress: MotionValue<number>) => React.ReactNode;
}

export default function PinnedSection({ height = "300vh", children }: PinnedSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  return (
    <div ref={containerRef} style={{ height }} className="relative">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {children(scrollYProgress)}
      </div>
    </div>
  );
}
