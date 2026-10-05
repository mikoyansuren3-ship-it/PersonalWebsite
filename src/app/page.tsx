import Hero from "@/components/hero/Hero";
import About from "@/components/sections/About";
import Capabilities from "@/components/sections/Capabilities";
import Contact from "@/components/sections/Contact";
import Experience from "@/components/sections/Experience";
import Work from "@/components/sections/Work";
import Writing from "@/components/sections/Writing";

/** Re-render daily so the footer's copyright year stays current. */
export const revalidate = 86400;

export default function Home() {
  return (
    <>
      <Hero />
      <About />
      <Experience />
      <Work />
      <Capabilities />
      <Writing />
      <Contact />
    </>
  );
}