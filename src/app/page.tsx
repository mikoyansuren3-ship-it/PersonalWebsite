import PinnedSection from '@/components/scroll/PinnedSection'
import HeroPin from '@/components/home/HeroPin'
import BioPin from '@/components/home/BioPin'
import HighlightsPin from '@/components/home/HighlightsPin'

export default function HomePage() {
  return (
    <>
      {/* Hero — full screen, 3D scene + title */}
      <PinnedSection height="250vh">
        <HeroPin />
      </PinnedSection>

      {/* Bio — short intro paragraph */}
      <PinnedSection height="200vh">
        <BioPin />
      </PinnedSection>

      {/* Highlights — stats + CTA cards */}
      <PinnedSection height="250vh">
        <HighlightsPin />
      </PinnedSection>
    </>
  )
}
