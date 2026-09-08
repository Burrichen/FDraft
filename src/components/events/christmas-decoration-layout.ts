import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * Christmas's page Designed Slot configuration (see docs/updates, "EVENT
 * ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS" §8) — the exact same
 * slot/weight/registry model Halloween uses
 * (`halloween-decoration-layout.ts`), with zero changes needed to
 * `event-decoration-slots.ts` or `event-decoration-layer.tsx`.
 *
 * Originally an EXAMPLE layout wired into nothing, back when Christmas
 * had no `EventDefinition`, route, or nav entry; now a real one, alongside
 * the modal/ending layouts below (see docs/updates, "FDRAFT UPDATE 1 —
 * CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §12/§14).
 */
export const CHRISTMAS_PAGE_DECORATION_LAYOUT: EventDecorationLayout = {
  "header-left": {
    slot: "header-left",
    visibleFrom: "sm",
    variants: [
      { assetId: "star", weight: 50 },
      { assetId: "snowflake-cluster", weight: 30 },
      { assetId: null, weight: 20 },
    ],
  },
  "header-right": {
    slot: "header-right",
    visibleFrom: "base",
    variants: [
      { assetId: "snowflake-cluster", weight: 50 },
      { assetId: "fairy-lights", weight: 40, layer: "mid" },
      { assetId: null, weight: 10 },
    ],
  },
  "lower-left": {
    slot: "lower-left",
    visibleFrom: "lg",
    variants: [
      { assetId: "presents", weight: 50 },
      { assetId: "tree", weight: 50 },
    ],
  },
  "lower-right": {
    slot: "lower-right",
    visibleFrom: "lg",
    variants: [
      { assetId: "snowman", weight: 40 },
      { assetId: "stocking", weight: 35 },
      { assetId: null, weight: 25 },
    ],
  },
};

export const CHRISTMAS_PAGE_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "header-left": "absolute top-4 left-16",
  "header-right": "absolute top-4 right-16",
  "lower-left": "absolute bottom-6 left-10",
  "lower-right": "absolute right-10 bottom-6",
};

/**
 * The ENDING modal's layout — quieter still than the join modal's (one
 * corner, one asset family), matching the "quieter than the Event
 * introduction" convention Halloween's and January's own endings follow.
 * Nothing is placed near the footer: "Onto next year!" is a full-width
 * button that must stay visually unencumbered as well as clickable
 * (see §15).
 */
export const CHRISTMAS_ENDING_DECORATION_LAYOUT: EventDecorationLayout = {
  "header-right": {
    slot: "header-right",
    visibleFrom: "base",
    variants: [
      { assetId: "snowflake-cluster", weight: 60 },
      { assetId: "star", weight: 40 },
    ],
  },
};

export const CHRISTMAS_ENDING_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "header-right": "absolute top-3 right-4",
};
