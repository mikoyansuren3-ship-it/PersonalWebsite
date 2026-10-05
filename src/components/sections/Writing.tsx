import { ArrowUpRight } from "lucide-react";
import { site } from "@/content/site";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import { SECTION_INDEX, externalLinkProps, isExternal, stagger } from "./shared";

type Post = {
  date: string;
  title: string;
  readTime: string;
  href?: string;
};

/*
  Below 768px: date, read time and arrow on the first line, title underneath.
  From 768px: date (1-2) | title (3-9) | read time (10-11) | arrow (12).
*/
const rowGrid =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 py-6 md:grid-cols-12 lg:gap-x-6";

function RowCells({ post }: { post: Post }) {
  return (
    <>
      <p className="t-label col-start-1 row-start-1 md:col-span-2">{post.date}</p>
      <h3 className="col-span-3 row-start-2 font-display text-[1.375rem] leading-[1.3] text-ink md:col-span-7 md:col-start-3 md:row-start-1">
        {post.title}
      </h3>
      <p className="t-label col-start-2 row-start-1 md:col-span-2 md:col-start-10">{post.readTime}</p>
    </>
  );
}

export default function Writing() {
  const { writing } = site;
  const posts: readonly Post[] = writing.posts;

  return (
    <section
      id="writing"
      aria-labelledby="writing-title"
      data-sr
      data-intro-inert
      className="section-pad"
    >
      <div className="container-site">
        <SectionHeader index={SECTION_INDEX.writing} id="writing-title" eyebrow={writing.eyebrow} title={writing.heading} />

        <ol className="mt-12 border-b border-line md:mt-16">
          {posts.map((post, i) => (
            <li key={i} className="border-t border-line" {...stagger(i + 1)}>
              {post.href ? (
                <a
                  href={post.href}
                  {...externalLinkProps(post.href)}
                  className={cn(
                    rowGrid,
                    "group -mx-3 px-3 transition-colors duration-150 ease-out hover:bg-sand focus-visible:bg-sand focus-visible:outline-offset-[-2px] sm:-mx-4 sm:px-4",
                  )}
                >
                  <RowCells post={post} />
                  <span
                    aria-hidden
                    className="col-start-3 row-start-1 justify-self-end text-ink-2 md:col-start-12"
                  >
                    <ArrowUpRight className="size-[18px] transition-transform duration-150 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1" />
                  </span>
                  {isExternal(post.href) && <span className="sr-only"> (opens in a new tab)</span>}
                </a>
              ) : (
                <div className={rowGrid}>
                  <RowCells post={post} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}