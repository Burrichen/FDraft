import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * An EXAMPLE Christmas Designed Slot configuration (see docs/updates,
 * "EVENT ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS" §8) — proves
 * the exact same slot/weight/registry model Halloween uses
 * (`halloween-decoration-layout.ts`) works for a second, structurally
 * different event with zero changes to `event-decoration-slots.ts` or
 * `event-decoration-layer.tsx`. Deliberately NOT imported by any real
 * page — there is no Christmas `EventDefinition`, route, or nav entry
 * yet (per this phase's own "only the art placement system, not the
 * whole Christmas event") — only by this file's own test.
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
