import type { CSSProperties } from "react";

/**
 * Props for an item that fades in with its section (see ScrollReveal + globals.css).
 * `i` staggers it: each step adds 70ms of delay.
 */
export function stagger(i: number) {
  return { "data-sr-i": "", style: { "--i": i } as CSSProperties };
}

/** Catalogue number of each section, shared by the section headers and the mobile menu. */
export const SECTION_INDEX: Record<string, number> = {
  about: 1,
  experience: 2,
  work: 3,
  capabilities: 4,
  writing: 5,
  contact: 6,
};

/** 1 -> "01": catalogue-style numbering. */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** True for absolute http(s) links, which open in a new tab. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** `target`/`rel` for links that leave the site; nothing for in-page or relative links. */
export function externalLinkProps(href: string) {
  return isExternal(href) ? ({ target: "_blank", rel: "noopener noreferrer" } as const) : {};
}