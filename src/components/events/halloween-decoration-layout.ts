import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import type { EventDecorationSlotPositions } from "./event-decoration-layer";

/**
 * Halloween Event page's decoration layout (see docs/updates, "HALLOWEEN
 * EVENT ART REWORK" and "HALLOWEEN VISUAL/LAYOUT REPAIR") — exactly four
 * real, supplied-art pieces, each with one designed job:
 *
 *  - `header-right` (top-right): `full-moon`, always — no longer a
 *    weighted pick against "nothing"/"moon-and-bats"; the brief calls for
 *    ONLY the moon here.
 *  - `edge-peek-left` (mid-left, far edge): a 25% chance of `ghost-01`
 *    peeking in from off-screen, 75% nothing — see
 *    `HALLOWEEN_HEADER_DECORATION_LAYOUT`'s own comment for why this is a
 *    separate layout from the two below.
 *  - `edge-peek-right` (far bottom-right): `cyndaquil`, always, flipped to
 *    face into the page (the registry entry itself applies the flip —
 *    see `halloween-decoration-registry.tsx`).
 *
 * All three render unconditionally (regardless of whether the profile is
 * currently joined) via `HalloweenDecorativeLayer`/`HalloweenGhostPeekLayer`.
 * The interactive bottom-right slot (75% Candy Bowl / 25% `ghost-02`) is
 * deliberately a SEPARATE layout, `HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT`
 * — the Candy Bowl is a real interactive easter egg, not ambient theming,
 * and this app's existing convention only ever showed its interactive
 * pieces once a profile is actively joined to the current occurrence.
 * Splitting it out lets `HalloweenPageClient` mount it only behind that
 * same `isActiveForProfile` gate.
 *
 * The interactive pumpkin isn't a slot here at all, and isn't on this page
 * any more either (see docs/updates, "HALLOWEEN VISUAL/LAYOUT REPAIR" §3)
 * — it moved to the History page (`HalloweenPumpkin`, in
 * `drafts/history/page.tsx`), still a single, always-the-same, persisted-
 * state easter egg, just relocated.
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
  "edge-peek-right": {
    slot: "edge-peek-right",
    visibleFrom: "base",
    variants: [{ assetId: "cyndaquil", weight: 1 }],
  },
};

/**
 * `edge-peek-left` (the 25%-chance `ghost-01` mid-left peek) is
 * deliberately a SEPARATE layout from the other two ambient slots above —
 * see docs/updates, "HALLOWEEN VISUAL/LAYOUT REPAIR" §14: positioning it
 * with `top-1/2` against the FULL page (as `HALLOWEEN_PAGE_DECORATION_
 * LAYOUT`'s own whole-page container does for `header-right`/
 * `edge-peek-right`) centres it against however tall the page's content
 * happens to be that render — a short "no Draft yet" page and a tall
 * "active Draft with a full film grid" page have wildly different
 * heights, so a page-relative 50% routinely landed the ghost on top of the
 * countdown progress bar or the Draft card instead of beside empty space.
 * `HalloweenPageClient` mounts this layout's own `EventDecorationLayer`
 * scoped to just the page's header block (heading + deadline text) —a
 * small, near-constant-height region regardless of Draft state — so
 * `top-1/2` there reliably centres the ghost against the TITLE, never
 * against whatever variable-length content sits below it.
 */
export const HALLOWEEN_HEADER_DECORATION_LAYOUT: EventDecorationLayout = {
  "edge-peek-left": {
    slot: "edge-peek-left",
    visibleFrom: "lg",
    variants: [
      { assetId: "ghost-01", weight: 25 },
      { assetId: null, weight: 75 },
    ],
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
  // Only a ~16px sliver of the 64px-wide `ghost-01` shows (see that
  // registry entry's own comment) — the heading's icon/text and the
  // "Event ends..." subtitle both start flush against this container's
  // left edge (x=0), so anything more would read as covering the title
  // rather than peeking in beside it.
  "edge-peek-left": "absolute top-1/2 -left-12 -translate-y-1/2",
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
