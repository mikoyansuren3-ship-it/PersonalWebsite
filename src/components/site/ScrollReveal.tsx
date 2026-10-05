"use client";

import { useEffect } from "react";

/** Share of an element (or of the viewport, for very tall elements) that must be visible. */
const VISIBLE = 0.15;

/**
 * Reveals every [data-sr] element once it scrolls into view (CSS lives in globals.css).
 *
 * Order matters: anything already on screen is marked "in" first, and only then is
 * html[data-sr-ready] set, which is what arms the hidden state. Nothing that is
 * visible can disappear, and without JavaScript nothing is hidden at all.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const reveal = (el: Element) => {
      (el as HTMLElement).dataset.sr = "in";
    };

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-sr]")).filter(
      (el) => el.dataset.sr !== "in",
    );

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach(reveal);
      return;
    }

    const viewportHeight = window.innerHeight || root.clientHeight;
    const pending = targets.filter((el) => {
      const rect = el.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < viewportHeight && rect.height > 0;
      if (onScreen) reveal(el);
      return !onScreen;
    });

    // threshold is 0.15, with a few lower steps so that a section taller than ~6.7
    // viewports (whose ratio can never reach 0.15) still reveals once 15% of the
    // viewport is filled by it.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const rootHeight = entry.rootBounds?.height ?? window.innerHeight;
          if (
            entry.intersectionRatio >= VISIBLE ||
            entry.intersectionRect.height >= rootHeight * VISIBLE
          ) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: [0.025, 0.05, 0.1, VISIBLE] },
    );

    pending.forEach((el) => observer.observe(el));
    root.dataset.srReady = "1";

    return () => {
      observer.disconnect();
      delete root.dataset.srReady;
    };
  }, []);

  return null;
}