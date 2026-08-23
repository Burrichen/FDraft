"use client";

import { useState } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { cn } from "@/lib/utils";

const NON_SPOILER_LABEL = "Old gravestone";

/**
 * The gravestone easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §8) — an ordinary-looking decorative
 * gravestone that reveals the CURRENT PROFILE DISPLAY NAME after a third
 * click. Deliberately SESSION-ONLY: `clickCount` is plain `useState`,
 * never written to any profile setting, localStorage, or IndexedDB, so a
 * reload naturally resets it (a fresh component instance starts at 0) —
 * no explicit reset logic needed. Profile data is only ever READ here
 * (`activeProfile.displayName`), never mutated.
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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={revealed}
      aria-label={label}
      title={label}
      className={cn(
        "focus-visible:outline-ring group relative flex h-20 w-14 flex-col items-center justify-end rounded-t-full pb-1 focus-visible:outline-2 focus-visible:outline-offset-2",
        shaking &&
          (clickCount >= 3
            ? "halloween-gravestone-shake-hard"
            : "halloween-gravestone-shake-soft"),
      )}
    >
      <svg
        viewBox="0 0 28 40"
        aria-hidden="true"
        className="text-halloween-charcoal-foreground/60 absolute inset-0 size-full"
      >
        <path
          d="M2 38V16C2 7 7 2 14 2s12 5 12 14v22z"
          fill="currentColor"
          stroke="var(--halloween-cream)"
          strokeOpacity={0.15}
        />
        {chipFalling ? (
          <path
            d="M4 14l4-3 2 3-3 3z"
            fill="currentColor"
            className="halloween-gravestone-chip"
          />
        ) : null}
      </svg>
      <span
        className={cn(
          "relative max-w-[3.25rem] truncate px-1 text-[0.6rem] font-medium transition-opacity duration-500",
          revealed
            ? "text-halloween-cream opacity-100"
            : "text-halloween-cream/0 opacity-0",
        )}
      >
        {revealed ? activeProfile.displayName : ""}
      </span>
    </button>
  );
}
