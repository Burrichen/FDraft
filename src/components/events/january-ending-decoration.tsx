"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { F_YOU_ITS_JANUARY_EVENT_ID } from "@/domain/events/event-registry";
import { EventDecorationLayer } from "./event-decoration-layer";
import { JANUARY_DECORATION_REGISTRY } from "./january-decoration-registry";
import {
  JANUARY_ENDING_DECORATION_LAYOUT,
  JANUARY_ENDING_SLOT_POSITIONS,
} from "./january-ending-decoration-layout";

/**
 * The January Event-ending dialog's decoration (see docs/updates, "FDRAFT
 * UPDATE 1 — JANUARY EVENT-OVER EXPERIENCE" §3) — same generic Designed
 * Slot mechanism as `HalloweenEndingDecoration` (`EventDecorationLayer` +
 * `pickDecorationVariant`, stable for a session). Rendered by
 * `EventEndingDialog` via `EventVisualTheme.EndingDecorationComponent` —
 * a fully generic hook, so the dialog itself stays free of any per-event
 * branch.
 */
export function JanuaryEndingDecoration() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={JANUARY_ENDING_DECORATION_LAYOUT}
      positions={JANUARY_ENDING_SLOT_POSITIONS}
      registry={JANUARY_DECORATION_REGISTRY}
      seedInputs={{
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        layoutKey: "january-ending",
        profileId: activeProfile?.id ?? null,
      }}
      className="rounded-[inherit]"
    />
  );
}
