import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";
import { collectAssetIdsForLayouts } from "@/domain/event-studio/theme-asset-refs";

/**
 * Asset Validation (EVENT STUDIO — PHASE 6 §11) — checks every asset
 * actually REQUIRED by the theme (referenced from at least one
 * placement/variant; a registered-but-unused asset blocks nothing, and
 * "Nothing" placements have no `assetId` at all so they're never even
 * considered) against the connected Event Art Workspace. Pure/testable:
 * the actual existence check is injected as `checkPaths` rather than
 * imported directly (the domain layer never reaches into
 * `@/infrastructure/tauri` itself — see `event-art-workspace.ts`'s own
 * `checkEventArtWorkspaceAssetPaths`, which the application layer wires
 * in as this parameter).
 */
export interface AssetValidationEntry {
  assetId: string;
  path: string;
  present: boolean;
}

export type CheckAssetPaths = (
  workspacePath: string,
  relativePaths: string[],
) => Promise<Record<string, boolean>>;

export async function validateThemeAssetsAgainstWorkspace(
  theme: FDraftThemeFile,
  workspacePath: string,
  checkPaths: CheckAssetPaths,
): Promise<AssetValidationEntry[]> {
  const requiredAssetIds = [...collectAssetIdsForLayouts(theme.layouts)]
    .filter((assetId) => theme.assets[assetId] !== undefined)
    .sort((a, b) => a.localeCompare(b));

  if (requiredAssetIds.length === 0) {
    return [];
  }

  const paths = requiredAssetIds.map((assetId) => theme.assets[assetId]);
  const verdicts = await checkPaths(workspacePath, paths);

  return requiredAssetIds.map((assetId) => {
    const path = theme.assets[assetId];
    return { assetId, path, present: verdicts[path] ?? false };
  });
}

/** "✓ ghost-1.png" / "✕ missing-cat.png" (§11's own examples) — the asset's filename, not its internal id, since that's what a non-technical user recognizes. */
export function formatAssetValidationLine(entry: AssetValidationEntry): string {
  const fileName = entry.path.split("/").pop() ?? entry.path;
  return `${entry.present ? "✓" : "✕"} ${fileName}`;
}

export function missingRequiredAssets(
  entries: readonly AssetValidationEntry[],
): AssetValidationEntry[] {
  return entries.filter((entry) => !entry.present);
}
