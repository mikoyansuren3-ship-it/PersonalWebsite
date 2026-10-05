import Image from "next/image";
import { site } from "@/content/site";
import SectionHeader from "./SectionHeader";
import { SECTION_INDEX, stagger } from "./shared";

export default function About() {
  const { about } = site;

  return (
    <section
      id="about"
      aria-labelledby="about-title"
      data-sr
      data-intro-inert
      className="section-pad"
    >
      <div className="container-site">
        {/*
          One column below 1024px (header, statement, body, facts, portrait: DOM order).
          From 1024px: header + portrait in cols 1-4, text in cols 6-12. The second row is
          1fr so the spanning text column never stretches the header row.
        */}
        <div className="grid-site gap-y-12 lg:grid-rows-[auto_1fr] lg:gap-y-14">
          <SectionHeader
            className="col-span-12 lg:col-span-4 lg:col-start-1 lg:row-start-1"
            index={SECTION_INDEX.about}
            id="about-title"
            eyebrow={about.eyebrow}
            title={about.heading}
          />

          <div className="col-span-12 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
            <p className="t-statement text-pretty text-ink" {...stagger(1)}>
              {about.statement}
            </p>

            <div className="mt-8 max-w-[64ch] space-y-5 text-ink-2 md:mt-10" {...stagger(2)}>
              {about.paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>

            <dl className="mt-12 border-t border-line" {...stagger(3)}>
              {about.facts.map((fact) => (
                <div
                  key={fact.term}
                  className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-baseline gap-x-4 border-b border-line py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] lg:gap-x-6"
                >
                  <dt className="t-label">{fact.term}</dt>
                  <dd className="text-ink">{fact.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <figure
            className="col-span-12 w-full max-w-[320px] lg:col-span-4 lg:col-start-1 lg:row-start-2"
            {...stagger(4)}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[8px] bg-tan-100">
              <Image
                src={about.portrait.src}
                alt={about.portrait.alt}
                fill
                sizes="320px"
                className="object-cover"
              />
            </div>
            <figcaption className="t-label mt-3">Fig. 01 — {about.portrait.alt}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}