import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import ReplayButton from "@/components/intro/ReplayButton";
import { site } from "@/content/site";
import { buildBoard } from "@/lib/mosaic/glyphs";
import Mosaic from "./Mosaic";

/** Characters of lead text that fit beside the first word on wide screens (5 lines). */
const LONG_LEAD = 180;

function item(i: number) {
  return { "data-reveal-item": "", style: { "--i": i } as CSSProperties };
}

export default function Hero() {
  const board = buildBoard(site.headline);
  return (
    <section
      id="top"
      // A lead too long for the space beside "Meet" uses the stacked layout instead.
      className={site.lead.length > LONG_LEAD ? "hero hero--long-lead" : "hero"}
      aria-labelledby="hero-title"
    >
      <div className="hero-stack" style={{ "--cols": board.cols, "--rows": board.rows } as CSSProperties}>
        <div className="mosaic-wrap">
          <h1 id="hero-title" tabIndex={-1} className="hero-title">
            <span className="sr-only">{site.headline}</span>
            <Mosaic board={board} />
          </h1>

          {/* Wide screens: the introduction sits in the space to the right of the first word. */}
          <div className="hero-meta hero-meta--notch" data-reveal="meta" data-intro-inert="">
            <p className="t-label" {...item(0)}>
              {site.role} · {site.location}
            </p>
            <div {...item(1)}>
              <p className="t-lead hero-lead">{site.lead}</p>
            </div>
            <div className="flex items-center gap-3" {...item(2)}>
              <a href="#work" className="btn btn-primary">
                View work
                <ArrowUpRight aria-hidden />
              </a>
              <ReplayButton />
            </div>
          </div>
        </div>

        {/* Narrower screens: the introduction sits below the headline. */}
        <div className="hero-meta hero-meta--stacked" data-reveal="meta" data-intro-inert="">
          <p className="t-label" {...item(0)}>
            {site.role} · {site.location}
          </p>
          <p className="t-lead" {...item(1)}>
            {site.lead}
          </p>
          <div className="hero-ctas" {...item(2)}>
            <a href="#work" className="btn btn-primary">
              View work
              <ArrowUpRight aria-hidden />
            </a>
            <a href="#contact" className="btn btn-secondary">
              Get in touch
            </a>
            <ReplayButton />
          </div>
        </div>
      </div>

      <a href="#about" className="scroll-cue" data-reveal="cue" data-intro-inert="">
        <span className="t-label">Scroll</span>
        <span className="scroll-cue-line" aria-hidden />
      </a>
    </section>
  );
}