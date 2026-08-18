/**
 * Parses a GitHub release's own body text (already fetched by the Tauri
 * updater as part of an update check — see `application/updates/
 * tauri-updater.ts`'s `UpdateInfo.releaseNotes`) into a title/nickname and
 * the remaining notes — see docs/updates, v1.0.3 "Now Updating", "SHOW
 * PATCH NOTES DURING MANUAL UPDATE CHECKS": "Reuse existing release/
 * update metadata rather than duplicating patch-note data." There is no
 * separate remote patch-notes fetch here: a future version's notes only
 * ever exist on its own GitHub release, never inside the OLDER, currently
 * running binary's bundled `domain/updates/patch-notes.ts` (that file
 * only ever describes versions that existed when THIS binary was built).
 *
 * Expects FDraft's own release-note convention (the same heading used in
 * `PATCH_NOTES.md` and the in-app Patch Notes viewer): a first line like
 * `### v1.0.3 — Now Updating`. Any release published without that
 * convention — or with no body at all — degrades gracefully: no title,
 * and the raw body (if any) is shown as-is, UNLESS that raw body is
 * recognizably the generic installer boilerplate `tauri-action` used to
 * bake into every release before v1.1.0 (see docs/updates, v1.1.0,
 * "UPDATE POPUP FIXES") — that text describes downloading a `.exe` from
 * a GitHub releases page, which makes no sense inside an in-app updater
 * flow that already handles the download itself, so it's treated as "no
 * notes" rather than shown verbatim.
 */
export interface ParsedReleaseNotes {
  /** The nickname after the version, e.g. "Now Updating" — `null` if the body doesn't start with FDraft's own heading convention. */
  title: string | null;
  /** The body with the leading heading line (if matched) stripped — `null` if there is nothing left to show, or if it was only ever generic installer instructions. */
  notes: string | null;
}

const HEADING_PATTERN = /^#{0,6}\s*v?\d+(?:\.\d+){1,2}\s*(?:[—-]\s*(.+))?\s*$/;

/** Matches fragments of the old static `releaseBody` — see `.github/workflows/release.yml`'s history and `scripts/generate-release-body.ts`'s doc comment. */
const GENERIC_INSTALLER_PATTERNS = [/see the assets below/i, /setup\.exe/i];

function isGenericInstallerBoilerplate(text: string): boolean {
  return GENERIC_INSTALLER_PATTERNS.some((pattern) => pattern.test(text));
}

export function parseReleaseNotes(
  body: string | null | undefined,
): ParsedReleaseNotes {
  if (!body || body.trim().length === 0) {
    return { title: null, notes: null };
  }

  const lines = body.split(/\r?\n/);
  let firstContentIndex = 0;
  while (
    firstContentIndex < lines.length &&
    lines[firstContentIndex].trim() === ""
  ) {
    firstContentIndex++;
  }

  const firstLine = lines[firstContentIndex]?.trim() ?? "";
  const match = HEADING_PATTERN.exec(firstLine);
  if (!match || !match[1]) {
    const trimmed = body.trim();
    return {
      title: null,
      notes: isGenericInstallerBoilerplate(trimmed) ? null : trimmed,
    };
  }

  const rest = lines
    .slice(firstContentIndex + 1)
    .join("\n")
    .trim();
  return {
    title: match[1].trim(),
    notes:
      rest.length > 0 && !isGenericInstallerBoilerplate(rest) ? rest : null,
  };
}
