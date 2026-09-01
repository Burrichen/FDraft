import type {
  FDraftThemeFile,
  FDraftThemePageLayout,
} from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Every `assetId` actually referenced by a set of page layouts — a
 * placement's own `assetId` (fixed) or its variants' `assetId`s
 * (weighted), across every state/breakpoint. Shared by
 * `theme-export-scope.ts` (page-scoped export only keeps assets the
 * exported page actually uses) and `theme-import-merge.ts` (a page-
 * scoped import only needs to bring in the assets ITS page uses).
 */
export function collectAssetIdsForLayouts(
  layouts: FDraftThemeFile["layouts"],
): Set<string> {
  const ids = new Set<string>();
  for (const page of Object.values(layouts)) {
    for (const state of Object.values(page.states)) {
      for (const breakpoint of Object.values(state.breakpoints)) {
        if (!breakpoint) continue;
        for (const placement of breakpoint.placements) {
          if (placement.kind === "fixed") {
            if (placement.assetId) ids.add(placement.assetId);
          } else {
            for (const variant of placement.variants) {
              if (variant.assetId) ids.add(variant.assetId);
            }
          }
        }
      }
    }
  }
  return ids;
}

/** Replaces every `assetId` reference within one page layout according to `remap` (old id -> new id) — used when importing a page whose asset ids collide with the current theme's own. Ids not present in `remap` are left unchanged. */
export function remapAssetIdsInPageLayout(
  pageLayout: FDraftThemePageLayout,
  remap: ReadonlyMap<string, string>,
): FDraftThemePageLayout {
  const remapId = (id: string | null): string | null =>
    id !== null ? (remap.get(id) ?? id) : id;

  return {
    states: Object.fromEntries(
      Object.entries(pageLayout.states).map(([stateId, state]) => [
        stateId,
        {
          breakpoints: Object.fromEntries(
            Object.entries(state.breakpoints)
              .filter(
                (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
                  Boolean(entry[1]),
              )
              .map(([breakpointId, breakpoint]) => [
                breakpointId,
                {
                  placements: breakpoint.placements.map((placement) =>
                    placement.kind === "fixed"
                      ? { ...placement, assetId: remapId(placement.assetId) }
                      : {
                          ...placement,
                          variants: placement.variants.map((variant) => ({
                            ...variant,
                            assetId: remapId(variant.assetId),
                          })),
                        },
                  ),
                },
              ]),
          ),
        },
      ]),
    ),
  };
}
