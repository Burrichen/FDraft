"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { CHRISTMAS_EVENT_ID } from "@/domain/events/event-registry";
import { CHRISTMAS_DECORATION_REGISTRY } from "./christmas-decoration-registry";
import {
  CHRISTMAS_ENDING_DECORATION_LAYOUT,
  CHRISTMAS_ENDING_SLOT_POSITIONS,
} from "./christmas-decoration-layout";
import { EventDecorationLayer } from "./event-decoration-layer";

/**
 * The FIRST Christmas ending modal's decoration (see docs/updates, "FDRAFT
 * UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §14) — same
 * generic Designed Slot mechanism as `HalloweenEndingDecoration` and
 * `JanuaryEndingDecoration`, rendered through
 * `EventVisualTheme.EndingDecorationComponent`.
 *
 * Deliberately quieter than the join modal's: one corner, small assets,
 * and nothing anywhere near the footer, so the deliberately un-themed
 * "Onto next year!" button (§15) stays visually clean. The SECOND stage
 * (the January stinger) has no decoration at all — stepping away from
 * Christmas is the point there.
 */
export function ChristmasEndingDecoration() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={CHRISTMAS_ENDING_DECORATION_LAYOUT}
      positions={CHRISTMAS_ENDING_SLOT_POSITIONS}
      registry={CHRISTMAS_DECORATION_REGISTRY}
      seedInputs={{
        eventId: CHRISTMAS_EVENT_ID,
        layoutKey: "christmas-ending",
        profileId: activeProfile?.id ?? null,
      }}
      className="rounded-[inherit]"
    />
  );
}
