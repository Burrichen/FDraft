import type { WorkspaceAssetEntry } from "@/domain/event-studio/workspace-asset";
import { isDesktopRuntime } from "./desktop-runtime";

/**
 * The native half of the Event Art Workspace setting (see docs/updates,
 * "EVENT STUDIO — PHASE 2" §7/§8) — the only file in the app that imports
 * `@tauri-apps/plugin-dialog`/`@tauri-apps/plugin-opener`'s `open` for
 * this feature, so every caller goes through one small, testable seam
 * instead of reaching for those packages directly. A packaged Dev build
 * cannot safely assume it can read/write its OWN installed asset files —
 * this is what lets it instead point at a real checked-out FDraft Git
 * working copy on disk.
 *
 * Every function here degrades gracefully to `null`/`false` rather than
 * throwing when not running inside the Tauri desktop shell (see
 * `isDesktopRuntime`) — e.g. the studio-flagged frontend opened directly
 * in a plain browser tab for quick iteration, where no native dialog
 * exists at all. Callers use that to disable "Change Folder"/"Open
 * Folder" gracefully rather than crashing (§8: "Git-specific convenience
 * actions are disabled gracefully").
 */

export interface WorkspaceValidationResult {
  valid: boolean;
  missing: string[];
}

/** Opens the native "choose a folder" dialog. `null` means the user cancelled, OR the dialog isn't available in this runtime — callers treat both identically (no folder chosen). */
export async function pickEventArtWorkspaceFolder(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      title: "Select the FDraft repository/workspace folder",
    });
    return typeof selected === "string" ? selected : null;
  } catch {
    return null;
  }
}

/**
 * Checks a chosen folder for the expected FDraft repo markers (see §8:
 * "Validate a selected folder before accepting it") via a Rust command
 * (`validate_event_art_workspace_folder`, `src-tauri/src/lib.rs`) — a
 * plain read-only `std::fs` check, never anything that could write inside
 * the chosen folder. Returns `{ valid: false, missing: [...] }` (never
 * throws) when not running inside Tauri at all, so a caller's UI can show
 * a consistent "couldn't validate" state either way.
 */
export async function validateEventArtWorkspaceFolder(
  path: string,
): Promise<WorkspaceValidationResult> {
  if (!isDesktopRuntime()) {
    return { valid: false, missing: ["Not running inside the desktop app."] };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<WorkspaceValidationResult>(
      "validate_event_art_workspace_folder",
      { path },
    );
  } catch (cause) {
    return {
      valid: false,
      missing: [cause instanceof Error ? cause.message : "Validation failed."],
    };
  }
}

/** Opens the given path in the OS's file explorer, via the SAME `opener` plugin already used elsewhere in this app (`tauri-plugin-opener`) — no separate mechanism. A no-op (not an error) outside the desktop runtime. */
export async function openEventArtWorkspaceFolder(path: string): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(path);
  } catch {
    // Best-effort convenience action — never surfaced as an app error.
  }
}

/**
 * Opens the native "choose a file" dialog restricted to the recognised
 * image formats (see docs/updates, "EVENT STUDIO — PHASE 9" §3: "Import
 * Image... at minimum .png .webp .svg") — the source half of Import; the
 * chosen path is later handed to `copyEventArtAsset` unchanged. `null`
 * means the user cancelled, OR the dialog isn't available in this
 * runtime — callers treat both identically (no file chosen).
 */
export async function pickImportSourceFile(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Choose an image to import",
      filters: [{ name: "Images", extensions: ["png", "webp", "svg"] }],
    });
    return typeof selected === "string" ? selected : null;
  } catch {
    return null;
  }
}

/**
 * Copies `sourcePath` (an arbitrary path on disk, from
 * `pickImportSourceFile`) into the connected workspace at
 * `public/events/<eventId>/<category>/<fileName>` — the ONE function
 * backing both Import Image (§3) and Replace Image (§6); the only
 * difference is whether the destination already exists, which the
 * CALLER checks (via `checkEventArtWorkspaceAssetPaths`) and confirms
 * with the user BEFORE calling this — this always writes unconditionally
 * the moment it's called, same convention as `writeCanonicalThemeFile`.
 * Returns the new asset's project-relative path
 * (`"events/<eventId>/<category>/<fileName>"`) on success, ready to
 * register straight into a theme's `assets` map — see §7: "the repo
 * asset is source of truth," never a second copy anywhere else.
 */
export async function copyEventArtAsset(
  path: string,
  sourcePath: string,
  eventId: string,
  category: string,
  fileName: string,
): Promise<{ ok: true; relativePath: string } | { ok: false; error: string }> {
  if (!isDesktopRuntime()) {
    return { ok: false, error: "Not running inside the desktop app." };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const relativePath = await invoke<string>("copy_event_art_asset", {
      path,
      sourcePath,
      eventId,
      category,
      fileName,
    });
    return { ok: true, relativePath };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : "Could not import the file.",
    };
  }
}

/**
 * Deletes one asset file from the connected workspace (see §14) — the
 * CALLER is responsible for checking/warning about theme references
 * first (see `theme-asset-refs.ts`'s reference-lookup helpers); this
 * only performs the actual file removal.
 */
export async function deleteEventArtAsset(
  path: string,
  relativeAssetPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktopRuntime()) {
    return { ok: false, error: "Not running inside the desktop app." };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_event_art_asset", { path, relativeAssetPath });
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : "Could not delete the file.",
    };
  }
}

/**
 * The current project root, ONLY when this really is a dev-from-source
 * launch (see §12: "automatically detect the current project root where
 * practical... do not make me reselect the repository every single dev
 * launch") — `get_dev_project_root` itself is gated on
 * `cfg!(debug_assertions)` at COMPILE time, so a packaged release build
 * always gets `null` here regardless of what's on disk (see that
 * command's own doc comment for why). `null` outside the desktop
 * runtime too, same as every other function here.
 */
export async function getDevProjectRoot(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string | null>("get_dev_project_root");
  } catch {
    return null;
  }
}

/**
 * Live-scans the connected workspace's asset folders via the
 * `scan_event_art_workspace_assets` Rust command (see §2: "New files
 * placed into the event folder should become available after
 * refresh/rescan without code changes") — a plain read-only `std::fs`
 * walk, same convention as `validateEventArtWorkspaceFolder`. Resolves to
 * an empty list (never throws) outside the desktop runtime, or if the
 * scan itself fails for any reason — the Asset Browser treats both
 * identically ("nothing found").
 */
export async function scanEventArtWorkspaceAssets(
  path: string,
): Promise<WorkspaceAssetEntry[]> {
  if (!isDesktopRuntime()) {
    return [];
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<WorkspaceAssetEntry[]>(
      "scan_event_art_workspace_assets",
      { path },
    );
  } catch {
    return [];
  }
}

/**
 * Reads one workspace asset's bytes as a `data:` URI, for a thumbnail or
 * canvas placement — via `read_event_art_workspace_asset`, which
 * defensively re-validates `relativeAssetPath` against the same
 * `events/<id>/<category>/<file>` shape `scanEventArtWorkspaceAssets`
 * itself produces (see that command's own doc comment for why a `data:`
 * URI, not the Tauri asset protocol, is used for a user-chosen folder
 * outside the app's own bundle). `null` outside the desktop runtime, or
 * on any read failure — callers treat that as "no thumbnail available,"
 * never a hard error.
 */
export async function readEventArtWorkspaceAsset(
  path: string,
  relativeAssetPath: string,
): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("read_event_art_workspace_asset", {
      path,
      relativeAssetPath,
    });
  } catch {
    return null;
  }
}

/**
 * Live-checks whether each of `relativePaths` (values straight out of a
 * theme's own `assets` map, e.g. `"events/halloween/interactives/ghost-1.png"`)
 * actually exists as a real file in the connected workspace right now —
 * see docs/updates, "EVENT STUDIO — PHASE 6" §11: schema validation alone
 * only proves a theme's `assetId` keys are internally consistent, never
 * that the FILES they point at are still on disk. Every path maps to
 * `false` (never throws) outside the desktop runtime, or on any failure —
 * the Asset Validation panel treats "couldn't check" and "confirmed
 * missing" as the same actionable state (don't claim something is fine
 * when it wasn't actually verified).
 */
export async function checkEventArtWorkspaceAssetPaths(
  path: string,
  relativePaths: string[],
): Promise<Record<string, boolean>> {
  if (!isDesktopRuntime() || relativePaths.length === 0) {
    return Object.fromEntries(relativePaths.map((p) => [p, false]));
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<Record<string, boolean>>(
      "check_event_art_workspace_asset_paths",
      { path, relativePaths },
    );
  } catch {
    return Object.fromEntries(relativePaths.map((p) => [p, false]));
  }
}

/**
 * Reads the CURRENT canonical `.fdraft-theme` file at its Phase-1
 * location (`public/event-themes/<themeId>.fdraft-theme`) in the
 * connected workspace, if one exists — used immediately before "Export
 * to FDraft Repo" overwrites it, to capture a backup revision first (see
 * §12). `null` both when nothing exists yet AND on any read failure —
 * callers can't tell the two apart, which is fine: either way there's no
 * "before" content to back up, and the write itself will surface a real
 * error if something is genuinely wrong with the workspace.
 */
export async function readCanonicalThemeFile(
  path: string,
  themeId: string,
): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string | null>("read_canonical_theme_file", {
      path,
      themeId,
    });
  } catch {
    return null;
  }
}

/**
 * Writes `contents` to the canonical theme location in the connected
 * workspace — see §12: "Export to FDraft Repo... Do not run Git commit/
 * push automatically" (this only ever calls `std::fs::write`, see
 * `write_canonical_theme_file`'s own doc comment). Confirmation and the
 * backup-revision step both happen in the CALLER, before this runs —
 * this function always writes unconditionally the moment it's called.
 */
export async function writeCanonicalThemeFile(
  path: string,
  themeId: string,
  contents: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDesktopRuntime()) {
    return { ok: false, error: "Not running inside the desktop app." };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_canonical_theme_file", { path, themeId, contents });
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error
          ? cause.message
          : "Could not write the theme file.",
    };
  }
}
