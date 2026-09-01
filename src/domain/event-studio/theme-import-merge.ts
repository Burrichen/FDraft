import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";
import { generateUniquePlacementId } from "@/domain/event-studio/placement-ops";
import {
  collectAssetIdsForLayouts,
  remapAssetIdsInPageLayout,
} from "@/domain/event-studio/theme-asset-refs";

/**
 * "Import current-page scoped theme where supported" (EVENT STUDIO —
 * PHASE 6 §6) — merges just ONE page from `imported` into
 * `currentTheme`, replacing that page's layout wholesale (the imported
 * file's own copy of the page IS the intended replacement, not a
 * placement-by-placement diff) while leaving every other page in
 * `currentTheme` untouched. Assets the imported page references are
 * merged into `currentTheme.assets`, reusing an id when both the id AND
 * path already match, or minting a fresh non-colliding id when the same
 * id maps to a different path (two themes can reuse the same short asset
 * id, like "ghost-1", for genuinely different art) — the imported page's
 * placements are rewritten to point at whichever id was actually kept.
 *
 * Returns `null` if the imported file has no layout for this page at
 * all (nothing to merge — the UI should tell the user page-scoped
 * import isn't supported for this file/page combination).
 */
export function mergePageScopedImport(
  currentTheme: FDraftThemeFile,
  imported: FDraftThemeFile,
  pageId: string,
): FDraftThemeFile | null {
  const importedPageLayout = imported.layouts[pageId];
  if (!importedPageLayout) {
    return null;
  }

  const usedAssetIds = collectAssetIdsForLayouts({
    [pageId]: importedPageLayout,
  });

  const assets = { ...currentTheme.assets };
  const assetIdRemap = new Map<string, string>();

  for (const assetId of usedAssetIds) {
    const importedPath = imported.assets[assetId];
    if (importedPath === undefined) continue;

    if (assets[assetId] === importedPath) {
      assetIdRemap.set(assetId, assetId);
      continue;
    }
    if (!(assetId in assets)) {
      assets[assetId] = importedPath;
      assetIdRemap.set(assetId, assetId);
      continue;
    }

    const newAssetId = generateUniquePlacementId(Object.keys(assets), assetId);
    assets[newAssetId] = importedPath;
    assetIdRemap.set(assetId, newAssetId);
  }

  const mergedPageLayout = remapAssetIdsInPageLayout(
    importedPageLayout,
    assetIdRemap,
  );

  return {
    ...currentTheme,
    assets,
    layouts: { ...currentTheme.layouts, [pageId]: mergedPageLayout },
  };
}
