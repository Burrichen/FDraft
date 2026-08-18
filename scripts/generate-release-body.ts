#!/usr/bin/env -S pnpm dlx tsx
/**
 * Generates the GitHub Release body text for the newest entry in
 * `PATCH_NOTES` — the same structured data source the in-app Patch Notes
 * viewer reads (see `src/domain/updates/patch-notes.ts`) — so the
 * release's `notes` field is never out of sync with what FDraft itself
 * displays.
 *
 * This matters more than it sounds: `tauri-action`'s `releaseBody` input
 * is what gets baked into `latest.json` at BUILD time — the file the
 * updater actually fetches (see `application/updates/tauri-updater.ts`).
 * Editing a GitHub Release's description afterward, by hand, in the web
 * UI (the previously-documented step 6 of the release procedure) never
 * touches that already-uploaded file, so the in-app update dialog was
 * always showing whatever static string this workflow passed in at
 * build time — not whatever the developer typed into the release page
 * afterward. Generating the real body here, before the build, is what
 * actually fixes that (see docs/updates, v1.1.0, "UPDATE POPUP FIXES").
 *
 * Run by `.github/workflows/release.yml`; prints the generated body to
 * stdout so the workflow can capture it into `$GITHUB_OUTPUT`. Fails
 * loudly (non-zero exit) if `PATCH_NOTES`'s newest entry doesn't match
 * `package.json`'s version — the same class of "forgot a step before
 * tagging" mistake the workflow's own tag/version check already guards
 * against, extended to cover this file too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PATCH_NOTES } from "../src/domain/updates/patch-notes";

const ROOT = path.resolve(import.meta.dirname, "..");

const [latest] = PATCH_NOTES;
if (!latest) {
  throw new Error(
    "PATCH_NOTES is empty — nothing to generate a release body from.",
  );
}

const { version } = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as { version: string };

if (latest.version !== version) {
  throw new Error(
    `PATCH_NOTES' newest entry is v${latest.version}, but package.json is v${version} — add a v${version} entry to src/domain/updates/patch-notes.ts (and PATCH_NOTES.md) before tagging a release.`,
  );
}

const sections = latest.sections
  .map((section) => {
    const items = section.items.map((item) => `- ${item}`).join("\n");
    return `#### ${section.heading}\n\n${items}`;
  })
  .join("\n\n");

process.stdout.write(
  `### v${latest.version} — ${latest.nickname}\n\n${sections}\n`,
);
