/**
 * The intro player: measures the page, compiles the plan, builds the stage, and plays
 * everything on one shared clock. Lazy-loaded by IntroController only when the intro
 * actually plays.
 *
 * Debug helpers (development builds, or any build with ?intro=debug):
 *   ?t=2.4      freeze the intro at 2.4 s (seconds; values ≥ 30 are read as ms)
 *   ?slow=4     play at quarter speed
 *   ?seed=2     try another deterministic variation
 *   window.__intro  { seek(t), play(), pause(), skip(), time(), plan, stats }
 */

import { site } from "@/content/site";
import { compilePlan, type Frame, type FrameSlot, type Plan } from "./plan";

const html = () => document.documentElement;
const STAGE_ID = "intro-stage";

type Run = {
  plan: Plan;
  frame: Frame;
  stage: HTMLElement;
  anims: Animation[];
  clock: Animation;
  plate: HTMLElement;
  tiles: HTMLElement[];
  handed: boolean[];
  rippled: boolean;
  raf: number;
  frozen: boolean;
  finished: boolean;
  returnFocus: HTMLElement | null;
  cleanup: (() => void)[];
};

let active: Run | null = null;
let starting = false;
let stats: Record<string, number> = {};

function setState(state: string) {
  html().setAttribute("data-intro", state);
}

function setInert(on: boolean) {
  document.querySelectorAll<HTMLElement>("[data-intro-inert]").forEach((el) => {
    if (on) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  });
}

/** Scroll to the very top without the page's smooth scrolling. */
function scrollTopInstant() {
  const d = html();
  const prev = d.style.scrollBehavior;
  d.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  d.style.scrollBehavior = prev;
}

function clearFailsafe() {
  const w = window as unknown as { __introFailsafe?: number };
  if (w.__introFailsafe) window.clearTimeout(w.__introFailsafe);
  w.__introFailsafe = undefined;
}

function restoreScrollRestoration() {
  if ("scrollRestoration" in history) history.scrollRestoration = "auto";
}

const debugEnabled = () =>
  process.env.NODE_ENV !== "production" || /[?&]intro=debug/.test(location.search);

function params() {
  if (!debugEnabled()) return { freezeAt: null, slow: 1, seed: 1 };
  const q = new URLSearchParams(location.search);
  const t = q.get("t");
  let freezeAt: number | null = null;
  if (t !== null && t !== "" && Number.isFinite(Number(t))) {
    const v = Number(t);
    freezeAt = v >= 30 ? v / 1000 : v;
  }
  const slow = Number(q.get("slow")) || 1;
  const seed = Number(q.get("seed")) || 1;
  return { freezeAt, slow: slow > 0 ? slow : 1, seed };
}

/** Read the laid-out mosaic: its centre, the grid metrics and every tile slot. */
function measure(seed: number): { frame: Frame; plate: HTMLElement; tiles: HTMLElement[] } | null {
  const plate = document.querySelector<HTMLElement>(".mosaic");
  if (!plate) return null;
  const tiles = [...plate.querySelectorAll<HTMLElement>(".tile")];
  const rect = plate.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10 || tiles.length === 0) return null;
  const Cx = rect.left + rect.width / 2;
  const Cy = rect.top + rect.height / 2;
  const cs = getComputedStyle(plate);
  const g = parseFloat(cs.columnGap) || 0;
  const s = parseFloat(cs.gridTemplateColumns.split(" ").filter(Boolean)[0]) || 10;
  const firstLineGlyphs = site.headline.trim().split(/\s+/)[0].length;
  const slots: FrameSlot[] = [];
  for (const el of tiles) {
    const r = el.getBoundingClientRect();
    const order = Number(el.dataset.i);
    const img = el.querySelector("img");
    const glyph = Number(el.dataset.glyph ?? 0);
    slots[order] = {
      order,
      x: r.left + r.width / 2 - Cx,
      y: r.top + r.height / 2 - Cy,
      size: r.width,
      span: el.classList.contains("tile--period") ? 2 : 1,
      glyph,
      line: glyph < firstLineGlyphs ? 0 : 1,
      img: img?.getAttribute("src") ?? "",
      focal: img?.style.objectPosition || undefined,
    };
  }
  return {
    plate,
    tiles,
    frame: {
      W: html().clientWidth,
      H: window.innerHeight,
      Cx,
      Cy,
      p: s + g,
      g,
      s,
      wm: rect.width / 2,
      hm: rect.height / 2,
      slots,
      tileImages: site.mosaic.images.map((i) => i.src),
      heroPrints: site.mosaic.heroPrints.map((h) => ({ src: h.src, aspect: h.aspect })),
      seed,
    },
  };
}

/** True if the page still looks exactly as it did when it was measured. */
function layoutUnchanged(frame: Frame, plate: HTMLElement): boolean {
  if (window.scrollY !== 0) return false;
  if (Math.abs(html().clientWidth - frame.W) > 1 || Math.abs(window.innerHeight - frame.H) > 1) return false;
  const r = plate.getBoundingClientRect();
  return Math.abs(r.left + r.width / 2 - frame.Cx) < 1 && Math.abs(r.top + r.height / 2 - frame.Cy) < 1;
}

function buildStage(plan: Plan, frame: Frame): { stage: HTMLElement; tileEls: HTMLElement[]; shadowEls: HTMLElement[]; cams: HTMLElement[] } {
  document.getElementById(STAGE_ID)?.remove();
  const stage = document.createElement("div");
  stage.id = STAGE_ID;
  stage.setAttribute("aria-hidden", "true");
  stage.style.visibility = "hidden";

  const layer = () => {
    const l = document.createElement("div");
    l.className = "layer";
    l.style.perspective = `${plan.P}px`;
    l.style.perspectiveOrigin = `${frame.Cx}px ${frame.Cy}px`;
    const cam = document.createElement("div");
    cam.className = "cam";
    cam.style.left = `${frame.Cx}px`;
    cam.style.top = `${frame.Cy}px`;
    l.appendChild(cam);
    stage.appendChild(l);
    return cam;
  };
  const shadowCam = layer();
  const tileCam = layer();

  const shadowEls = plan.shadows.map(() => {
    const el = document.createElement("div");
    el.className = "sh";
    el.style.opacity = "0";
    shadowCam.appendChild(el);
    return el;
  });

  const tileEls = plan.elements.map((e) => {
    const el = document.createElement("div");
    el.className = e.mat ? "ft mat" : "ft";
    el.style.width = `${e.w}px`;
    el.style.height = `${e.h}px`;
    el.style.left = `${-e.w / 2}px`;
    el.style.top = `${-e.h / 2}px`;
    el.style.opacity = "0";
    // Proportional shadow: identical to the static tile's once scaled to its final size.
    el.style.boxShadow = `0 ${(0.03 * e.w).toFixed(2)}px ${(0.09 * e.w).toFixed(2)}px rgb(42 33 26 / 0.2)`;
    if (e.mat) el.style.setProperty("--mat", `${e.mat}px`);
    const img = document.createElement("img");
    img.src = e.img;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    if (e.focal) img.style.objectPosition = e.focal;
    el.appendChild(img);
    tileCam.appendChild(el);
    return el;
  });

  document.body.appendChild(stage);
  return { stage, tileEls, shadowEls, cams: [shadowCam, tileCam] };
}

/**
 * Start decoding every image the intro shows (the mosaic photos and the large prints)
 * so they are ready by the time the stage needs them. Resolves when all are decoded
 * or after `capMs`, whichever comes first.
 */
function predecode(plate: HTMLElement, capMs: number): Promise<unknown> {
  const urls = new Set<string>();
  plate.querySelectorAll("img").forEach((i) => urls.add(i.currentSrc || i.src));
  site.mosaic.heroPrints.forEach((h) => urls.add(new URL(h.src, location.href).href));
  const jobs = [...urls].map((u) => {
    const img = new Image();
    img.src = u;
    return img.decode();
  });
  return Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, capMs))]);
}

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

export type IntroHandle = { skip: () => void; destroy: () => void };

function whenVisible(): Promise<void> {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", on);
      resolve();
    };
    document.addEventListener("visibilitychange", on);
  });
}

/**
 * Plays the intro. `replay` first fades the finished headline out.
 * Resolves once playback has started (or immediately if it cannot play).
 */
export async function playIntro({ replay = false } = {}): Promise<IntroHandle | null> {
  if (active || starting) return null;
  starting = true;
  try {
    return await start(replay);
  } finally {
    starting = false;
  }
}

async function start(replay: boolean): Promise<IntroHandle | null> {
  const { freezeAt, slow, seed } = params();
  const returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null;

  if (replay) {
    clearFailsafe();
    const plateEl = document.querySelector<HTMLElement>(".mosaic");
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    scrollTopInstant();
    if (plateEl) {
      await plateEl
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "ease-in", fill: "forwards" })
        .finished.catch(() => {});
    }
    setState("pending");
    html().removeAttribute("data-ripple");
    html().removeAttribute("data-sheen");
    plateEl?.querySelectorAll(".tile[data-on]").forEach((t) => t.removeAttribute("data-on"));
    plateEl?.getAnimations().forEach((a) => a.cancel());
  } else {
    scrollTopInstant();
  }

  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 300))]);
  if (html().getAttribute("data-intro") !== "pending") return bail(null);
  if (window.scrollY !== 0) scrollTopInstant();
  const tStart = performance.now();
  const measured = measure(seed);
  if (!measured) return bail(null, "skip");
  const { frame, plate, tiles } = measured;
  const decoded = predecode(plate, 1500);
  const plan = compilePlan(frame);
  const tPlan = performance.now();
  const { stage, tileEls, shadowEls, cams } = buildStage(plan, frame);

  // Animations are created idle (not playing) in small batches, so the page stays
  // responsive (e.g. to Skip); they all start together at the commit below.
  const ms = plan.duration * 1000;
  const timing: KeyframeEffectOptions = { duration: ms, easing: "linear", fill: "both" };
  const make = (el: Element, frames: Keyframe[] | PropertyIndexedKeyframes) =>
    new Animation(new KeyframeEffect(el, frames, timing), document.timeline);
  const anims: Animation[] = [];
  const clock = make(cams[1], plan.cam);
  anims.push(clock, make(cams[0], plan.cam), make(plate, plan.plate));
  for (let i = 0; i < plan.elements.length; i++) {
    anims.push(make(tileEls[i], plan.elements[i].frames));
    if (i % 32 === 31) await yieldToMain();
  }
  for (let i = 0; i < plan.shadows.length; i++) {
    anims.push(make(shadowEls[i], plan.shadows[i]));
    if (i % 48 === 47) await yieldToMain();
  }
  const progress = document.querySelector<HTMLElement>(".intro-skip-progress");
  if (progress) anims.push(make(progress, [{ scale: "0 1" }, { scale: "1 1" }]));
  const tBuilt = performance.now();
  await decoded;
  stats = {
    compileMs: Math.round(tPlan - tStart),
    buildMs: Math.round(tBuilt - tPlan),
    waitDecodeMs: Math.round(performance.now() - tBuilt),
    animations: anims.length,
    keyframes: plan.elements.reduce((n, e) => n + e.frames.length, 0) + plan.shadows.reduce((n, s) => n + s.length, 0),
  };

  // A tab opened in the background waits until it is first shown, so nobody misses the intro.
  if (freezeAt === null) await whenVisible();
  const discard = () => {
    anims.forEach((a) => a.cancel());
    stage.remove();
  };
  if (html().getAttribute("data-intro") !== "pending") {
    discard();
    return bail(returnFocus);
  }
  if (!layoutUnchanged(frame, plate)) {
    // The page moved or resized while we were preparing: show the finished page instead.
    discard();
    return bail(returnFocus, "skip");
  }

  const run: Run = {
    plan,
    frame,
    stage,
    anims,
    clock,
    plate,
    tiles,
    handed: new Array(tiles.length).fill(false),
    rippled: false,
    raf: 0,
    frozen: freezeAt !== null,
    finished: false,
    returnFocus,
    cleanup: [],
  };
  active = run;

  // Commit in one task.
  clearFailsafe();
  setInert(true);
  setState("running");
  stage.style.visibility = "visible";
  if (run.frozen) {
    seek(run, freezeAt!);
  } else {
    for (const a of anims) a.playbackRate = 1 / slow;
    const t0 = (document.timeline.currentTime as number) + 34;
    for (const a of anims) a.startTime = t0;
    loop(run);
  }
  bindControls(run);
  if (debugEnabled()) exposeDebug(run);

  return {
    skip: () => skip(run),
    destroy: () => teardown(run),
  };
}

/** Abandon a start that never committed. */
function bail(returnFocus: HTMLElement | null, state?: string): null {
  if (state) setState(state);
  setInert(false);
  restoreScrollRestoration();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  return null;
}

function currentTime(run: Run): number {
  const t = run.clock.currentTime;
  return typeof t === "number" ? t / 1000 : 0;
}

/** Discrete state as a pure function of time: per-tile handoffs and the ripple. */
function applyDiscrete(run: Run, t: number) {
  const { plan, tiles } = run;
  tiles.forEach((el, i) => {
    const on = t >= plan.handoff[i];
    if (on !== run.handed[i]) {
      run.handed[i] = on;
      if (on) el.setAttribute("data-on", "");
      else el.removeAttribute("data-on");
    }
  });
  const ripple = t >= plan.tP;
  if (ripple !== run.rippled) {
    run.rippled = ripple;
    if (ripple) html().setAttribute("data-ripple", "");
    else html().removeAttribute("data-ripple");
  }
}

function loop(run: Run) {
  cancelAnimationFrame(run.raf);
  const tick = () => {
    if (run.finished || run.frozen) return;
    const t = currentTime(run);
    applyDiscrete(run, t);
    if (t >= run.plan.duration - 1e-3) {
      finish(run);
      return;
    }
    run.raf = requestAnimationFrame(tick);
  };
  run.raf = requestAnimationFrame(tick);
}

function seek(run: Run, t: number) {
  const tt = Math.max(0, Math.min(run.plan.duration, t));
  for (const a of run.anims) {
    a.pause();
    a.currentTime = tt * 1000;
  }
  applyDiscrete(run, tt);
  // Pin the CSS-driven ripple to the same moment (flush styles so its animations exist).
  void getComputedStyle(run.plate).opacity;
  document.getAnimations().forEach((a) => {
    if (a instanceof CSSAnimation && (a.animationName === "intro-tile-ripple" || a.animationName === "intro-ripple-ring")) {
      a.pause();
      a.currentTime = Math.max(0, (tt - run.plan.tP) * 1000);
    }
  });
}

/** Put focus somewhere sensible once the page is interactive again. */
function settleFocus(run: Run) {
  const current = document.activeElement;
  const lost = !current || current === document.body || current.classList.contains("intro-skip");
  if (!lost) return;
  const back = run.returnFocus;
  if (back?.isConnected && !back.closest("[inert]") && back.getClientRects().length > 0) {
    back.focus({ preventScroll: true });
  } else if (current?.classList.contains("intro-skip") || back) {
    document.getElementById("hero-title")?.focus({ preventScroll: true });
  }
}

function endCommon(run: Run) {
  run.finished = true;
  cancelAnimationFrame(run.raf);
  run.cleanup.forEach((f) => f());
  run.cleanup = [];
  run.tiles.forEach((el) => el.setAttribute("data-on", ""));
  restoreScrollRestoration();
  const w = window as unknown as { __intro?: { run?: Run } };
  if (w.__intro?.run === run) delete w.__intro;
  if (active === run) active = null;
}

function finish(run: Run) {
  if (run.finished) return;
  endCommon(run);
  setState("done");
  setInert(false);
  for (const a of run.anims) a.cancel();
  run.stage.remove();
  html().setAttribute("data-sheen", "");
  window.setTimeout(() => {
    if (active) return;
    html().removeAttribute("data-sheen");
    html().removeAttribute("data-ripple");
  }, 1600);
  settleFocus(run);
}

/** Skip: cross-fade from the flight to the finished headline. */
function skip(run: Run) {
  if (run.finished) return;
  const plateNow = getComputedStyle(run.plate).transform;
  endCommon(run);
  run.anims.forEach((a) => a.pause());
  const fade = run.stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease-out", fill: "forwards" });
  run.plate.getAnimations().forEach((a) => a.cancel());
  run.plate.animate(
    [
      { transform: plateNow === "none" ? "none" : plateNow, opacity: 0 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" },
  );
  html().removeAttribute("data-ripple");
  setState("done");
  setInert(false);
  fade.finished
    .catch(() => {})
    .finally(() => {
      run.anims.forEach((a) => a.cancel());
      run.stage.remove();
    });
  settleFocus(run);
}

function teardown(run: Run) {
  if (run.finished) return;
  endCommon(run);
  run.anims.forEach((a) => a.cancel());
  run.stage.remove();
  html().removeAttribute("data-ripple");
  setInert(false);
  setState("done");
}

function bindControls(run: Run) {
  const onSkip = () => skip(run);
  const onKey = (e: KeyboardEvent) => {
    // The Skip button handles its own Enter/Space; everything else ends the intro.
    const onButton = (e.target as HTMLElement | null)?.classList?.contains("intro-skip");
    if (onButton && (e.key === "Enter" || e.key === " ")) return;
    if (e.key === "Escape" || (!run.frozen && [" ", "PageDown", "ArrowDown", "End", "Enter"].includes(e.key))) skip(run);
  };
  window.addEventListener("intro:skip", onSkip);
  window.addEventListener("keydown", onKey);
  run.cleanup.push(() => {
    window.removeEventListener("intro:skip", onSkip);
    window.removeEventListener("keydown", onKey);
  });
  if (run.frozen) return;

  let wheel = 0;
  const onWheel = (e: WheelEvent) => {
    wheel += Math.abs(e.deltaY);
    if (wheel > 40) skip(run);
  };
  let touchY: number | null = null;
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY;
    if (touchY !== null && y !== undefined && Math.abs(y - touchY) > 40) skip(run);
  };
  const W0 = run.frame.W;
  const H0 = run.frame.H;
  const onResize = () => {
    if (Math.abs(html().clientWidth - W0) > 2 || Math.abs(window.innerHeight - H0) > H0 * 0.15) skip(run);
  };
  const onScroll = () => {
    if (window.scrollY !== 0) skip(run);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") run.anims.forEach((a) => a.pause());
    else run.anims.forEach((a) => a.play());
  };
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onMotion = () => {
    if (motion.matches) skip(run);
  };
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  motion.addEventListener("change", onMotion);
  run.cleanup.push(() => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    motion.removeEventListener("change", onMotion);
  });
}

function exposeDebug(run: Run) {
  (window as unknown as { __intro: unknown }).__intro = {
    run,
    plan: run.plan,
    stats,
    duration: run.plan.duration,
    seek: (t: number) => {
      run.frozen = true;
      cancelAnimationFrame(run.raf);
      seek(run, t);
    },
    play: () => {
      run.frozen = false;
      run.anims.forEach((a) => a.play());
      loop(run);
    },
    pause: () => run.anims.forEach((a) => a.pause()),
    skip: () => skip(run),
    time: () => currentTime(run),
  };
}