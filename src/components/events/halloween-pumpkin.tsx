"use client";

import { toast } from "sonner";
import {
  nextHalloweenPumpkinState,
  resolveHalloweenPumpkinState,
  type HalloweenPumpkinState,
} from "@/domain/profiles/profile";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<HalloweenPumpkinState, string> = {
  uncarved: "Uncarved",
  carved: "Carved, unlit",
  lit: "Carved and lit",
  rotting: "Rotting",
};

/**
 * The pumpkin easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §9) — a single SVG whose face/glow
 * varies by state, persisted per-profile via
 * `ProfileSettings.halloweenPumpkinState` (see `profile.ts`) so it
 * survives app restarts, stays isolated between profiles (settings are
 * already keyed by `LocalProfile.id`), and round-trips through backup/
 * restore for free through the existing generic settings schema. Each
 * click advances `uncarved → carved → lit → rotting → uncarved`
 * (`nextHalloweenPumpkinState`, a pure domain function — this component
 * only calls it and persists the result).
 */
export function HalloweenPumpkin() {
  const { activeProfile, updateProfileSettings } = useProfileContext();

  if (!activeProfile) {
    return null;
  }

  const state = resolveHalloweenPumpkinState(
    activeProfile.settings.halloweenPumpkinState,
  );

  async function handleClick() {
    const next = nextHalloweenPumpkinState(state);
    try {
      await updateProfileSettings(activeProfile!.id, {
        halloweenPumpkinState: next,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save the pumpkin.",
      );
    }
  }

  const label = `Pumpkin: ${STATE_LABEL[state]} — click to advance to ${STATE_LABEL[nextHalloweenPumpkinState(state)]}`;

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label={label}
      title={label}
      className="focus-visible:outline-ring group relative size-16 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-20"
    >
      {state === "lit" ? (
        <span
          aria-hidden="true"
          className="bg-halloween-pumpkin absolute inset-2 rounded-full opacity-50 blur-lg transition-opacity"
        />
      ) : null}
      <svg
        viewBox="0 0 40 32"
        className={cn(
          "relative size-full transition-transform group-active:scale-95",
          state === "rotting" && "opacity-80 saturate-50",
        )}
        aria-hidden="true"
      >
        <path
          d="M4 20c0-9 6-13 8-13-1-3 1-5 3-5s2 2 1 4c1-1 3-2 4-2s3 1 4 2c-1-2-1-4 1-4s4 2 3 5c2 0 8 4 8 13 0 7-7 11-16 11S4 27 4 20z"
          className={cn(
            state === "uncarved"
              ? "fill-halloween-pumpkin/70"
              : "fill-halloween-pumpkin",
          )}
        />
        {state !== "uncarved" ? (
          <g
            className={cn(
              state === "lit"
                ? "fill-halloween-charcoal"
                : "fill-halloween-charcoal/80",
            )}
          >
            <path d="M13 17l3 4h-6z" />
            <path d="M27 17l3 4h-6z" />
            <path
              d={
                state === "rotting"
                  ? "M13 24c3 2 4 3 7 3s4-1 7-3c-1 3-4 5-7 5s-6-2-7-5z"
                  : "M13 23c2 2 4 3 7 3s5-1 7-3c-1 2-3 4-7 4s-6-2-7-4z"
              }
            />
          </g>
        ) : null}
      </svg>
    </button>
  );
}
