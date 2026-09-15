"use client";

import PinnedSection from "@/components/scroll/PinnedSection";
import HeroPin from "@/components/home/HeroPin";
import BioPin from "@/components/home/BioPin";
import HighlightsPin from "@/components/home/HighlightsPin";

export default function Home() {
  return (
    <>
      <PinnedSection height="200vh">
        {(progress) => <HeroPin scrollYProgress={progress} />}
      </PinnedSection>

      <PinnedSection height="250vh">
        {(progress) => <BioPin scrollYProgress={progress} />}
      </PinnedSection>

      <PinnedSection height="300vh">
        {(progress) => <HighlightsPin scrollYProgress={progress} />}
      </PinnedSection>
    </>
  );
}
