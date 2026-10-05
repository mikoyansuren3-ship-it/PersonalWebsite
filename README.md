# Personal website template

A light, editorial single-page portfolio template built with Next.js 16 (App Router), React 19 and Tailwind CSS v4.

The page opens with an intro animation. Photo prints stream in from off-screen and out of a soft haze. They gather into a tilted vortex, burst outward into an orbit around the page, then peel off one by one and fall into their slots, writing **"Meet Suren."** in a mosaic of photographs. The full stop lands last, the table dips, a ripple of light runs through the word, and the rest of the page fades in.

Everything except the headline is placeholder content, ready to be replaced.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Making it yours

All copy, links and images live in **`src/content/site.ts`**. Replace the bracketed placeholders (`[Your Name]`, `[Your role]`, ...) and the `#` links.

| What | Where |
| --- | --- |
| Name, role, intro text, navigation | `site.name`, `site.role`, `site.lead`, `site.nav` |
| About, experience, work, capabilities, writing, contact | `site.about`, `site.experience`, ... |
| Project and portrait images | `public/placeholders/work-0N.webp`, `public/placeholders/portrait.webp` (or point `site.work.projects[n].image` elsewhere) |
| Mosaic photos | `site.mosaic.images` (24 entries) |
| The full stop's photo | `site.mosaic.periodImage` |
| Large prints that fly past at the start | `site.mosaic.heroPrints` |
| Turn the intro off | `site.intro.enabled = false` |

### Mosaic photos

Each lit cell of the headline is one photo. Replace any `src` in `site.mosaic.images` with your own file under `/public`. Replacing one entry changes only the tiles assigned to it; adding or removing entries reshuffles the assignment.

For the word to read well on the light background, use photos that are **mid-to-dark overall with a clear light/dark split** (a bright sky over a dark landscape, a lit wall with deep shadows, and so on). Square crops of about 320–400 px, saved as WebP, work best. Use `focal` (a CSS `object-position`, for example `"50% 30%"`) to keep a subject in frame.

### Changing the headline

The headline is drawn from bitmap letters in `src/lib/mosaic/glyphs.ts`. Only the letters in "Meet Suren." (`M e t S u r n .`) are defined. To use other words, add glyphs in the same format: a 7-row grid where each lit cell holds its pen-stroke order (`1`–`9`, then `a`–`z`). The first word goes on line one, and the rest on line two. If the new words change the board width, also adjust the empty "notch" next to the first word in `src/app/hero.css` (`.hero-meta--notch`), which holds the intro text on wide screens.

### Placeholder images

The placeholder photographs are generated, not downloaded:

```bash
npm run gen:placeholders
```

This runs `scripts/generate-placeholders.mjs` (deterministic, using `sharp`).

## How the intro works

| Piece | File |
| --- | --- |
| Gate script (runs before first paint and decides whether the intro plays) | `src/lib/intro/gate.ts` |
| Planner: computes every print's 3D flight and compiles it to keyframes | `src/lib/intro/plan.ts` |
| Player: measures the page, builds the stage, plays, skips, replays | `src/lib/intro/player.ts` |
| Skip button and boot | `src/components/intro/IntroController.tsx` |
| Static mosaic (the finished headline, server-rendered) | `src/components/hero/Mosaic.tsx` |
| Hero layout and intro states | `src/app/hero.css` |

Design notes:

- **Server-rendered finished state.** The finished headline is a CSS grid rendered on the server, so the page works without JavaScript. The intro measures that grid and flies each print into its exact tile, then hands off to the static tile.
- **Compositor-only animation.** All motion is precomputed and played with the Web Animations API on `transform` and `opacity` only, so it stays smooth even while the page hydrates. There are no per-frame React renders.
- **Deterministic.** The same layout always produces the same animation (it is seeded).
- **Skip and replay.** The intro can be skipped with the button, Esc, a scroll or swipe, or the keyboard. It can be replayed from the hero or the footer.
- **Reduced motion.** With `prefers-reduced-motion`, the headline fades in quietly instead. Deep links (`/#work`) skip the intro.

### Debugging the intro

| URL parameter | Effect |
| --- | --- |
| `?t=2.4` | Freeze the intro at 2.4 s (useful for inspecting single frames) |
| `?slow=4` | Play at quarter speed |
| `?intro=off` / `?intro=1` | Skip, or force, the intro |
| `?seed=2` | Try a different (deterministic) variation |

In the browser console, `window.__intro` exposes `seek(t)`, `play()`, `pause()`, `skip()`, `plan` and `stats`.

## Other notes

- `src/app/api/contact/route.ts` is a ready-made contact endpoint (it stores messages in Supabase). The template does not use it yet. To enable it, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` and add a form that POSTs `{ name, email, message }`.
- This project uses Next.js 16. Its APIs differ from older versions; the bundled docs are in `node_modules/next/dist/docs/`.