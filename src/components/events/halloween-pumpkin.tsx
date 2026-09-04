"use client";

import { toast } from "sonner";
import {
  nextHalloweenPumpkinState,
  resolveHalloweenPumpkinState,
  type HalloweenPumpkinState,
} from "@/domain/profiles/profile";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { EventArtImage } from "./event-art-image";
import { HALLOWEEN_ART } from "./halloween-art";

const STATE_LABEL: Record<HalloweenPumpkinState, string> = {
  uncarved: "Uncarved",
  carved: "Carved, unlit",
  lit: "Carved and lit",
  rotting: "Rotting",
};

/**
 * Each state's illustration is a separate bundled file (see docs/updates,
 * "HALLOWEEN ART DIRECTION & ASSET PASS" §2/§5) rather than one SVG with
 * conditional paths — a real, hand-drawn body/face/decay per state
 * (dimensional shading, a genuine brown/green rot tint and mould spotting
 * for `rotting`, a baked-in warm glow for `lit`), swapped by plain `<img
 * src>` change. Nothing here needs to know how any of them are drawn.
 */
const STATE_ART: Record<HalloweenPumpkinState, string> = {
  uncarved: HALLOWEEN_ART.pumpkinUncarved,
  carved: HALLOWEEN_ART.pumpkinCarved,
  lit: HALLOWEEN_ART.pumpkinLit,
  rotting: HALLOWEEN_ART.pumpkinRotting,
};

/**
 * The pumpkin easter egg (see docs/updates, "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI + APPROVED EASTER EGGS" §9; redrawn as bundled art in
 * "HALLOWEEN ART DIRECTION & ASSET PASS" §5) — persisted per-profile via
 * `ProfileSettings.halloweenPumpkinState` (see `profile.ts`), so it
 * survives app restarts, stays isolated between profiles, and round-trips
 * through backup/restore for free through the existing generic settings
 * schema. Each click advances
 * `uncarved → carved → lit → rotting → uncarved`
 * (`nextHalloweenPumpkinState`, a pure domain function — this component
 * only calls it and persists the result); none of that state machine
 * changed in this art pass, only how each state is drawn.
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
      className="focus-visible:outline-ring group relative size-16 focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-20"
    >
      <EventArtImage
        src={STATE_ART[state]}
        className="size-full object-contain transition-transform motion-safe:group-active:scale-95"
      />
    </button>
  );
}
