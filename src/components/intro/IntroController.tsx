"use client";

import { useEffect } from "react";
import { site } from "@/content/site";
import { REPLAY_EVENT } from "./ReplayButton";

const forcedIntro = () => /[?&]intro=(1|force|debug)/.test(location.search);

/**
 * Boots the intro when the gate script decided it should play, wires up replay, and
 * renders the "Skip intro" button (visible only while the intro is pending or running).
 * The engine is loaded on demand, so visitors who never see the intro never download it.
 * Before the engine takes over, the gate script itself handles Skip clicks and Esc.
 */
export default function IntroController() {
  useEffect(() => {
    let cancelled = false;
    let handle: { destroy: () => void } | null = null;
    const d = document.documentElement;

    const play = async (replay: boolean) => {
      const { playIntro } = await import("@/lib/intro/player");
      if (cancelled) return;
      handle = await playIntro({ replay });
    };

    if (d.getAttribute("data-intro") === "pending") void play(false);

    const onReplay = () => {
      if (!site.intro.enabled || window.matchMedia("(forced-colors: active)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && !forcedIntro()) {
        // Replay the quiet version: restart the CSS fade-in cascade.
        window.scrollTo({ top: 0 });
        d.setAttribute("data-intro", "skip");
        void d.offsetWidth;
        d.setAttribute("data-intro", "reduced");
        return;
      }
      void play(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => {
      cancelled = true;
      window.removeEventListener(REPLAY_EVENT, onReplay);
      handle?.destroy();
    };
  }, []);

  return (
    <button
      type="button"
      className="intro-skip t-label"
      onClick={() => window.dispatchEvent(new Event("intro:skip"))}
    >
      Skip intro<span className="kbd-hint" aria-hidden> · Esc</span>
      <span className="intro-skip-progress" aria-hidden />
    </button>
  );
}