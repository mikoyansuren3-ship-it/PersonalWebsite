/**
 * Every piece of copy, every link and every image on the site lives here.
 * Replace the bracketed placeholders with your own details.
 *
 * The headline is drawn by the intro animation as a mosaic of photo tiles.
 * Supported characters: M, e, t, S, u, r, n and "." (see src/lib/mosaic/glyphs.ts).
 */

export type MosaicImage = {
  /** Path under /public, e.g. "/photos/arches.webp". Square, ~320–400px works best. */
  src: string;
  /** Optional CSS object-position, e.g. "50% 30%", to keep the subject in frame. */
  focal?: string;
};

export type Link = { label: string; href: string };

export const site = {
  /** Shown in the nav wordmark, footer and metadata. */
  name: "[Your Name]",
  /** The mosaic headline. Only change it if you also provide glyphs for new letters. */
  headline: "Meet Suren.",
  role: "[Your role]",
  location: "[City, Country]",
  /** Keep it under ~180 characters to sit beside the headline on wide screens. */
  lead: "[One or two sentences on what you do, who you do it for, and what you care about.]",

  meta: {
    title: "[Your Name] — [Your role]",
    description: "[A one-line description of you and your work for search engines and link previews.]",
  },

  nav: [
    { label: "About", href: "#about" },
    { label: "Experience", href: "#experience" },
    { label: "Work", href: "#work" },
    { label: "Writing", href: "#writing" },
    { label: "Contact", href: "#contact" },
  ] satisfies Link[],

  resume: { label: "Résumé", href: "#" } satisfies Link,

  about: {
    eyebrow: "About",
    heading: "[A short headline about you]",
    statement: "[A short statement about how you work and what you value.]",
    paragraphs: [
      "[A paragraph about your background — where you started, what you studied, and the thread that connects the work you have done since.]",
      "[A paragraph about what you are focused on now, the kind of problems you enjoy, and what you are looking for next.]",
    ],
    facts: [
      { term: "Based in", detail: "[City]" },
      { term: "Focus", detail: "[Area of focus]" },
      { term: "Currently", detail: "[Role] at [Company]" },
      { term: "Previously", detail: "[Company]" },
    ],
    portrait: { src: "/placeholders/portrait.webp", alt: "Portrait placeholder" },
  },

  experience: {
    eyebrow: "Experience",
    heading: "[Where you have worked]",
    items: [
      { years: "20XX — Now", role: "[Role title]", company: "[Company]", summary: "[One line on what you owned and the impact it had.]", href: "#" },
      { years: "20XX — 20XX", role: "[Role title]", company: "[Company]", summary: "[One line on what you owned and the impact it had.]", href: "#" },
      { years: "20XX — 20XX", role: "[Role title]", company: "[Company]", summary: "[One line on what you owned and the impact it had.]", href: "#" },
      { years: "20XX — 20XX", role: "[Role title]", company: "[Company]", summary: "[One line on what you owned and the impact it had.]", href: "#" },
    ],
  },

  work: {
    eyebrow: "Selected work",
    heading: "[Things you have made]",
    projects: [
      { title: "Project title", year: "20XX", description: "[One sentence describing the project and your part in it.]", tags: ["[Tag]", "[Tag]", "[Tag]"], image: "/placeholders/work-01.webp", href: "#" },
      { title: "Project title", year: "20XX", description: "[One sentence describing the project and your part in it.]", tags: ["[Tag]", "[Tag]"], image: "/placeholders/work-02.webp", href: "#" },
      { title: "Project title", year: "20XX", description: "[One sentence describing the project and your part in it.]", tags: ["[Tag]", "[Tag]", "[Tag]"], image: "/placeholders/work-03.webp", href: "#" },
      { title: "Project title", year: "20XX", description: "[One sentence describing the project and your part in it.]", tags: ["[Tag]", "[Tag]"], image: "/placeholders/work-04.webp", href: "#" },
    ],
  },

  capabilities: {
    eyebrow: "Capabilities",
    heading: "[What you bring]",
    groups: [
      { title: "[Discipline A]", items: ["[Skill]", "[Skill]", "[Skill]", "[Skill]", "[Skill]"] },
      { title: "[Discipline B]", items: ["[Skill]", "[Skill]", "[Skill]", "[Skill]", "[Skill]"] },
      { title: "[Tools]", items: ["[Tool]", "[Tool]", "[Tool]", "[Tool]", "[Tool]"] },
    ],
  },

  writing: {
    eyebrow: "Writing",
    heading: "[Notes and essays]",
    posts: [
      { date: "Mon DD, 20XX", title: "[Title of an article or talk]", readTime: "X min", href: "#" },
      { date: "Mon DD, 20XX", title: "[Title of an article or talk]", readTime: "X min", href: "#" },
      { date: "Mon DD, 20XX", title: "[Title of an article or talk]", readTime: "X min", href: "#" },
    ],
  },

  contact: {
    eyebrow: "Contact",
    heading: "[A short invitation to get in touch.]",
    email: "name@example.com",
    note: "[Typically replies within a few days.]",
    socials: [
      { label: "LinkedIn", href: "#" },
      { label: "GitHub", href: "#" },
      { label: "Elsewhere", href: "#" },
    ] satisfies Link[],
  },

  /** Photos used by the intro mosaic. Replace any `src` with your own photo. */
  mosaic: {
    images: [
      { src: "/placeholders/tiles/t01.webp" },
      { src: "/placeholders/tiles/t02.webp" },
      { src: "/placeholders/tiles/t03.webp" },
      { src: "/placeholders/tiles/t04.webp" },
      { src: "/placeholders/tiles/t05.webp" },
      { src: "/placeholders/tiles/t06.webp" },
      { src: "/placeholders/tiles/t07.webp" },
      { src: "/placeholders/tiles/t08.webp" },
      { src: "/placeholders/tiles/t09.webp" },
      { src: "/placeholders/tiles/t10.webp" },
      { src: "/placeholders/tiles/t11.webp" },
      { src: "/placeholders/tiles/t12.webp" },
      { src: "/placeholders/tiles/t13.webp" },
      { src: "/placeholders/tiles/t14.webp" },
      { src: "/placeholders/tiles/t15.webp" },
      { src: "/placeholders/tiles/t16.webp" },
      { src: "/placeholders/tiles/t17.webp" },
      { src: "/placeholders/tiles/t18.webp" },
      { src: "/placeholders/tiles/t19.webp" },
      { src: "/placeholders/tiles/t20.webp" },
      { src: "/placeholders/tiles/t21.webp" },
      { src: "/placeholders/tiles/t22.webp" },
      { src: "/placeholders/tiles/t23.webp" },
      { src: "/placeholders/tiles/t24.webp" },
    ] satisfies MosaicImage[],
    /** The full stop is a larger 2×2 print — a good spot for a portrait. */
    periodImage: { src: "/placeholders/period.webp" } satisfies MosaicImage,
    /** Large prints that drift past the camera at the start of the intro. */
    heroPrints: [
      { src: "/placeholders/print-01.webp", aspect: 3 / 2 },
      { src: "/placeholders/print-02.webp", aspect: 4 / 5 },
      { src: "/placeholders/print-03.webp", aspect: 1 },
    ],
  },

  intro: {
    /** Set to false to show the finished headline without the intro animation. */
    enabled: true,
  },
};

export type Site = typeof site;
