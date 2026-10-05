import { ArrowUpRight } from "lucide-react";
import { site } from "@/content/site";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import { SECTION_INDEX, externalLinkProps, isExternal, stagger } from "./shared";

type ExperienceItem = {
  years: string;
  role: string;
  company: string;
  summary: string;
  href?: string;
};

/*
  Below 768px: years + arrow on the first line, then role/company, then summary.
  From 768px: one row on the 12-col grid: years (1-2) | role (3-6) | summary (7-11) | arrow (12).
*/
const rowGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-3 py-7 md:grid-cols-12 lg:gap-x-6";

function RowCells({ item }: { item: ExperienceItem }) {
  return (
    <>
      <p className="t-label col-start-1 row-start-1 md:col-span-2">{item.years}</p>
      <div className="col-span-2 md:col-span-4 md:col-start-3 md:row-start-1">
        <h3 className="t-h3 text-ink">{item.role}</h3>
        <p className="t-small mt-1 text-ink-2">{item.company}</p>
      </div>
      <p className="col-span-2 max-w-[56ch] text-ink-2 md:col-span-5 md:col-start-7 md:row-start-1">
        {item.summary}
      </p>
    </>
  );
}

export default function Experience() {
  const { experience } = site;
  const items: readonly ExperienceItem[] = experience.items;

  return (
    <section
      id="experience"
      aria-labelledby="experience-title"
      data-intro-inert
      className="section-pad bg-sand"
    >
      {/* data-sr sits on the inner container so the sand band itself never fades or moves. */}
      <div data-sr className="container-site">
        <SectionHeader
          index={SECTION_INDEX.experience}
          id="experience-title"
          eyebrow={experience.eyebrow}
          title={experience.heading}
        />

        <ol className="mt-12 border-b border-line md:mt-16">
          {items.map((item, i) => (
            <li key={i} className="border-t border-line" {...stagger(i + 1)}>
              {item.href ? (
                <a
                  href={item.href}
                  {...externalLinkProps(item.href)}
                  className={cn(
                    rowGrid,
                    "group -mx-3 px-3 transition-colors duration-150 ease-out hover:bg-paper focus-visible:bg-paper focus-visible:outline-offset-[-2px] sm:-mx-4 sm:px-4",
                  )}
                >
                  <RowCells item={item} />
                  <span
                    aria-hidden
                    className="col-start-2 row-start-1 justify-self-end text-ink-2 md:col-start-12"
                  >
                    <ArrowUpRight className="size-[18px] transition-transform duration-150 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1" />
                  </span>
                  {isExternal(item.href) && <span className="sr-only"> (opens in a new tab)</span>}
                </a>
              ) : (
                <div className={rowGrid}>
                  <RowCells item={item} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}