import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * Halloween Event page's decoration layout (see docs/updates, "HALLOWEEN
 * EVENT ART REWORK + WIDER DESKTOP LAYOUT") — replaces the previous
 * randomized cluster of small inline-SVG accents (bunting, cobwebs, bats,
 * skulls, leaves, ...) with exactly five real, supplied-art pieces, each
 * with one designed job:
 *
 *  - `header-right` (top-right): `full-moon`, always — no longer a
 *    weighted pick against "nothing"/"moon-and-bats"; the brief calls for
 *    ONLY the moon here.
 *  - `edge-peek-left` (mid-left, far edge): a 25% chance of `ghost-01`
 *    peeking in from off-screen, 75% nothing — genuinely ambient, shown
 *    regardless of whether the profile is currently joined (see
 *    `HalloweenDecorativeLayer`, unconditional at the top of the page).
 *  - `edge-peek-right` (far bottom-right): `cyndaquil`, always, flipped to
 *    face into the page (the registry entry itself applies the flip —
 *    see `halloween-decoration-registry.tsx`).
 *
 * The interactive bottom-right slot (75% Candy Bowl / 25% `ghost-02`) is
 * deliberately a SEPARATE layout, `HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT`
 * — the Candy Bowl is a real interactive easter egg, not ambient theming,
 * and this app's existing convention (see the previous version of this
 * page) only ever showed its interactive pieces (pumpkin, gravestone,
 * candy bowl) once a profile is actively joined to the current occurrence.
 * Splitting it out lets `HalloweenPageClient` mount it only behind that
 * same `isActiveForProfile` gate, while the three purely-ambient slots
 * above keep rendering unconditionally, exactly as the old moon/bats/
 * cobwebs did.
 *
 * The centre-bottom interactive pumpkin isn't a slot here at all — it's a
 * single, always-the-same, persisted-state easter egg
 * (`HalloweenPumpkin`), rendered directly by `HalloweenPageClient`, same
 * as before this rework.
 *
 * Every asset id referenced below must exist in
 * `HALLOWEEN_DECORATION_REGISTRY` (`halloween-decoration-registry.tsx`) —
 * this file only says WHERE and HOW OFTEN, never WHAT something looks
 * like. Weights are plain relative numbers, not required to sum to 100
 * (see `pickDecorationVariant`).
 */
export const HALLOWEEN_PAGE_DECORATION_LAYOUT: EventDecorationLayout = {
  "header-right": {
    slot: "header-right",
    visibleFrom: "sm",
    variants: [{ assetId: "full-moon", weight: 1 }],
  },
  "edge-peek-left": {
    slot: "edge-peek-left",
    visibleFrom: "lg",
    variants: [
      { assetId: "ghost-01", weight: 25 },
      { assetId: null, weight: 75 },
    ],
  },
  "edge-peek-right": {
    slot: "edge-peek-right",
    visibleFrom: "base",
    variants: [{ assetId: "cyndaquil", weight: 1 }],
  },
};

/**
 * The Halloween page's one INTERACTIVE decoration slot — bottom-right,
 * 75% Candy Bowl / 25% `ghost-02` — kept behind the same
 * `isActiveForProfile` gate the Candy Bowl always required (see this
 * file's own top comment). Uses the SAME session-stable weighted-pick
 * mechanism as every other Designed Slot (`resolveDecorationLayout`), so
 * "stable for the session, a fresh app launch may choose again" comes for
 * free rather than being hand-rolled again for this one slot.
 */
export const HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT: EventDecorationLayout = {
  "lower-right": {
    slot: "lower-right",
    visibleFrom: "base",
    variants: [
      { assetId: "candy-bowl", weight: 75 },
      { assetId: "ghost-02", weight: 25 },
    ],
  },
};

/**
 * Coordinates for the Event page's own decorative layer, shared by both
 * layouts above (a slot name is only ever positioned once regardless of
 * which layout object it's declared in). Deliberately composed so the
 * bottom-right cluster reads as ONE arrangement rather than two things
 * randomly stacked: `lower-right` (Candy Bowl/ghost-02) sits inward/up
 * from `edge-peek-right` (Cyndaquil, tucked into the very corner) — see
 * docs/updates, "CYNDAQUIL + BOWL SLOT COEXISTENCE".
 */
export const HALLOWEEN_PAGE_SLOT_POSITIONS: EventDecorationSlotPositions = {
  "header-right": "absolute top-0 right-2 sm:right-4 lg:top-2 lg:right-10",
  "edge-peek-left": "absolute top-1/2 -left-6 -translate-y-1/2 sm:-left-8",
  "edge-peek-right": "absolute -right-1 bottom-0 sm:right-2 sm:bottom-1",
  "lower-right":
    "absolute right-24 bottom-6 sm:right-28 sm:bottom-8 lg:right-36",
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
