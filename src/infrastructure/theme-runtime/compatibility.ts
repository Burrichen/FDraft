import {
  CURRENT_PROJECT_FORMAT_VERSION,
  CURRENT_THEME_FORMAT_VERSION,
  MIN_SUPPORTED_PROJECT_FORMAT_VERSION,
  MIN_SUPPORTED_THEME_FORMAT_VERSION,
  isRendererCompatible,
} from "@fdraft/theme-sdk";
import {
  INSTALLED_THEME_RENDERER_VERSION,
  INSTALLED_THEME_SDK_VERSION,
} from "./installed-versions.generated";

/**
 * FDraft's own real host component-adapter keys (see docs/updates,
 * "FDRAFT THEME RUNTIME — PROMPT 10") — the subset of
 * `@fdraft/theme-renderer`'s SAMPLE_COMPONENT_KEYS FDraft has actually
 * implemented a real adapter for, see `component-adapters.tsx`. Kept as
 * FDraft's own list (not re-exported from the sample set) since a real
 * host is never obligated to implement every key the sample/demo registry
 * happens to define — the compatibility handshake below reports exactly
 * what THIS host supports, not what the renderer merely knows about.
 */
export const FDRAFT_SUPPORTED_COMPONENT_KEYS = [
  "page-title",
  "event-information",
  "event-countdown",
  "draft-controls",
  "film-grid",
  "event-progress",
  "points-counter",
] as const;

export type FDraftSupportedComponentKey =
  (typeof FDRAFT_SUPPORTED_COMPONENT_KEYS)[number];

/**
 * The theme capabilities (`@fdraft/theme-sdk`'s `ThemeCapability` union —
 * responsive/animations/masters/popups/effects/behaviour) FDraft's own
 * `ThemeRenderer` host wiring actually exercises. All six are structurally
 * supported by the renderer package itself; this list is FDraft's own
 * declared support surface for THIS phase — see
 * `docs/fdraft-theme-runtime/INTEGRATION.md` for what's genuinely
 * exercised by a test versus merely passed through.
 */
export const FDRAFT_SUPPORTED_CAPABILITIES = [
  "responsive",
  "masters",
  "popups",
] as const;

/**
 * The one-shot "what does this build of FDraft actually support" report
 * (see docs/updates, "FDRAFT THEME RUNTIME — PROMPT 10", "clear
 * compatibility handshake") — read by the dev theme-preview surface and
 * by `theme-loader.ts` before ever attempting to render an untrusted
 * theme package. Every value here is derived from the actually-installed
 * `@fdraft/theme-sdk`/`@fdraft/theme-renderer` packages or FDraft's own
 * adapter registry — never hand-copied literals that could silently
 * drift from what's really installed (see this module's own test, which
 * cross-checks these against the real installed `package.json` files).
 */
export interface ThemeRuntimeCompatibility {
  installedSdkVersion: string;
  installedRendererVersion: string;
  supportedProjectFormatRange: { min: string; current: string };
  supportedThemeFormatRange: { min: string; current: string };
  supportedComponentKeys: readonly FDraftSupportedComponentKey[];
  supportedCapabilities: readonly string[];
}

export function getThemeRuntimeCompatibility(): ThemeRuntimeCompatibility {
  return {
    installedSdkVersion: INSTALLED_THEME_SDK_VERSION,
    installedRendererVersion: INSTALLED_THEME_RENDERER_VERSION,
    supportedProjectFormatRange: {
      min: MIN_SUPPORTED_PROJECT_FORMAT_VERSION,
      current: CURRENT_PROJECT_FORMAT_VERSION,
    },
    supportedThemeFormatRange: {
      min: MIN_SUPPORTED_THEME_FORMAT_VERSION,
      current: CURRENT_THEME_FORMAT_VERSION,
    },
    supportedComponentKeys: FDRAFT_SUPPORTED_COMPONENT_KEYS,
    supportedCapabilities: FDRAFT_SUPPORTED_CAPABILITIES,
  };
}

export interface ThemeCompatibilityCheckResult {
  compatible: boolean;
  reasons: string[];
}

/**
 * Checks ONE loaded theme's manifest against this host's actual
 * capabilities — distinct from `getThemeRuntimeCompatibility()`'s static
 * "what this build supports" report, since a theme's own required
 * renderer version/component keys/capabilities are only known once it's
 * been parsed. Never renders a theme this returns `compatible: false`
 * for — see `theme-loader.ts`.
 */
export function checkThemeCompatibility(manifest: {
  minRendererVersion: string;
  requiredComponentKeys: readonly string[];
  capabilities: readonly string[];
}): ThemeCompatibilityCheckResult {
  const reasons: string[] = [];

  if (
    !isRendererCompatible(
      manifest.minRendererVersion,
      INSTALLED_THEME_RENDERER_VERSION,
    )
  ) {
    reasons.push(
      `Theme requires renderer >= ${manifest.minRendererVersion}, installed renderer is ${INSTALLED_THEME_RENDERER_VERSION}.`,
    );
  }

  const supportedKeys = new Set<string>(FDRAFT_SUPPORTED_COMPONENT_KEYS);
  const unsupportedComponentKeys = manifest.requiredComponentKeys.filter(
    (key) => !supportedKeys.has(key),
  );
  if (unsupportedComponentKeys.length > 0) {
    reasons.push(
      `Theme requires unsupported component keys: ${unsupportedComponentKeys.join(", ")}.`,
    );
  }

  const supportedCapabilities = new Set<string>(FDRAFT_SUPPORTED_CAPABILITIES);
  const unsupportedCapabilities = manifest.capabilities.filter(
    (capability) => !supportedCapabilities.has(capability),
  );
  if (unsupportedCapabilities.length > 0) {
    reasons.push(
      `Theme requires unsupported capabilities: ${unsupportedCapabilities.join(", ")}.`,
    );
  }

  return { compatible: reasons.length === 0, reasons };
}

// Referenced for documentation purposes in downstream modules/tests —
// exported so `theme-loader.ts` (and its tests) never need to re-import
// `@fdraft/theme-renderer` just to see the demo/sample key list this
// host's own real support is a SUBSET of.
export { SAMPLE_COMPONENT_KEYS } from "@fdraft/theme-renderer";
