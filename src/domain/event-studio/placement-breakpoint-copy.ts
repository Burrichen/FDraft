import { scaleOffsetAndSizeForBreakpoint } from "./placement-geometry";
import {
  addPlacement,
  getPlacementsAt,
  updatePlacement,
} from "./placement-ops";
import { getStudioBreakpoint } from "./studio-pages";
import type {
  FDraftThemeBreakpointId,
  FDraftThemeFile,
  FDraftThemePlacement,
} from "@/domain/event-themes/fdraft-theme-schema";
import type { PlacementLocation } from "./placement-ops";

/**
 * Per-placement (or per-group) "Copy to Tablet / Copy to Mobile / Copy to
 * All Breakpoints" (see docs/updates, "EVENT STUDIO — PHASE 5" §11) —
 * distinct from Phase 3's whole-breakpoint "Copy Desktop Layout ->
 * Tablet" (`fdraft-theme-breakpoint-copy.ts`, which replaces an ENTIRE
 * breakpoint's placement list): this copies ONE selected decoration (or
 * every member of a selected group) into another breakpoint's list,
 * scaling its offset/size via `scaleOffsetAndSizeForBreakpoint` rather
 * than copying raw values unchanged — see that function's own doc
 * comment for why blind copying is wrong.
 */

function translateForBreakpoint(
  placement: FDraftThemePlacement,
  fromWidthPx: number,
  toWidthPx: number,
): FDraftThemePlacement {
  const scaled = scaleOffsetAndSizeForBreakpoint(
    placement.offsetX,
    placement.offsetY,
    placement.width,
    placement.height,
    fromWidthPx,
    toWidthPx,
  );
  return {
    ...placement,
    offsetX: scaled.offsetX,
    offsetY: scaled.offsetY,
    width: scaled.width,
    height: scaled.height,
  };
}

/** True when copying `placementIds` into `targetBreakpointId` would silently overwrite a same-id placement that already differs there — the confirmation-prompt condition, mirroring `breakpointCopyWouldOverwriteEdits`'s (Phase 3) own convention. */
export function placementCopyWouldOverwriteExisting(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placementIds: readonly string[],
  targetBreakpointId: FDraftThemeBreakpointId,
): boolean {
  const sourcePlacements = getPlacementsAt(theme, loc);
  const targetPlacements = getPlacementsAt(theme, {
    ...loc,
    breakpointId: targetBreakpointId,
  });
  const targetById = new Map(targetPlacements.map((p) => [p.id, p]));

  const fromWidthPx = getStudioBreakpoint(loc.breakpointId).width;
  const toWidthPx = getStudioBreakpoint(targetBreakpointId).width;

  return placementIds.some((id) => {
    const source = sourcePlacements.find((p) => p.id === id);
    const existing = targetById.get(id);
    if (!source || !existing) return false;
    const translated = translateForBreakpoint(source, fromWidthPx, toWidthPx);
    return JSON.stringify(translated) !== JSON.stringify(existing);
  });
}

/**
 * Copies `placementIds` (a single selection, or every member of a group)
 * from `loc`'s breakpoint into `targetBreakpointId`, translating each
 * one's offset/size for the destination canvas width. A placement with
 * the same id already present in the target is REPLACED (not
 * duplicated) — callers check `placementCopyWouldOverwriteExisting`
 * first to decide whether that warrants a confirmation prompt.
 */
export function copyPlacementsToBreakpoint(
  theme: FDraftThemeFile,
  loc: PlacementLocation,
  placementIds: readonly string[],
  targetBreakpointId: FDraftThemeBreakpointId,
): FDraftThemeFile {
  if (loc.breakpointId === targetBreakpointId) {
    return theme;
  }
  const sourcePlacements = getPlacementsAt(theme, loc);
  const fromWidthPx = getStudioBreakpoint(loc.breakpointId).width;
  const toWidthPx = getStudioBreakpoint(targetBreakpointId).width;
  const targetLoc: PlacementLocation = {
    ...loc,
    breakpointId: targetBreakpointId,
  };

  let next = theme;
  for (const id of placementIds) {
    const source = sourcePlacements.find((p) => p.id === id);
    if (!source) continue;
    const translated = translateForBreakpoint(source, fromWidthPx, toWidthPx);
    const alreadyExists = getPlacementsAt(next, targetLoc).some(
      (p) => p.id === id,
    );
    next = alreadyExists
      ? updatePlacement(next, targetLoc, id, () => translated)
      : addPlacement(next, targetLoc, translated);
  }
  return next;
}

/** Every OTHER canonical breakpoint besides `from` — the "Copy to All Breakpoints" fan-out. */
export function otherBreakpoints(
  from: FDraftThemeBreakpointId,
): FDraftThemeBreakpointId[] {
  const all: FDraftThemeBreakpointId[] = ["desktop", "tablet", "mobile"];
  return all.filter((id) => id !== from);
}
