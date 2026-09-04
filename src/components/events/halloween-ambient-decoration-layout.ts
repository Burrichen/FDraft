import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * The Designed Slot configuration for Halloween's APP-WIDE ambient
 * dressing (see docs/updates, "HALLOWEEN VISUAL/LAYOUT REPAIR" §1) —
 * shown on every OTHER page (Watchlist, Drafts, Stats, Settings, ...) once
 * a profile has opted into Halloween with visuals on; see
 * `halloween-ambient-decorations.tsx` for the actual visibility gating,
 * unchanged by this phase.
 *
 * Deliberately down to exactly ONE slot/piece now — a single ghost, always
 * the same pick (`weight: 1`, one option). The previous 4-piece set
 * (cobweb, bat, tiny-pumpkin, ghost) read as scattered decorative fragments
 * on otherwise-normal pages; "keep the Halloween page as the most richly
 * decorated surface" now means EVERY other page gets only the one quiet
 * ghost, nothing more.
 */
export const HALLOWEEN_AMBIENT_DECORATION_LAYOUT: EventDecorationLayout = {
  "lower-right": {
    slot: "lower-right",
    visibleFrom: "lg",
    variants: [{ assetId: "ghost-2", weight: 1, opacity: 0.4, scale: 0.88 }],
  },
};

/**
 * Coordinates for the app-wide ambient surface — a `fixed` viewport
 * overlay (see `HalloweenAmbientDecorations`'s own root `className`),
 * not the Event page's own `relative` content area, so these positions
 * are independent of the page-layer's `HALLOWEEN_PAGE_SLOT_POSITIONS`.
 * Positioned below the sticky header (`top-20`, clearing the header's own
 * `h-16`) — the pre-slot-system version found `top-0` rendered nearly
 * invisible, bleeding through the header's translucent backdrop-blur at a
 * fraction of its real opacity.
 */
export const HALLOWEEN_AMBIENT_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "lower-right": "absolute right-12 bottom-10",
};
