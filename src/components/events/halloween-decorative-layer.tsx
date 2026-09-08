"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { EventDecorationLayer } from "./event-decoration-layer";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_HEADER_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_SLOT_POSITIONS,
} from "./halloween-decoration-layout";

/**
 * The Halloween Event page's central decorative layer — now a thin
 * wrapper around the generic Designed Slot renderer
 * (`EventDecorationLayer`) instead of a fixed, always-identical list of
 * hand-placed pieces (see docs/updates, "EVENT ART SYSTEM — DESIGNED
 * SLOTS + WEIGHTED VARIANTS", which supersedes the original composition
 * from "PROMPT 20"/"PROMPT B2.4"). What actually renders in each slot
 * (or whether anything does) is picked once per browser session per
 * `HALLOWEEN_PAGE_DECORATION_LAYOUT` — see that file's comment for the
 * exact weights — rather than being the same fixed cluster on every
 * single visit.
 *
 * Density still scales with viewport via each slot's own `visibleFrom`
 * (mobile keeps only the two corner webs; more slots activate at each
 * larger breakpoint, matching this app's `hidden sm:block` convention —
 * never fewer decorations on a wider screen). Positions are still FIXED
 * per slot (`HALLOWEEN_PAGE_SLOT_POSITIONS`), never randomized — only
 * WHICH asset appears in an already-designed spot varies.
 */
export function HalloweenDecorativeLayer() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={HALLOWEEN_PAGE_DECORATION_LAYOUT}
      positions={HALLOWEEN_PAGE_SLOT_POSITIONS}
      registry={HALLOWEEN_DECORATION_REGISTRY}
      seedInputs={{
        eventId: HALLOWEEN_EVENT_ID,
        layoutKey: "halloween-page",
        profileId: activeProfile?.id ?? null,
      }}
      className="-z-10"
    />
  );
}

/**
 * The mid-left `ghost-01` peek — scoped to whatever small, near-constant-
 * height element it's mounted inside (see `HALLOWEEN_HEADER_DECORATION_
 * LAYOUT`'s own comment for why this can't share `HalloweenDecorativeLayer`'s
 * whole-page-height container), so `HalloweenPageClient` wraps just its own
 * header block (heading + deadline text) in a `relative` div and mounts
 * this there — `top-1/2` then centres the ghost against the TITLE, not
 * against a Draft's own variable-length film grid further down the page.
 */
export function HalloweenGhostPeekLayer() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={HALLOWEEN_HEADER_DECORATION_LAYOUT}
      positions={HALLOWEEN_PAGE_SLOT_POSITIONS}
      registry={HALLOWEEN_DECORATION_REGISTRY}
      seedInputs={{
        eventId: HALLOWEEN_EVENT_ID,
        layoutKey: "halloween-page",
        profileId: activeProfile?.id ?? null,
      }}
      className="-z-10"
    />
  );
}
