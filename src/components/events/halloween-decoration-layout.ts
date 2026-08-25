import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * Halloween's real Designed Slot configuration (see docs/updates, "EVENT
 * ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS" §7) — replaces the
 * previous versions of `halloween-decorative-layer.tsx` and
 * `halloween-dialog-decoration.tsx`, which always rendered the exact same
 * fixed set of pieces at fixed positions every time. Every asset id
 * referenced below must exist in `HALLOWEEN_DECORATION_REGISTRY`
 * (`halloween-decoration-registry.tsx`) — this file only says WHERE and
 * HOW OFTEN, never WHAT something looks like.
 *
 * A few of the task's own example picks don't correspond to real,
 * already-existing artwork and were substituted for genuine pieces
 * instead of inventing new illustrations this phase was never asked to
 * draw:
 *  - "cat-2" (no cat artwork exists anywhere in this project) → the
 *    existing `tiny-pumpkin`/`ghost-2` pieces fill that variety instead.
 *  - "gravestone" as an ambient decoration option was deliberately left
 *    out — this app already has exactly ONE interactive gravestone
 *    easter egg (`HalloweenGravestone`) placed on the page; letting a
 *    slot ALSO randomly place a second, non-interactive gravestone
 *    look-alike would read as a duplicate/broken easter egg, not a
 *    decoration. `leaf`/`skull` fill that slot's variety instead.
 *
 * Weights are plain relative numbers, not required to sum to 100 (see
 * `pickDecorationVariant`) — written as round numbers here purely for
 * human readability when skimming this file.
 */
export const HALLOWEEN_PAGE_DECORATION_LAYOUT: EventDecorationLayout = {
  "header-right": {
    slot: "header-right",
    visibleFrom: "sm",
    variants: [
      { assetId: "moon", weight: 45 },
      { assetId: "moon-and-bats", weight: 35 },
      { assetId: null, weight: 20 },
    ],
  },
  "top-edge": {
    slot: "top-edge",
    visibleFrom: "lg",
    variants: [
      { assetId: "bunting", weight: 60, layer: "mid" },
      { assetId: null, weight: 40 },
    ],
  },
  "mid-left": {
    slot: "mid-left",
    visibleFrom: "xl",
    variants: [
      { assetId: "candle", weight: 50 },
      { assetId: "skull", weight: 30, opacity: 0.7 },
      { assetId: null, weight: 20 },
    ],
  },
  "mid-right": {
    slot: "mid-right",
    visibleFrom: "lg",
    variants: [
      { assetId: "ghost-1", weight: 30, opacity: 0.9 },
      { assetId: "ghost-2", weight: 25, opacity: 0.85 },
      { assetId: "tiny-pumpkin", weight: 20 },
      { assetId: null, weight: 25 },
    ],
  },
  "lower-left": {
    slot: "lower-left",
    visibleFrom: "lg",
    variants: [
      { assetId: "leaf", weight: 50, opacity: 0.7 },
      { assetId: "skull", weight: 20, opacity: 0.6 },
      { assetId: null, weight: 30 },
    ],
  },
  "lower-right": {
    slot: "lower-right",
    visibleFrom: "lg",
    variants: [
      { assetId: "candy-scatter", weight: 40, layer: "foreground" },
      { assetId: "pumpkin-cluster", weight: 35 },
      { assetId: "ghost-2", weight: 25 },
    ],
  },
  "edge-peek-left": {
    slot: "edge-peek-left",
    visibleFrom: "base",
    variants: [{ assetId: "cobweb", weight: 1, opacity: 0.6 }],
  },
  "edge-peek-right": {
    slot: "edge-peek-right",
    visibleFrom: "base",
    variants: [{ assetId: "cobweb-mirrored", weight: 1, opacity: 0.6 }],
  },
};

/**
 * Coordinates for the Event page's own decorative layer — deliberately
 * right/lower-margin heavy past the two corner webs (see the previous
 * version's own doc comment, preserved in spirit): the page's real
 * content column is left-aligned, so genuine empty space sits to the
 * right of and below it at wide viewports.
 */
export const HALLOWEEN_PAGE_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "header-right": "absolute top-4 right-16",
  "top-edge": "absolute top-2 right-6",
  "mid-left": "absolute top-[58%] left-6",
  "mid-right": "absolute top-1/2 right-10",
  "lower-left": "absolute bottom-8 left-10",
  "lower-right": "absolute right-12 bottom-16",
  "edge-peek-left": "absolute top-0 left-0",
  "edge-peek-right": "absolute top-0 right-0 -scale-x-100",
};

export const HALLOWEEN_MODAL_DECORATION_LAYOUT: EventDecorationLayout = {
  "modal-top-left": {
    slot: "modal-top-left",
    visibleFrom: "base",
    variants: [
      { assetId: "bat", weight: 40 },
      { assetId: "cobweb", weight: 35, opacity: 0.7 },
      { assetId: null, weight: 25 },
    ],
  },
  "modal-top-right": {
    slot: "modal-top-right",
    visibleFrom: "base",
    variants: [
      { assetId: "moon", weight: 40 },
      { assetId: "moon-and-bats", weight: 30 },
      { assetId: null, weight: 30 },
    ],
  },
  "top-edge": {
    slot: "top-edge",
    visibleFrom: "sm",
    variants: [
      { assetId: "ornament-row", weight: 65, layer: "mid" },
      { assetId: null, weight: 35 },
    ],
  },
  "modal-bottom-left": {
    slot: "modal-bottom-left",
    visibleFrom: "base",
    variants: [
      { assetId: "tiny-pumpkin", weight: 60, layer: "foreground" },
      { assetId: null, weight: 40 },
    ],
  },
  "modal-bottom-right": {
    slot: "modal-bottom-right",
    visibleFrom: "sm",
    variants: [
      { assetId: "ghost-1", weight: 35, layer: "foreground" },
      { assetId: "candy-scatter", weight: 35, layer: "foreground" },
      { assetId: null, weight: 30 },
    ],
  },
};

/** Coordinates within the join modal's own `relative` content area. */
export const HALLOWEEN_MODAL_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "modal-top-left": "absolute top-10 left-10 sm:top-12 sm:left-16",
  "modal-top-right": "absolute top-6 right-8 sm:top-8 sm:right-14",
  "top-edge": "absolute inset-x-10 top-0 md:inset-x-16",
  "modal-bottom-left": "absolute -bottom-2 left-4 sm:-bottom-3 sm:left-8",
  "modal-bottom-right": "absolute top-1/2 -right-2 -translate-y-1/2",
};
