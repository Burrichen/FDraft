#!/usr/bin/env -S pnpm dlx tsx
/**
 * `npm run theme:apply -- <file>` (see docs/updates, "EVENT STUDIO —
 * PHASE 1" §15) — the simple repository-side workflow for taking a valid
 * exported `.fdraft-theme` file and making it canonical, so a developer
 * never has to manually copy JSON fragments into `public/event-themes/`
 * by hand. Validates through the EXACT SAME `parseFDraftThemeText`
 * pipeline the app itself uses (imported directly, not reimplemented) —
 * a file this script accepts is guaranteed to be one the app itself
 * would also accept, and vice versa.
 *
 * Copies the file's own raw text verbatim (never re-serializes it) —
 * preserving whatever formatting/comments-adjacent whitespace the
 * exporting tool produced, so the resulting git diff shows exactly what
 * changed, nothing more.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFDraftThemeText } from "../src/domain/event-themes/fdraft-theme-schema";

const ROOT = path.resolve(import.meta.dirname, "..");
const THEME_DIR = path.join(ROOT, "public", "event-themes");

function fail(message: string): never {
  console.error(`theme:apply — ${message}`);
  process.exit(1);
}

// `pnpm run theme:apply -- <file>` forwards a literal `--` separator
// through to this script's own argv in some pnpm/npm versions — skip it
// rather than assuming a fixed argv index.
const inputPath = process.argv.slice(2).find((arg) => arg !== "--");
if (!inputPath) {
  fail("Usage: npm run theme:apply -- <path-to-file.fdraft-theme>");
}

const resolvedInputPath = path.resolve(process.cwd(), inputPath);
if (!existsSync(resolvedInputPath)) {
  fail(`No such file: ${resolvedInputPath}`);
}

const text = readFileSync(resolvedInputPath, "utf-8");
const result = parseFDraftThemeText(text);
if (!result.ok) {
  fail(
    `"${inputPath}" is not a valid .fdraft-theme file (${result.reason}): ${result.message}`,
  );
}

const { theme } = result;
const targetPath = path.join(THEME_DIR, `${theme.themeId}.fdraft-theme`);
const previousText = existsSync(targetPath)
  ? readFileSync(targetPath, "utf-8")
  : null;

if (previousText === text) {
  console.log(
    `theme:apply — "${theme.themeId}" is already up to date (public/event-themes/${theme.themeId}.fdraft-theme unchanged).`,
  );
  process.exit(0);
}

writeFileSync(targetPath, text);

console.log(
  previousText === null
    ? `theme:apply — created public/event-themes/${theme.themeId}.fdraft-theme (scope: ${theme.scope}, eventId: ${theme.eventId ?? "none"}).`
    : `theme:apply — updated public/event-themes/${theme.themeId}.fdraft-theme (scope: ${theme.scope}, eventId: ${theme.eventId ?? "none"}).`,
);
console.log(`  Pages: ${Object.keys(theme.layouts).join(", ") || "(none)"}`);
console.log(`  Assets declared: ${Object.keys(theme.assets).length}`);
