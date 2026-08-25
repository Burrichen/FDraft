import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * The Designed Slot configuration for Halloween's APP-WIDE ambient
 * dressing (see docs/updates, "EVENT ART SYSTEM — HALLOWEEN INTEGRATION"
 * §6) — shown on every OTHER page (Watchlist, Drafts, Stats, Settings,
 * ...) once a profile has opted into Halloween with visuals on; see
 * `halloween-ambient-decorations.tsx` for the actual visibility gating,
 * unchanged by this phase. Deliberately just 4 slots, each a single,
 * always-the-same pick (`weight: 1`, one option) — restrained is the
 * whole point here ("do not turn every page into a full Halloween
 * illustration"; "keep the Halloween page as the most richly decorated
 * surface"), so this reuses the exact same 4 pieces and positions the
 * pre-slot-system version already used, just through the shared engine
 * instead of hand-placed `<div>`s. `scale` tweaks bring each registry
 * entry's own page-layer-sized base down to this surface's smaller,
 * subtler footprint.
 */
export const HALLOWEEN_AMBIENT_DECORATION_LAYOUT: EventDecorationLayout = {
  "edge-peek-right": {
    slot: "edge-peek-right",
    visibleFrom: "sm",
    variants: [{ assetId: "cobweb", weight: 1, opacity: 0.4, scale: 0.7 }],
  },
  "header-right": {
    slot: "header-right",
    visibleFrom: "sm",
    variants: [{ assetId: "bat", weight: 1, opacity: 0.5, scale: 0.83 }],
  },
  "lower-left": {
    slot: "lower-left",
    visibleFrom: "lg",
    variants: [
      { assetId: "tiny-pumpkin", weight: 1, opacity: 0.4, scale: 0.83 },
    ],
  },
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
 * Positioned below the sticky header (`top-20`/`top-28`, clearing the
 * header's own `h-16`) — the pre-slot-system version found `top-0`
 * rendered nearly invisible, bleeding through the header's translucent
 * backdrop-blur at a fraction of its real opacity.
 */
export const HALLOWEEN_AMBIENT_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "edge-peek-right": "absolute top-20 right-0",
  "header-right": "absolute top-28 right-20",
  "lower-left": "absolute bottom-6 left-6",
  "lower-right": "absolute right-12 bottom-10",
};
