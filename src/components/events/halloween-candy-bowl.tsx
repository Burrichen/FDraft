"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EventArtImage } from "./event-art-image";
import { HALLOWEEN_ART } from "./halloween-art";
import {
  HalloweenCandy,
  HalloweenLollipop,
  HalloweenWrappedCandy,
} from "./halloween-decorations";

const INITIAL_CANDY_COUNT = 8;
/**
 * Four bundled bowl-fill states (see docs/updates, "EVENT ART SYSTEM —
 * HALLOWEEN INTEGRATION" §4 — widens the previous three-state
 * full/partial/empty set from "HALLOWEEN ART DIRECTION & ASSET PASS" §6
 * with a genuine "low" state in between "medium" and "empty"): 6–8 is
 * `full`, 3–5 is `medium`, 1–2 is `low`, `0` is `empty` — a real lower
 * pile at each step, not just fewer floating icons over an unchanged
 * bowl.
 */
const LOW_THRESHOLD = 3;
const MEDIUM_THRESHOLD = 6;

/** Fixed, deterministic pile positions (never random per render). Candy
 * always occupies the FIRST `count` slots, so removing one always shrinks
 * the pile from the same corner rather than reshuffling every remaining
 * piece. Kept within the region both the full- and partial-pile artwork
 * actually draws candy into, so a piece never floats over bare bowl rim. */
const CANDY_SLOTS: Array<{ left: string; top: string; rotate: number }> = [
  { left: "50%", top: "20%", rotate: 8 },
  { left: "35%", top: "26%", rotate: -10 },
  { left: "65%", top: "25%", rotate: 12 },
  { left: "25%", top: "34%", rotate: -6 },
  { left: "75%", top: "33%", rotate: -14 },
  { left: "45%", top: "32%", rotate: 4 },
  { left: "58%", top: "38%", rotate: -4 },
  { left: "38%", top: "40%", rotate: 10 },
];

const CANDY_PIECES = [HalloweenCandy, HalloweenWrappedCandy, HalloweenLollipop];
const CANDY_TINTS = [
  "text-halloween-pumpkin",
  "text-halloween-purple",
  "text-halloween-cream",
];

/**
 * The candy bowl easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §10; redrawn as bundled art in
 * "HALLOWEEN ART DIRECTION & ASSET PASS" §6) — deliberately the ONLY
 * easter egg with NO persistence anywhere: plain `useState`, never a
 * profile setting, never localStorage, never IndexedDB. A route change
 * away and back, or a reload, creates a fresh component instance at
 * `INITIAL_CANDY_COUNT` — the reset is simply what a fresh mount already
 * does, no explicit reset code needed. Each click removes exactly one
 * candy with a small pop animation (reduced-motion-safe: the CSS rule
 * this relies on only exists inside `prefers-reduced-motion: no-
 * preference`, so removal is instant with no motion for those users).
 *
 * The bowl body itself is now one of four bundled illustrations —
 * full/medium/low/empty — genuinely showing a lower pile as candy is
 * taken, not just fewer icons floating over an unchanged outline; the
 * empty bowl stays visible with "You ate all of them." as separate
 * supporting text beside it, never standing in for the bowl itself.
 */
export function HalloweenCandyBowl() {
  const [count, setCount] = useState(INITIAL_CANDY_COUNT);

  const bowlArt =
    count === 0
      ? HALLOWEEN_ART.candyBowlEmpty
      : count < LOW_THRESHOLD
        ? HALLOWEEN_ART.candyBowlLow
        : count < MEDIUM_THRESHOLD
          ? HALLOWEEN_ART.candyBowlMedium
          : HALLOWEEN_ART.candyBowlFull;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative aspect-[200/130] w-32">
        <EventArtImage src={bowlArt} className="absolute inset-0 size-full" />

        {Array.from({ length: count }).map((_, index) => {
          const slot = CANDY_SLOTS[index % CANDY_SLOTS.length];
          const Piece = CANDY_PIECES[index % CANDY_PIECES.length];
          return (
            <button
              key={index}
              type="button"
              aria-label="Take a piece of candy"
              onClick={() => setCount((current) => Math.max(0, current - 1))}
              style={{
                left: slot.left,
                top: slot.top,
                transform: `translate(-50%, -50%) rotate(${slot.rotate}deg)`,
              }}
              className="focus-visible:outline-ring absolute rounded transition-transform focus-visible:outline-2 focus-visible:outline-offset-1 active:scale-75"
            >
              <Piece
                className={cn(
                  "size-3.5",
                  CANDY_TINTS[index % CANDY_TINTS.length],
                )}
              />
            </button>
          );
        })}
      </div>

      {count === 0 ? (
        <p className="text-halloween-cream/80 text-xs font-medium">
          You ate all of them.
        </p>
      ) : null}
    </div>
  );
}
