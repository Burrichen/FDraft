"use client";

import { useState } from "react";
import { HalloweenCandy } from "./halloween-decorations";

const INITIAL_CANDY_COUNT = 8;

/**
 * The candy bowl easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §10) — deliberately the ONLY
 * easter egg with NO persistence anywhere: plain `useState`, never a
 * profile setting, never localStorage, never IndexedDB. A route change
 * away and back, or a reload, creates a fresh component instance at
 * `INITIAL_CANDY_COUNT` — the reset is simply what a fresh mount already
 * does, no explicit reset code needed. Each click removes exactly one
 * candy with a small pop animation (reduced-motion-safe: the CSS rule
 * this relies on only exists inside `prefers-reduced-motion:
 * no-preference`, so removal is instant with no motion for those users).
 */
export function HalloweenCandyBowl() {
  const [count, setCount] = useState(INITIAL_CANDY_COUNT);

  return (
    <div className="border-halloween-purple/30 bg-halloween-purple/10 flex h-16 items-end justify-center gap-1 rounded-t-full border-b-0 px-4 pb-2">
      {count === 0 ? (
        <p className="text-halloween-cream/80 pb-2 text-xs font-medium">
          You ate all of them.
        </p>
      ) : (
        Array.from({ length: count }).map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label="Take a piece of candy"
            onClick={() => setCount((current) => Math.max(0, current - 1))}
            className="focus-visible:outline-ring rounded transition-transform focus-visible:outline-2 focus-visible:outline-offset-1 active:scale-75"
          >
            <HalloweenCandy className="size-4" />
          </button>
        ))
      )}
    </div>
  );
}
