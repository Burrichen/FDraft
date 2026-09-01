import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";
import { collectAssetIdsForLayouts } from "@/domain/event-studio/theme-asset-refs";

/**
 * "Export Current Page" (EVENT STUDIO — PHASE 6 §7) — a theme file
 * containing only the given page's layouts/states/breakpoints, plus the
 * shared metadata every `.fdraft-theme` file needs (schema version,
 * event/theme id) and only the assets that page actually references
 * ("Do NOT duplicate artwork into every theme file" — this keeps the
 * `assets` map itself lean too, not just the artwork on disk).
 */
export function extractPageScopedTheme(
  theme: FDraftThemeFile,
  pageId: string,
): FDraftThemeFile {
  const pageLayout = theme.layouts[pageId];
  const layouts = pageLayout ? { [pageId]: pageLayout } : {};
  const usedAssetIds = collectAssetIdsForLayouts(layouts);
  const assets = Object.fromEntries(
    Object.entries(theme.assets).filter(([assetId]) =>
      usedAssetIds.has(assetId),
    ),
  );
  return { ...theme, layouts, assets };
}

/** Strips characters that are unsafe in a downloaded filename, keeping the rest human-readable. */
function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * "Halloween - Watchlist.fdraft-theme" for a page export, or
 * "Halloween.fdraft-theme" for a whole-event export (§7/§8) — built from
 * human labels, not raw ids, so the download stays friendly.
 */
export function buildThemeExportFilename(
  presetLabel: string,
  pageLabel?: string,
): string {
  const base = sanitizeFilenamePart(presetLabel) || "Event";
  if (!pageLabel) {
    return `${base}.fdraft-theme`;
  }
  const page = sanitizeFilenamePart(pageLabel) || "Page";
  return `${base} - ${page}.fdraft-theme`;
}
