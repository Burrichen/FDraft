"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { EventDecorationLayer } from "./event-decoration-layer";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_ENDING_DECORATION_LAYOUT,
  HALLOWEEN_ENDING_SLOT_POSITIONS,
} from "./halloween-ending-decoration-layout";

/**
 * The Event-ending dialog's decoration — same generic Designed Slot
 * mechanism as `HalloweenDialogDecoration` (`EventDecorationLayer` +
 * `pickDecorationVariant`, stable for a session, never rerolled on a
 * rerender), pointed at the ending's own quieter layout instead of the
 * join modal's. Rendered by `EventEndingDialog` via `EventVisualTheme.
 * EndingDecorationComponent` — a fully generic hook, so the dialog itself
 * stays free of any per-event branch. A distinct `layoutKey` from the
 * join modal's (`"halloween-ending"` vs `"halloween-modal"`) means the two
 * surfaces pick independently, even for the same profile/session — an
 * ending shown right after a join in the same session doesn't echo
 * whatever the join modal happened to pick.
 */
export function HalloweenEndingDecoration() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={HALLOWEEN_ENDING_DECORATION_LAYOUT}
      positions={HALLOWEEN_ENDING_SLOT_POSITIONS}
      registry={HALLOWEEN_DECORATION_REGISTRY}
      seedInputs={{
        eventId: HALLOWEEN_EVENT_ID,
        layoutKey: "halloween-ending",
        profileId: activeProfile?.id ?? null,
      }}
      className="rounded-[inherit]"
    />
  );
}
