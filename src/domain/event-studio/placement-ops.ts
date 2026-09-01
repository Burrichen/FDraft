import { DEFAULT_PLACEMENT_WIDTH_REM } from "./placement-geometry";
import type {
  FDraftThemeBreakpointId,
  FDraftThemeFile,
  FDraftThemePlacement,
} from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Pure, immutable CRUD/reordering operations on ONE page/state/breakpoint's
 * placement list within an `FDraftThemeFile` (see docs/updates, "EVENT
 * STUDIO — PHASE 4" §4/§8) — every function here returns a brand-new
 * theme object (deep-cloned only as far as the path being changed; every
 * untouched branch is shared by reference), never mutates its input.
 * `StudioPageClient` feeds every result through its undoable-theme history
 * (see `placement-history.ts`), so "pure function in, pure function out"
 * is what makes each edit a clean, independently-undoable step.
 *
 * Deliberately generic across `kind: "fixed" | "weighted"` for read/
 * remove/reorder — this phase only ever CREATES `"fixed"` placements
 * (§15: "STOP before weighted variant-group editing"), but must not
 * corrupt or lose an existing weighted group it didn't create.
 */
export interface PlacementLocation {
  pageId: string;
  stateId: string;
  breakpointId: FDraftThemeBreakpointId;
}

export function getPlacementsAt(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
): FDraftThemePlacement[] {
  return (
    theme.layouts[loc.pageId]?.states[loc.stateId]?.breakpoints[
      loc.breakpointId
    ]?.placements ?? []
  );
}

/** Builds a valid full theme with `placements` set at `loc`, creating any missing page/state/breakpoint node along the way (see §4: placing the FIRST asset on a page/state/breakpoint with no layout entry yet at all). */
function setPlacementsAt(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placements: FDraftThemePlacement[],
): FDraftThemeFile {
  const page = theme.layouts[loc.pageId] ?? { states: {} };
  const state = page.states[loc.stateId] ?? { breakpoints: {} };
  return {
    ...theme,
    layouts: {
      ...theme.layouts,
      [loc.pageId]: {
        ...page,
        states: {
          ...page.states,
          [loc.stateId]: {
            ...state,
            breakpoints: {
              ...state.breakpoints,
              [loc.breakpointId]: { placements },
            },
          },
        },
      },
    },
  };
}

export function addPlacement(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placement: FDraftThemePlacement,
): FDraftThemeFile {
  return setPlacementsAt(theme, loc, [
    ...getPlacementsAt(theme, loc),
    placement,
  ]);
}

/** `updater` receives the CURRENT placement (already narrowed to its own `kind`) and must return a placement of the same shape — a callback rather than a partial object so a discriminated-union field spread (`{ ...placement, offsetX: next }`) stays correctly typed at the call site. */
export function updatePlacement(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placementId: string,
  updater: (placement: FDraftThemePlacement) => FDraftThemePlacement,
): FDraftThemeFile {
  const placements = getPlacementsAt(theme, loc).map((placement) =>
    placement.id === placementId ? updater(placement) : placement,
  );
  return setPlacementsAt(theme, loc, placements);
}

export function removePlacement(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placementId: string,
): FDraftThemeFile {
  return setPlacementsAt(
    theme,
    loc,
    getPlacementsAt(theme, loc).filter(
      (placement) => placement.id !== placementId,
    ),
  );
}

/** Clones `placementId` with a new id, offset by `offsetRem` on both axes, inserted immediately after the original (same z-order neighborhood) — used by both Duplicate (§10) and Paste (§10, pasting a copied placement). Returns `theme` unchanged, and `null` for the new id, if `placementId` doesn't exist. */
export function duplicatePlacement(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placementId: string,
  newId: string,
  offsetRem: number,
): { theme: FDraftThemeFile; newPlacementId: string } | null {
  const placements = getPlacementsAt(theme, loc);
  const index = placements.findIndex(
    (placement) => placement.id === placementId,
  );
  if (index === -1) {
    return null;
  }
  const clone: FDraftThemePlacement = {
    ...placements[index],
    id: newId,
    offsetX: placements[index].offsetX + offsetRem,
    offsetY: placements[index].offsetY + offsetRem,
  };
  const next = [...placements];
  next.splice(index + 1, 0, clone);
  return { theme: setPlacementsAt(theme, loc, next), newPlacementId: newId };
}

export type PlacementReorderDirection =
  "forward" | "backward" | "front" | "back";

/** Moves `placementId` within the array — later in the array paints on top for two placements sharing the same `layer` (see `event-theme-layout-renderer.tsx`'s `LAYER_Z_INDEX`, where array/DOM order is the tiebreaker), so "the resulting order maps to production z/layer ordering" (§8) for free — no separate z-index field to keep in sync. */
export function reorderPlacement(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placementId: string,
  direction: PlacementReorderDirection,
): FDraftThemeFile {
  const placements = getPlacementsAt(theme, loc);
  const index = placements.findIndex(
    (placement) => placement.id === placementId,
  );
  if (index === -1) {
    return theme;
  }
  const next = [...placements];
  const [item] = next.splice(index, 1);
  const insertAt =
    direction === "forward"
      ? Math.min(index + 1, next.length)
      : direction === "backward"
        ? Math.max(index - 1, 0)
        : direction === "front"
          ? next.length
          : 0;
  next.splice(insertAt, 0, item);
  return setPlacementsAt(theme, loc, next);
}

/** A short, stable, collision-free id — `base` (e.g. a friendly asset name) with a numeric suffix appended only if needed. Used for both a newly-placed asset's placement id and a duplicate/paste's new id. */
export function generateUniquePlacementId(
  existingIds: readonly string[],
  base: string,
): string {
  const existing = new Set(existingIds);
  const safeBase = base.trim() || "placement";
  if (!existing.has(safeBase)) {
    return safeBase;
  }
  let n = 2;
  while (existing.has(`${safeBase}-${n}`)) {
    n += 1;
  }
  return `${safeBase}-${n}`;
}

/**
 * Ensures `relativePath` (e.g. `"events/halloween/interactives/pumpkin-lit.png"`,
 * exactly the shape `scanEventArtWorkspaceAssets` produces) has an id in
 * `theme.assets` — reuses an existing id if this exact path is already
 * registered under one (never creates a duplicate asset entry for the
 * same file), otherwise adds a new one derived from the filename. See
 * docs/updates, "EVENT STUDIO — PHASE 4" §4: placing an Asset Browser
 * image writes ONLY to `theme.assets`/`theme.layouts` — the source image
 * file itself is never read, written, or moved.
 */
export function ensureAssetRegistered(
  theme: FDraftThemeFile,
  relativePath: string,
): { theme: FDraftThemeFile; assetId: string } {
  const existingEntry = Object.entries(theme.assets).find(
    ([, path]) => path === relativePath,
  );
  if (existingEntry) {
    return { theme, assetId: existingEntry[0] };
  }
  const fileName = relativePath.split("/").pop() ?? "asset";
  const baseId = fileName.replace(/\.[a-zA-Z0-9]+$/, "") || "asset";
  const assetId = generateUniquePlacementId(Object.keys(theme.assets), baseId);
  return {
    theme: { ...theme, assets: { ...theme.assets, [assetId]: relativePath } },
    assetId,
  };
}

/**
 * A new FIXED placement, centred on the page (offset 0,0 with a
 * `"center"` anchor — see §4: "place centred in current page"), at the
 * default placement size. `naturalAspectRatio` (the source image's own
 * width/height, when the Asset Browser's thumbnail has already loaded it
 * — see `asset-browser-panel.tsx`) is preferred when known: `height:
 * null` + `aspectRatio` set means the box derives its height from the
 * REAL image proportions (see §5, so a freshly-placed decoration never
 * starts visibly stretched/squashed). Falls back to an explicit square
 * box when the natural size isn't known yet (e.g. an SVG that hasn't
 * finished loading) — always a well-defined, non-zero box either way, so
 * Moveable always has a real box to attach handles to.
 */
export function createFixedPlacement(
  id: string,
  assetId: string | null,
  naturalAspectRatio: number | null = null,
  coordinateSpace: FDraftThemePlacement["coordinateSpace"] = "page",
): Extract<FDraftThemePlacement, { kind: "fixed" }> {
  return {
    kind: "fixed",
    id,
    assetId,
    coordinateSpace,
    anchor: "center",
    offsetX: 0,
    offsetY: 0,
    width: DEFAULT_PLACEMENT_WIDTH_REM,
    height: naturalAspectRatio !== null ? null : DEFAULT_PLACEMENT_WIDTH_REM,
    aspectRatio: naturalAspectRatio,
    rotation: 0,
    opacity: 1,
    flipX: false,
    flipY: false,
    layer: "mid",
    crop: null,
    interactionId: null,
    visible: true,
  };
}
