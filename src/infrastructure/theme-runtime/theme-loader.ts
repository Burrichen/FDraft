import { unpackFdtheme } from "@fdraft/theme-sdk/packaging";
import type { RuntimeThemeDocument } from "@fdraft/theme-sdk";
import type { AssetResolver } from "@fdraft/theme-renderer";
import { checkThemeCompatibility } from "./compatibility";

/**
 * Safe loading for a validated theme package (see docs/updates, "FDRAFT
 * THEME RUNTIME — PROMPT 10", "Runtime theme loading and fallback").
 * `unpackFdtheme` (from the verified, checksum-pinned `@fdraft/theme-sdk`
 * release) already does the archive-security/hash/schema/semantic
 * verification described there — path traversal, dangerous extensions,
 * zip-bomb ratios, manifest hash mismatches, and broken references are
 * all rejected INSIDE that call, never re-implemented here. This module
 * adds the one thing `unpackFdtheme` cannot know: whether the result is
 * compatible with FDRAFT'S OWN installed renderer version and adapter
 * registry (`checkThemeCompatibility`).
 */

export interface ThemeLoadError {
  code: string;
  /** Safe to show in production — never a filesystem path or internal detail. */
  userMessage: string;
  /** Only ever surfaced when `process.env.NODE_ENV !== "production"` — see `theme-boundary.tsx`. */
  devMessage: string;
}

export type ThemeLoadResult =
  | {
      ok: true;
      document: RuntimeThemeDocument;
      assets: Record<string, Uint8Array>;
    }
  | { ok: false; error: ThemeLoadError };

/**
 * Parses, verifies, and compatibility-checks `.fdtheme` archive bytes.
 * Never throws — every failure mode (corrupt archive, hash mismatch,
 * unsupported version/component/capability) becomes a
 * `{ ok: false, error }` result instead, so a caller can always fall back
 * to normal FDraft rather than crash.
 */
export async function loadFdthemeArchive(
  archiveBytes: Uint8Array,
): Promise<ThemeLoadResult> {
  let unpacked: Awaited<ReturnType<typeof unpackFdtheme>>;
  try {
    unpacked = await unpackFdtheme(archiveBytes);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      error: {
        code: "INVALID_PACKAGE",
        userMessage: "This theme could not be loaded.",
        devMessage: `Theme package failed validation: ${message}`,
      },
    };
  }

  const compat = checkThemeCompatibility({
    minRendererVersion: unpacked.document.manifest.minRendererVersion,
    requiredComponentKeys: unpacked.document.manifest.requiredComponentKeys,
    capabilities: unpacked.document.manifest.capabilities,
  });
  if (!compat.compatible) {
    return {
      ok: false,
      error: {
        code: "INCOMPATIBLE_THEME",
        userMessage: "This theme isn't compatible with this version of FDraft.",
        devMessage: `Theme incompatible with installed host: ${compat.reasons.join(" ")}`,
      },
    };
  }

  return { ok: true, document: unpacked.document, assets: unpacked.assets };
}

/**
 * Resolves assets ONLY from the validated in-memory bytes `loadFdthemeArchive`
 * already extracted — never from a filesystem path or external URL, so a
 * theme can never cause the renderer to fetch anything outside its own
 * validated package. Each `document.assets` record's own `path` (verified
 * present and hash-correct by `unpackFdtheme`) is the only thing looked
 * up; an asset id absent from the document simply resolves to `undefined`
 * (the renderer's own documented "missing asset" fallback), never an
 * error.
 */
export function createValidatedPackageAssetResolver(
  document: RuntimeThemeDocument,
  assets: Record<string, Uint8Array>,
): AssetResolver {
  const urlByAssetId: Record<string, string> = {};
  for (const asset of document.assets) {
    const bytes = assets[asset.path];
    if (!bytes) continue;
    const blob = new Blob([new Uint8Array(bytes)], { type: asset.mimeType });
    urlByAssetId[asset.id] = URL.createObjectURL(blob);
  }
  return {
    resolveAsset: (assetId) => urlByAssetId[assetId],
  };
}

/**
 * Releases every blob URL a resolver created — call when a theme is
 * unmounted/replaced so object URLs don't leak for the lifetime of the
 * page.
 */
export function revokeValidatedPackageAssetResolver(
  document: RuntimeThemeDocument,
  resolver: AssetResolver,
): void {
  for (const asset of document.assets) {
    const url = resolver.resolveAsset(asset.id);
    if (url) URL.revokeObjectURL(url);
  }
}
