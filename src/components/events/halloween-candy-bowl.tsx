"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HalloweenCandy, HalloweenLollipop } from "./halloween-decorations";

const INITIAL_CANDY_COUNT = 8;

/** Fixed, deterministic pile positions (never random per render — see
 * docs/updates, "PROMPT B2.4 — HALLOWEEN DECORATION + EASTER-EGG ART
 * POLISH" §6: "avoid random decoration jumping"). Candy always occupies
 * the FIRST `count` slots, so removing one always shrinks the pile from
 * the same corner rather than reshuffling every remaining piece. */
const CANDY_SLOTS: Array<{ left: string; top: string; rotate: number }> = [
  { left: "50%", top: "10%", rotate: 8 },
  { left: "34%", top: "20%", rotate: -10 },
  { left: "62%", top: "18%", rotate: 12 },
  { left: "22%", top: "36%", rotate: -6 },
  { left: "76%", top: "34%", rotate: -14 },
  { left: "44%", top: "32%", rotate: 4 },
  { left: "58%", top: "44%", rotate: -4 },
  { left: "37%", top: "46%", rotate: 10 },
];

const CANDY_TINTS = [
  "text-halloween-pumpkin",
  "text-halloween-purple",
  "text-halloween-cream",
];

/**
 * The candy bowl easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §10, art-polished in "PROMPT B2.4"
 * §3) — deliberately the ONLY easter egg with NO persistence anywhere:
 * plain `useState`, never a profile setting, never localStorage, never
 * IndexedDB. A route change away and back, or a reload, creates a fresh
 * component instance at `INITIAL_CANDY_COUNT` — the reset is simply what a
 * fresh mount already does, no explicit reset code needed. Each click
 * removes exactly one candy with a small pop animation (reduced-motion-
 * safe: the CSS rule this relies on only exists inside
 * `prefers-reduced-motion: no-preference`, so removal is instant with no
 * motion for those users).
 *
 * Now a real bowl silhouette (visible rim, body, interior shadow) with
 * candy visibly piled INSIDE it, rather than sweets sitting in a plain
 * flex row — the bowl itself stays visible and empty once every candy is
 * gone, with "You ate all of them." as separate supporting text beside it.
 */
export function HalloweenCandyBowl() {
  const [count, setCount] = useState(INITIAL_CANDY_COUNT);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-20 w-32">
        <svg
          viewBox="0 0 100 60"
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 size-full"
        >
          <path
            d="M8 16C8 9 92 9 92 16L83 50C83 56 17 56 17 50Z"
            className="fill-halloween-charcoal-foreground/12 stroke-halloween-cream/20"
            strokeWidth={1}
          />
          <ellipse
            cx="50"
            cy="17"
            rx="40"
            ry="8"
            className="fill-halloween-charcoal/50"
          />
          <ellipse
            cx="50"
            cy="16"
            rx="40"
            ry="7.5"
            className="stroke-halloween-cream/35 fill-none"
            strokeWidth={1.2}
          />
        </svg>

        {Array.from({ length: count }).map((_, index) => {
          const slot = CANDY_SLOTS[index % CANDY_SLOTS.length];
          const Piece = index % 2 === 0 ? HalloweenCandy : HalloweenLollipop;
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
