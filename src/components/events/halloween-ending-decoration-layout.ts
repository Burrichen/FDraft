import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * Halloween's Event-ending scene — its own Designed Slot configuration
 * (see docs/updates, "EVENT SYSTEM — EVENT-OVER EXPERIENCE" §7/§8),
 * deliberately quieter than `HALLOWEEN_MODAL_DECORATION_LAYOUT`: every
 * slot's "nothing" weight is much higher, there's no bunting/candy-scatter
 * celebration piece anywhere, and every asset id it references (see
 * `halloween-decoration-registry.tsx`) reads as faded, empty, sparse, or
 * departing rather than festive — "the Halloween decorations should
 * visually feel like the party is over," never a re-skinned join modal.
 * Reuses the SAME slot names/renderer as every other Halloween surface
 * (`EventDecorationLayer`) — no new slot names were needed.
 */
export const HALLOWEEN_ENDING_DECORATION_LAYOUT: EventDecorationLayout = {
  "modal-top-left": {
    slot: "modal-top-left",
    visibleFrom: "base",
    variants: [
      { assetId: "cobweb-sparse", weight: 30 },
      { assetId: null, weight: 70 },
    ],
  },
  "modal-top-right": {
    slot: "modal-top-right",
    visibleFrom: "base",
    variants: [
      { assetId: "moon-clearing", weight: 45 },
      { assetId: null, weight: 55 },
    ],
  },
  "modal-bottom-left": {
    slot: "modal-bottom-left",
    visibleFrom: "base",
    variants: [
      { assetId: "pumpkin-faded", weight: 40, layer: "foreground" },
      { assetId: "candle-out", weight: 25, layer: "foreground" },
      { assetId: null, weight: 35 },
    ],
  },
  "modal-bottom-right": {
    slot: "modal-bottom-right",
    visibleFrom: "base",
    variants: [
      { assetId: "candy-bowl-empty", weight: 30, layer: "foreground" },
      { assetId: "ghost-departing", weight: 25, layer: "foreground" },
      { assetId: null, weight: 45 },
    ],
  },
  "top-edge": {
    slot: "top-edge",
    visibleFrom: "sm",
    variants: [
      { assetId: "bunting-fallen", weight: 35, layer: "mid" },
      { assetId: "leaf-fallen", weight: 25 },
      { assetId: null, weight: 40 },
    ],
  },
};

/** Coordinates within the ending dialog's own `relative` content area — the same positions the join modal uses, since it's the same dialog shell. */
export const HALLOWEEN_ENDING_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "modal-top-left": "absolute top-8 left-8 sm:top-10 sm:left-12",
  "modal-top-right": "absolute top-6 right-8 sm:top-8 sm:right-12",
  "modal-bottom-left": "absolute -bottom-2 left-4 sm:-bottom-3 sm:left-8",
  "modal-bottom-right": "absolute top-1/2 -right-2 -translate-y-1/2",
  "top-edge": "absolute inset-x-10 top-0 md:inset-x-16",
};
