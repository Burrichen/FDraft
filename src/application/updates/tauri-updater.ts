import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";

/**
 * Thin wrapper around `@tauri-apps/plugin-updater`/`@tauri-apps/plugin-process`
 * — the only module allowed to import them directly (see
 * docs/product-spec.md, "USER-FRIENDLY AUTO-UPDATES"). Maps their API onto
 * plain, JSON-safe result types so `update-provider.tsx`'s state machine
 * (and its tests) never touch a Tauri `Resource` or need a real webview.
 * Every function here is designed to fail SOFT — a network error, an
 * unreachable GitHub, or a malformed manifest becomes an `{ status:
 * "error" }` result, never a thrown/unhandled rejection, so a broken
 * update check can never make FDraft itself unusable (see "CHECK
 * FREQUENCY": "FDraft must remain fully usable").
 */

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  /** The GitHub release's body text, shown as-is (short, hand-written release notes — never a raw commit log, see "RELEASE NOTES"). `null` if the release has none. */
  releaseNotes: string | null;
}

/** Opaque handle back to the underlying Tauri `Update` resource — carried by a caller from a successful check to the later install call, rather than this module keeping hidden mutable state (see this file's own doc comment). */
export interface UpdateHandle {
  readonly _update: Update;
}

export type UpdateCheckResult =
  | { status: "up-to-date" }
  | { status: "available"; info: UpdateInfo; handle: UpdateHandle }
  | { status: "error"; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (!update) {
      return { status: "up-to-date" };
    }
    return {
      status: "available",
      info: {
        version: update.version,
        currentVersion: update.currentVersion,
        releaseNotes: update.body ?? null,
      },
      handle: { _update: update },
    };
  } catch (cause) {
    return {
      status: "error",
      message: messageFrom(cause, "Update check failed"),
    };
  }
}

export type InstallProgress =
  | { phase: "started"; totalBytes: number | null }
  /** `percent` is `null` when the release's content length wasn't reported — the UI shows an indeterminate state rather than a fake percentage. */
  | { phase: "progress"; percent: number | null }
  | { phase: "finished" };

export type InstallResult =
  { status: "installed" } | { status: "error"; message: string };

/** Downloads and installs the update the handle was returned for. Per the currently-configured NSIS updater mode, this replaces the installed application files but does NOT restart FDraft itself — the caller decides when to call `relaunchApp()` (see "UPDATE DIALOG": "No unexpected invisible restart"). */
export async function downloadAndInstallUpdate(
  handle: UpdateHandle,
  onProgress?: (progress: InstallProgress) => void,
): Promise<InstallResult> {
  let totalBytes = 0;
  let downloadedBytes = 0;
  try {
    await handle._update.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case "Started":
          totalBytes = event.data.contentLength ?? 0;
          onProgress?.({ phase: "started", totalBytes: totalBytes || null });
          break;
        case "Progress":
          downloadedBytes += event.data.chunkLength;
          onProgress?.({
            phase: "progress",
            percent:
              totalBytes > 0
                ? Math.min(
                    100,
                    Math.round((downloadedBytes / totalBytes) * 100),
                  )
                : null,
          });
          break;
        case "Finished":
          onProgress?.({ phase: "finished" });
          break;
      }
    });
    return { status: "installed" };
  } catch (cause) {
    return {
      status: "error",
      message: messageFrom(cause, "Update download/install failed"),
    };
  }
}

/** Restarts FDraft to finish an already-installed update — only ever called from the user's own explicit "Restart FDraft" click, never automatically. */
export async function relaunchApp(): Promise<void> {
  await relaunch();
}
