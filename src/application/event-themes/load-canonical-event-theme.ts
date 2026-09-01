import {
  parseFDraftThemeText,
  type FDraftThemeParseResult,
} from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Loads ONE canonical, bundled `.fdraft-theme` file from `public/event-
 * themes/<themeId>.fdraft-theme` (see docs/updates, "EVENT STUDIO — PHASE
 * 1" §12) via a plain same-origin `fetch` — this works identically in the
 * normal web build and the Tauri desktop build: Next's `output: "export"`
 * copies `public/` verbatim into the static bundle Tauri serves from
 * (`frontendDist`), so this relative path resolves to the SAME file on
 * disk either way, with no network dependency at all once the app itself
 * has loaded.
 *
 * Deliberately goes through the exact same `parseFDraftThemeText` text-
 * in, validated-result-out pipeline the Admin QA import flow uses (see
 * `theme-preview-override-store.ts`'s doc comment, and §10's "one shared
 * production renderer" requirement extended to loading) — a bundled
 * canonical theme and a hand-imported one are validated identically,
 * never through two different code paths that could quietly diverge.
 *
 * Returns a parse failure (never throws) for a missing file (a 404
 * response's `.text()` is typically an HTML error page, which
 * `parseFDraftThemeText` correctly rejects as invalid JSON) — an event
 * with no bundled theme yet is a normal, expected state (see §12's
 * "Christmas can remain a scaffold"), not a crash.
 */
export async function loadCanonicalEventTheme(
  themeId: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<FDraftThemeParseResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`/event-themes/${themeId}.fdraft-theme`);
    if (!response.ok) {
      return {
        ok: false,
        reason: "invalid_json",
        message: `No bundled theme found for "${themeId}" (HTTP ${response.status}).`,
      };
    }
    const text = await response.text();
    return parseFDraftThemeText(text);
  } catch (cause) {
    return {
      ok: false,
      reason: "invalid_json",
      message:
        cause instanceof Error
          ? `Could not load theme "${themeId}": ${cause.message}`
          : `Could not load theme "${themeId}".`,
    };
  }
}
