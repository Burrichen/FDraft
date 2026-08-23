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

/** The healthy body shape shared by `uncarved`/`carved`/`lit` — round,
 * dimensional, with visible vertical grooves (the `<path>` seam lines
 * drawn separately below) and a curled stem. */
const HEALTHY_BODY_PATH =
  "M4 20c0-9 6-13 8-13-1-3 1-5 3-5s2 2 1 4c1-1 3-2 4-2s3 1 4 2c-1-2-1-4 1-4s4 2 3 5c2 0 8 4 8 13 0 7-7 11-16 11S4 27 4 20z";

/** A visibly collapsed, sagging, decayed body — a genuinely distinct
 * silhouette from the healthy one (see docs/updates, "PROMPT B2.4 —
 * HALLOWEEN DECORATION + EASTER-EGG ART POLISH" §2: "the current rotten
 * state is not rotten enough... collapsed/sagging shape"), not just a
 * filter over the healthy shape — one side has slumped lower than the
 * other and the top-left has a soft, caved-in dent (a "slight missing
 * section"). */
const ROTTING_BODY_PATH =
  "M4 22c-1-8 5-11 7-11-1-3 2-4 3-3 0-1 2-2 3-1-1 2 2 1 3 0 1-1 3 0 3 2 1-2 4-2 5 1-1-1-2 0-2 1 1-1 3-1 4 1 3 1 7 5 6 12-1 6-6 9-14 10-9 1-17-3-18-12z";

/**
 * The pumpkin easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §9, art-polished in "PROMPT B2.4"
 * §2) — a single SVG whose shape/face/glow varies by state, persisted
 * per-profile via `ProfileSettings.halloweenPumpkinState` (see
 * `profile.ts`) so it survives app restarts, stays isolated between
 * profiles (settings are already keyed by `LocalProfile.id`), and
 * round-trips through backup/restore for free through the existing
 * generic settings schema. Each click advances
 * `uncarved → carved → lit → rotting → uncarved`
 * (`nextHalloweenPumpkinState`, a pure domain function — this component
 * only calls it and persists the result); none of that state machine
 * changed in the art-polish pass, only how each state is drawn.
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

  const isRotting = state === "rotting";
  // Every non-uncarved state has a carved face — including rotting's own
  // uneven/asymmetric one below. A prior version of this condition
  // accidentally excluded "rotting", leaving it with no face at all; see
  // docs/updates, "PROMPT B2.4 — HALLOWEEN DECORATION + EASTER-EGG ART
  // POLISH" §2, live QA finding.
  const isCarvedFace = state === "carved" || state === "lit" || isRotting;

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
        viewBox="0 0 40 34"
        className={cn(
          "relative size-full transition-transform group-active:scale-95",
          isRotting && "saturate-[0.65]",
        )}
        aria-hidden="true"
      >
        {/* Grounding shadow — every state, for a dimensional "sitting on a
            surface" read rather than a flat floating disc. */}
        <ellipse
          cx="20"
          cy="31"
          rx="13"
          ry="2"
          className="fill-halloween-charcoal/40"
        />

        {/* Stem — sturdy and curled when healthy, thin/bent/shrivelled once
            rotting. */}
        {isRotting ? (
          <path
            d="M19 8c0-2 2-4 1-6"
            className="stroke-halloween-rot fill-none"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M19 7c-.5-2.5 1-4.5 3-5"
            className="stroke-halloween-stem fill-none"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        )}

        <path
          d={isRotting ? ROTTING_BODY_PATH : HEALTHY_BODY_PATH}
          className={cn(
            state === "uncarved"
              ? "fill-halloween-pumpkin/70"
              : isRotting
                ? "fill-halloween-pumpkin/60"
                : "fill-halloween-pumpkin",
          )}
        />

        {/* Vertical ridges/grooves for dimensional shape — even, gentle
            curves when healthy; uneven and closer together once collapsed. */}
        <g
          className="stroke-halloween-charcoal/25 fill-none"
          strokeWidth={0.8}
          strokeLinecap="round"
        >
          {isRotting ? (
            <>
              <path d="M13 12c-2 4-2 9 1 15" />
              <path d="M20 10c-1 5 0 11 -1 16" />
              <path d="M27 12c2 3 3 8 0 14" />
            </>
          ) : (
            <>
              <path d="M12 9c-2 4-2 12 0 18" />
              <path d="M20 8v20" />
              <path d="M28 9c2 4 2 12 0 18" />
            </>
          )}
        </g>

        {isRotting ? (
          <g>
            {/* Discolouration blotches and mould spots — obviously decayed,
                never gory. */}
            <path
              d="M8 18c-1 3 1 6 4 6s4-3 2-6-5-3-6 0z"
              className="fill-halloween-rot/70"
            />
            <path
              d="M27 21c2 2 5 1 6-2s-2-5-4-4-3 4-2 6z"
              className="fill-halloween-rot/60"
            />
            <circle
              cx="16"
              cy="24"
              r="1.1"
              className="fill-halloween-mould/70"
            />
            <circle
              cx="24"
              cy="15"
              r="0.9"
              className="fill-halloween-mould/60"
            />
            <circle
              cx="12"
              cy="14"
              r="0.8"
              className="fill-halloween-mould/60"
            />
          </g>
        ) : null}

        {isCarvedFace ? (
          <g
            className={cn(
              state === "lit"
                ? "fill-halloween-glow"
                : "fill-halloween-charcoal/85",
            )}
          >
            {isRotting ? (
              <>
                {/* Uneven, asymmetric carved features — one eye lower and
                    larger than the other, a wavy mouth with a gap where a
                    soft section has given way. */}
                <path d="M12 18l4 5-6 1z" />
                <path d="M26 16.5l4.5 3.5-5.5 2z" />
                <path
                  d="M12 25c2 2 3 3 5 3.4M21 28c2-.2 4-1.6 6-3.6"
                  className="stroke-halloween-charcoal/85 fill-none"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <path d="M13 17l3 4h-6z" />
                <path d="M27 17l3 4h-6z" />
                <path d="M13 23c2 2 4 3 7 3s5-1 7-3c-1 2-3 4-7 4s-6-2-7-4z" />
              </>
            )}
          </g>
        ) : null}
      </svg>
    </button>
  );
}
