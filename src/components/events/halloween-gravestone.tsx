"use client";

import { useState } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { cn } from "@/lib/utils";

const NON_SPOILER_LABEL = "Old gravestone";

/**
 * The gravestone easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §8, art-polished in "PROMPT B2.4 —
 * HALLOWEEN DECORATION + EASTER-EGG ART POLISH" §1) — an ordinary-looking
 * decorative gravestone that reveals the CURRENT PROFILE DISPLAY NAME after
 * a third click. Deliberately SESSION-ONLY: `clickCount` is plain
 * `useState`, never written to any profile setting, localStorage, or
 * IndexedDB, so a reload naturally resets it (a fresh component instance
 * starts at 0) — no explicit reset logic needed. Profile data is only ever
 * READ here (`activeProfile.displayName`), never mutated.
 *
 * The rules are unchanged from Prompt 20 — three clicks, session-only,
 * name read-only — only the artwork changed: a proper arched headstone
 * (ground mound, bevelled stone faces, an inset engraved border, static
 * hairline cracks, chipped corner notches) with a permanently-visible "R
 * I P" engraving up top, and a moss-and-grime patch covering the lower
 * plaque area that peels back click by click, revealing the name
 * underneath as an ENGRAVED inscription (a two-tone text-shadow bevel)
 * rather than small printed text along the bottom edge.
 *
 * The name is rendered as plain React text (never
 * `dangerouslySetInnerHTML` or any HTML/attribute interpolation), which is
 * what "sanitize/render the name safely" means in a React tree — there is
 * no injection surface to close here in the first place.
 */
export function HalloweenGravestone() {
  const { activeProfile } = useProfileContext();
  const [clickCount, setClickCount] = useState<0 | 1 | 2 | 3>(0);
  const [shaking, setShaking] = useState(false);
  const [chipFalling, setChipFalling] = useState(false);

  if (!activeProfile) {
    return null;
  }

  const revealed = clickCount >= 3;

  function handleClick() {
    const next = clickCount >= 3 ? 3 : ((clickCount + 1) as 1 | 2 | 3);
    setClickCount(next);
    setShaking(true);
    window.setTimeout(() => setShaking(false), 450);
    if (next === 3) {
      setChipFalling(true);
      window.setTimeout(() => setChipFalling(false), 750);
    }
  }

  const label = revealed ? activeProfile.displayName : NON_SPOILER_LABEL;
  // The moss/grime covering peels back one step per click, fully clearing
  // on the third — see the `<g>` below. Steeper than an even 3-way split
  // so the very first click already reads as a visible change (live QA on
  // docs/updates, "PROMPT B2.4" found 1.0→0.7 too subtle to notice).
  const mossOpacity =
    clickCount === 0 ? 1 : clickCount === 1 ? 0.5 : clickCount === 2 ? 0.15 : 0;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={revealed}
      aria-label={label}
      title={label}
      className={cn(
        "focus-visible:outline-ring group relative h-24 w-16 focus-visible:outline-2 focus-visible:outline-offset-2",
        shaking &&
          (clickCount >= 3
            ? "halloween-gravestone-shake-hard"
            : "halloween-gravestone-shake-soft"),
      )}
    >
      <svg
        viewBox="0 0 34 50"
        aria-hidden="true"
        className="absolute inset-0 size-full"
      >
        {/* Ground contact — a dark mound the stone's base sits into. */}
        <ellipse
          cx="17"
          cy="45.5"
          rx="15"
          ry="4"
          className="fill-halloween-charcoal/60"
        />

        {/* Stone body, with a lighter left bevel and a darker right bevel
            for visible thickness/depth. */}
        <path
          d="M4 44V18C4 8 9 4 17 4c8 0 13 4 13 14v26z"
          className="fill-halloween-charcoal-foreground/55"
        />
        <path
          d="M4 44V18C4 8 9 4 17 4c-5 1-9 5-9 14v26z"
          className="fill-halloween-cream/10"
        />
        <path
          d="M30 44V18c0-7-3-11-7-13 5 1 7 5 7 13v26z"
          className="fill-halloween-charcoal/45"
        />

        {/* Aged/chipped corner notches. */}
        <path d="M6 17.5l4-3 1 4.5z" className="fill-background" />
        <path d="M27.5 14.5l2.8 2-2 4z" className="fill-background" />

        {/* Engraved decorative border. */}
        <rect
          x="8"
          y="10"
          width="18"
          height="31"
          rx="2"
          className="stroke-halloween-cream/15 fill-none"
          strokeWidth={0.8}
        />

        {/* Permanently-visible engraving — decorative, gives the stone a
            "properly engraved" surface even before the secret is found. */}
        <text
          x="17"
          y="16.5"
          textAnchor="middle"
          className="fill-halloween-cream/35 font-serif text-[4.6px] tracking-[0.2em]"
        >
          R · I · P
        </text>

        {/* Subtle, static hairline cracks and chip scars — always present,
            "aged/weathered" rather than part of the reveal itself. */}
        <path
          d="M11 20l2.5 7-1.8 5.5"
          className="stroke-halloween-charcoal/40 fill-none"
          strokeWidth={0.6}
        />
        <path
          d="M23.5 30l-2.5 5.5"
          className="stroke-halloween-charcoal/30 fill-none"
          strokeWidth={0.5}
        />

        {/* Moss and grime hiding the plaque — peels back click by click. */}
        <g
          className="transition-opacity duration-500"
          style={{ opacity: mossOpacity }}
        >
          <path
            d="M9.5 25c-1 3.7 0 7.6 3 9.5 2 1.2 4 .3 5-1.7 1 2.8 4 3.8 6.7 2.6 2.8-1.2 3.7-4 2.7-6.6 2-.2 2.8-2.7 1-4.5-1.8-1.2-4.6 0-5.6 2-2-2.8-5.7-2.8-7.7-.7-1.8-1.8-3.7-1.4-5.1-.6z"
            className="fill-halloween-purple/35"
          />
          <circle
            cx="12.5"
            cy="28.5"
            r="1.3"
            className="fill-halloween-charcoal/50"
          />
          <circle
            cx="21.5"
            cy="33.5"
            r="1"
            className="fill-halloween-charcoal/40"
          />
          <circle
            cx="16.5"
            cy="31.5"
            r="0.9"
            className="fill-halloween-charcoal/40"
          />
        </g>

        {chipFalling ? (
          <path
            d="M20 28l4-3 2 3-4 3z"
            className="halloween-gravestone-chip text-halloween-charcoal-foreground/70"
            fill="currentColor"
          />
        ) : null}
      </svg>

      {/* The name, engraved into the now-clear plaque area — a two-tone
          text-shadow bevel stands in for a carved-in inscription. */}
      <span
        aria-hidden="true"
        style={{
          textShadow:
            "0 1px 0 rgba(255,255,255,0.15), 0 -1px 1px rgba(0,0,0,0.55)",
        }}
        className={cn(
          "absolute inset-x-1.5 top-[46%] flex max-h-[32%] items-center justify-center px-0.5 text-center text-[0.55rem] leading-tight font-semibold transition-opacity duration-500",
          revealed ? "text-halloween-cream opacity-100" : "opacity-0",
        )}
      >
        <span className="line-clamp-2 break-words">
          {revealed ? activeProfile.displayName : ""}
        </span>
      </span>
    </button>
  );
}
