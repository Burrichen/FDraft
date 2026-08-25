"use client";

import { useState } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { cn } from "@/lib/utils";
import { EventArtImage } from "./event-art-image";
import { HALLOWEEN_ART } from "./halloween-art";

const NON_SPOILER_LABEL = "Old gravestone";

/**
 * The gravestone easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §8; redrawn as bundled art in
 * "HALLOWEEN ART DIRECTION & ASSET PASS" §4) — an ordinary-looking
 * decorative gravestone that reveals the CURRENT PROFILE DISPLAY NAME
 * after a third click. Deliberately SESSION-ONLY: `clickCount` is plain
 * `useState`, never written to any profile setting, localStorage, or
 * IndexedDB, so a reload naturally resets it (a fresh component instance
 * starts at 0) — no explicit reset logic needed. Profile data is only
 * ever READ here (`activeProfile.displayName`), never mutated.
 *
 * The rules are unchanged — three clicks, session-only, name read-only —
 * only the artwork changed: `gravestone-clean.svg` (the always-present
 * base: arched stone, bevelled faces, a chipped corner, hairline cracks,
 * a permanently-engraved "R·I·P", and a blank recessed plaque) sits
 * underneath `gravestone-plain.svg` (an identical stone with a moss patch
 * painted over that same plaque), which fades out click by click — the
 * clean stone's blank plaque is what the profile name is overlaid onto,
 * styled as an inset carved inscription rather than printed UI text.
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
  // The moss covering peels back one step per click, fully clearing on
  // the third — steeper than an even 3-way split so the very first click
  // already reads as a visible change.
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
        "focus-visible:outline-ring group relative aspect-[7/10] h-28 focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-32",
        shaking &&
          (clickCount >= 3
            ? "halloween-gravestone-shake-hard"
            : "halloween-gravestone-shake-soft"),
      )}
    >
      <EventArtImage
        src={HALLOWEEN_ART.gravestoneClean}
        className="absolute inset-0 size-full"
      />
      <EventArtImage
        src={HALLOWEEN_ART.gravestonePlain}
        style={{ opacity: mossOpacity }}
        className="absolute inset-0 size-full transition-opacity duration-500"
      />

      {chipFalling ? (
        <svg
          viewBox="0 0 12 10"
          aria-hidden="true"
          className="halloween-gravestone-chip absolute top-[18%] right-[14%] size-4"
        >
          <path
            d="M1 6l5-5 5 3-4 5z"
            className="fill-halloween-charcoal-foreground/70"
          />
        </svg>
      ) : null}

      {/* The name, engraved into the now-clear plaque area. Colored close
          to the stone itself (a groove cut INTO the material reads
          nothing like printed text) with a dark shadow toward the
          upper-left and a faint light catch toward the lower-right — the
          same light-direction convention the stone's own bevel shading
          uses — so it reads as a carved recess, not a UI label. */}
      <span
        aria-hidden="true"
        style={{
          color: "oklch(0.4 0.01 290)",
          textShadow:
            "-1px -1px 1px oklch(0.1 0.01 290 / 65%), 1px 1px 1px oklch(0.85 0.02 290 / 45%)",
        }}
        className={cn(
          "absolute inset-x-[27%] top-[44%] bottom-[22%] flex items-center justify-center px-0.5 text-center font-serif text-[0.62rem] leading-tight font-bold tracking-wide transition-opacity duration-500 sm:text-xs",
          revealed ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="line-clamp-3 break-words">
          {revealed ? activeProfile.displayName : ""}
        </span>
      </span>
    </button>
  );
}
