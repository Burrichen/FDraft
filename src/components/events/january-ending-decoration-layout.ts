import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * January's Event-ending scene — its own Designed Slot configuration (see
 * docs/updates, "FDRAFT UPDATE 1 — JANUARY EVENT-OVER EXPERIENCE" §3),
 * mirroring the same generic mechanism Halloween's ending already uses
 * (`halloween-ending-decoration-layout.ts`). Unlike Halloween's ending —
 * which fades OUT ("the party's over," mostly "nothing") — January's
 * ending is communicating a specific visual turn (the storm lifting), so
 * these three pieces favour actually appearing over a mostly-blank scene;
 * "nothing" is still a real, weighted possibility, just not the majority
 * one.
 */
export const JANUARY_ENDING_DECORATION_LAYOUT: EventDecorationLayout = {
  "modal-top-left": {
    slot: "modal-top-left",
    visibleFrom: "base",
    variants: [
      { assetId: "cloud-parting", weight: 70 },
      { assetId: null, weight: 30 },
    ],
  },
  "modal-top-right": {
    slot: "modal-top-right",
    visibleFrom: "base",
    variants: [
      { assetId: "soft-sun", weight: 70, layer: "background" },
      { assetId: null, weight: 30 },
    ],
  },
  "modal-bottom-right": {
    slot: "modal-bottom-right",
    visibleFrom: "sm",
    variants: [
      { assetId: "rain-fading", weight: 65 },
      { assetId: null, weight: 35 },
    ],
  },
};

/** Coordinates within the ending dialog's own `relative` content area. */
export const JANUARY_ENDING_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "modal-top-left": "absolute top-6 left-8 sm:top-8 sm:left-10",
  "modal-top-right": "absolute top-4 right-10 sm:top-6 sm:right-14",
  "modal-bottom-right": "absolute bottom-4 right-6",
};
