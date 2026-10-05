import Image from "next/image";
import { site } from "@/content/site";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import { SECTION_INDEX, externalLinkProps, isExternal, stagger } from "./shared";

type Project = {
  title: string;
  year: string;
  description: string;
  tags: readonly string[];
  image: string;
  href?: string;
  /** Optional alt text; the image is treated as decorative (the title names the link) when omitted. */
  alt?: string;
};

// Rendered widths: 7 of 12 columns (~690px max) and 5 of 12 columns (~490px max).
const SIZES_WIDE = "(min-width: 1280px) 700px, (min-width: 768px) 58vw, 100vw";
const SIZES_NARROW = "(min-width: 1280px) 500px, (min-width: 768px) 42vw, 100vw";

/*
  Asymmetric zigzag on the 12-column grid from 768px (one column below):
    row 1: cols 1-7 (high)  |  cols 8-12 (dropped)
    row 2: cols 1-5 (high)  |  cols 6-12 (dropped)
  The narrow cards get extra inner space at 1024px+ so the pairs breathe.
  More than four projects repeat the pattern.
*/
const LAYOUT = [
  { cell: "md:col-span-7 md:col-start-1", sizes: SIZES_WIDE },
  { cell: "md:col-span-5 md:col-start-8 md:mt-24 lg:mt-32 lg:pl-8", sizes: SIZES_NARROW },
  { cell: "md:col-span-5 md:col-start-1 lg:pr-8", sizes: SIZES_NARROW },
  { cell: "md:col-span-7 md:col-start-6 md:mt-24 lg:mt-32", sizes: SIZES_WIDE },
] as const;

function ProjectCard({ project, sizes }: { project: Project; sizes: string }) {
  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[8px] bg-tan-100">
        <Image
          src={project.image}
          alt={project.alt ?? ""}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-700 ease-editorial motion-safe:group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <h3 className="t-title text-ink decoration-tan decoration-1 underline-offset-[5px] group-hover:underline">
          {project.title}
        </h3>
        <p className="t-label shrink-0">{project.year}</p>
      </div>
      <p className="mt-2 max-w-[52ch] text-ink-2">{project.description}</p>
    </>
  );

  return (
    <article>
      {project.href ? (
        <a href={project.href} {...externalLinkProps(project.href)} className="group block">
          {body}
          {isExternal(project.href) && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      ) : (
        <div>{body}</div>
      )}
      {project.tags.length > 0 && (
        <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-2">
          {project.tags.map((tag, i) => (
            <li key={`${tag}-${i}`} className="chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function Work() {
  const { work } = site;
  const projects: readonly Project[] = work.projects;

  return (
    <section
      id="work"
      aria-labelledby="work-title"
      data-sr
      data-intro-inert
      className="section-pad"
    >
      <div className="container-site">
        <SectionHeader index={SECTION_INDEX.work} id="work-title" eyebrow={work.eyebrow} title={work.heading} />

        <ul className="grid-site mt-12 gap-y-16 md:mt-16 md:gap-y-20 lg:gap-y-24">
          {projects.map((project, i) => {
            const layout = LAYOUT[i % LAYOUT.length];
            return (
              <li key={i} className={cn("col-span-12", layout.cell)} {...stagger(i + 1)}>
                <ProjectCard project={project} sizes={layout.sizes} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}