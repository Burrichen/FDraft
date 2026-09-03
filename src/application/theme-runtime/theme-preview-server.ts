import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

/**
 * The server-side half of FDraft's development-only theme preview (see
 * docs/updates, "FDRAFT THEME RUNTIME — PROMPT 10", "an explicitly
 * development-only launch option equivalent to `--theme-preview
 * <local-path>`"). A Next.js dev server has no CLI-arg-to-page channel,
 * so the closest faithful equivalent is a dev-only API route reading a
 * local file path — this module is the pure, independently-testable
 * logic behind that route; `src/app/api/theme-preview/route.ts` is a
 * thin Next.js adapter over it.
 *
 * Every function here is a no-op/throws in production — see
 * `isThemePreviewEnabled` — so this whole surface is INERT the moment
 * `NODE_ENV === "production"`, satisfying "excluded or inert in ordinary
 * release operation" without needing a build-time exclusion step.
 */
export function isThemePreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export class ThemePreviewDisabledError extends Error {
  constructor() {
    super("Theme preview is only available outside production builds.");
    this.name = "ThemePreviewDisabledError";
  }
}

export class ThemePreviewPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemePreviewPathError";
  }
}

/**
 * Reads one local `.fdtheme` file's raw bytes for the preview route.
 * Requires an ABSOLUTE path (never resolved relative to anything a
 * request could influence) and requires the `.fdtheme` extension — this
 * is a developer-supplied filesystem path on their own machine, not
 * user/theme-supplied input, so this only guards against obvious
 * mistakes (a relative path, a wrong file type), not against a hostile
 * caller; that threat model is exactly why this whole module refuses to
 * run at all once `isThemePreviewEnabled()` is false.
 */
export async function readLocalThemeFile(path: string): Promise<Uint8Array> {
  if (!isThemePreviewEnabled()) {
    throw new ThemePreviewDisabledError();
  }
  if (!isAbsolute(path)) {
    throw new ThemePreviewPathError(
      "Theme preview path must be absolute, e.g. /Users/you/my-theme.fdtheme",
    );
  }
  if (!path.endsWith(".fdtheme")) {
    throw new ThemePreviewPathError(
      "Theme preview path must point at a .fdtheme file.",
    );
  }
  const resolved = resolve(path);
  const bytes = await readFile(resolved);
  return new Uint8Array(bytes);
}

/**
 * The local-only reload protocol Prompt 11 can build on (see docs/
 * updates, "FDRAFT THEME RUNTIME — PROMPT 10": "a local-only reload
 * protocol... without exposing a network listener beyond the local
 * machine") — plain mtime polling over the SAME dev-only Next.js route
 * the preview page already loads through (bound to localhost by the dev
 * server itself, never a separate socket/port this module opens). A
 * caller compares the returned value on an interval and reloads the
 * theme when it changes; no push/websocket mechanism is introduced.
 */
export async function getLocalThemeFileMtimeMs(path: string): Promise<number> {
  if (!isThemePreviewEnabled()) {
    throw new ThemePreviewDisabledError();
  }
  if (!isAbsolute(path)) {
    throw new ThemePreviewPathError(
      "Theme preview path must be absolute, e.g. /Users/you/my-theme.fdtheme",
    );
  }
  const stats = await stat(resolve(path));
  return stats.mtimeMs;
}
