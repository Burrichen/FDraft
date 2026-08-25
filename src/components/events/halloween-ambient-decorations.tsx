"use client";

import { usePathname } from "next/navigation";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  getEventDefinition,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { EventDecorationLayer } from "./event-decoration-layer";
import {
  HALLOWEEN_AMBIENT_DECORATION_LAYOUT,
  HALLOWEEN_AMBIENT_SLOT_POSITIONS,
} from "./halloween-ambient-decoration-layout";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";

/**
 * App-wide Halloween ambient dressing (see docs/updates, "PROMPT B2.4 —
 * HALLOWEEN DECORATION + EASTER-EGG ART POLISH" §7-8) — mounted once by
 * `AppShell`, shown on every OTHER page once a profile is opted into
 * Halloween with visuals turned on. Deliberately much sparser than the
 * Event page's own `HalloweenDecorativeLayer`: "Keep Event-page intensity
 * highest... Other pages may receive: small bats; web corner; subtle
 * pumpkin; ghost peeking somewhere." — never a Christmas-tree-ing of every
 * normal page, and never anything on mobile (§8: "minimal").
 *
 * Deliberately excludes the Halloween page itself (which already renders
 * its own, denser layer) so the two never stack into a doubled-up mess.
 *
 * Reads the shared `EventDiscoveryProvider` snapshot (see docs/updates,
 * "EVENT LIFECYCLE REPAIR" §4) instead of its own independent
 * `EventSettings` fetch — the previous version's own separate `useAsyncData`
 * call was exactly the kind of uncoordinated, never-invalidated read that
 * caused the nav tab's own stale-after-joining bug elsewhere; this is
 * "joined AND currently available," not the old, now-removed
 * `activeEvent === HALLOWEEN_EVENT_ID` check.
 */
export function useHalloweenAmbientVisible(): boolean {
  const pathname = usePathname();
  const { result } = useEventDiscovery();
  const halloweenRoute = getEventDefinition(HALLOWEEN_EVENT_ID)?.page?.route;

  if (halloweenRoute && pathname?.startsWith(halloweenRoute)) {
    return false;
  }

  const halloweenStatus = result.statuses.find(
    (status) => status.event.id === HALLOWEEN_EVENT_ID,
  );
  return Boolean(
    result.eventVisualsEnabled &&
    halloweenStatus &&
    isOccurrenceActiveNow(halloweenStatus),
  );
}

/**
 * Now a thin wrapper around the generic Designed Slot renderer (see
 * docs/updates, "EVENT ART SYSTEM — HALLOWEEN INTEGRATION" §1/§6/§7) —
 * `HALLOWEEN_AMBIENT_DECORATION_LAYOUT` reuses the exact same 4 pieces
 * and positions the original hand-placed version rendered, so this stays
 * visually restrained and unchanged; only the mechanism moved onto the
 * shared asset-pack/slot engine every other Halloween surface now uses.
 */
export function HalloweenAmbientDecorations() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={HALLOWEEN_AMBIENT_DECORATION_LAYOUT}
      positions={HALLOWEEN_AMBIENT_SLOT_POSITIONS}
      registry={HALLOWEEN_DECORATION_REGISTRY}
      seedInputs={{
        eventId: HALLOWEEN_EVENT_ID,
        layoutKey: "halloween-ambient",
        profileId: activeProfile?.id ?? null,
      }}
      className="fixed -z-10"
    />
  );
}
