"use client";

import PinnedSection from "@/components/scroll/PinnedSection";
import AboutHeroPin from "@/components/about/AboutHeroPin";
import SkillsPin from "@/components/about/SkillsPin";
import ExperienceTimeline from "@/components/about/ExperienceTimeline";

export default function AboutPage() {
  return (
    <>
      <PinnedSection height="200vh">
        {(progress) => <AboutHeroPin scrollYProgress={progress} />}
      </PinnedSection>

      <PinnedSection height="300vh">
        {(progress) => <SkillsPin scrollYProgress={progress} />}
      </PinnedSection>

      <PinnedSection height="400vh">
        {(progress) => <ExperienceTimeline scrollYProgress={progress} />}
      </PinnedSection>
    </>
  );
}
