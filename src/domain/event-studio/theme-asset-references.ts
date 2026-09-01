import { getStudioBreakpoint, getStudioPage } from "./studio-pages";
import type {
  FDraftThemeBreakpointId,
  FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Delete Asset safety (see docs/updates, "EVENT STUDIO — PHASE 9" §14) —
 * "find all current theme/layout references to that asset" before
 * allowing a delete. Scoped to the CURRENTLY LOADED working theme (the
 * one Studio actually has in memory for the active preset) rather than
 * every `.fdraft-theme` file in the repo — Studio only ever edits one
 * theme at a time, and that's the layout data actually at risk of
 * silently breaking.
 */
export interface AssetReference {
  pageId: string;
  pageLabel: string;
  stateId: string;
  stateLabel: string;
  breakpointId: FDraftThemeBreakpointId;
  breakpointLabel: string;
  placementId: string;
}

export function findAssetReferences(
  theme: FDraftThemeFile,
  assetId: string,
): AssetReference[] {
  const references: AssetReference[] = [];

  for (const [pageId, page] of Object.entries(theme.layouts)) {
    const pageDef = getStudioPage(pageId);
    for (const [stateId, state] of Object.entries(page.states)) {
      const stateLabel =
        pageDef?.states.find((candidate) => candidate.id === stateId)?.label ??
        stateId;
      for (const [breakpointId, breakpoint] of Object.entries(
        state.breakpoints,
      )) {
        if (!breakpoint) continue;
        for (const placement of breakpoint.placements) {
          const isReferenced =
            placement.kind === "fixed"
              ? placement.assetId === assetId
              : placement.variants.some(
                  (variant) => variant.assetId === assetId,
                );
          if (!isReferenced) continue;
          const breakpointTyped = breakpointId as FDraftThemeBreakpointId;
          references.push({
            pageId,
            pageLabel: pageDef?.label ?? pageId,
            stateId,
            stateLabel,
            breakpointId: breakpointTyped,
            breakpointLabel: getStudioBreakpoint(breakpointTyped).label,
            placementId: placement.id,
          });
        }
      }
    }
  }

  return references;
}

/** A short one-line summary per reference, e.g. `"Watchlist → Populated → Desktop"` — used directly in the Delete confirmation dialog. */
export function formatAssetReference(reference: AssetReference): string {
  return `${reference.pageLabel} → ${reference.stateLabel} → ${reference.breakpointLabel}`;
}
