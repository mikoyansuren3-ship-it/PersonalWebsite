"use client";

import { RotateCcw } from "lucide-react";
import { site } from "@/content/site";
import { cn } from "@/lib/utils";

export const REPLAY_EVENT = "intro:replay";

/** Replays the intro animation. Rendered in the hero and the footer. */
export default function ReplayButton({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "text";
  className?: string;
}) {
  if (!site.intro.enabled) return null;
  const replay = () => window.dispatchEvent(new Event(REPLAY_EVENT));

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={replay}
        data-intro-replay=""
        className={cn("link inline-flex items-center gap-1.5", className)}
      >
        Replay intro
        <RotateCcw aria-hidden className="size-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={replay}
      aria-label="Replay intro"
      title="Replay intro"
      data-intro-replay=""
      className={cn("btn btn-icon", className)}
    >
      <RotateCcw aria-hidden />
    </button>
  );
}