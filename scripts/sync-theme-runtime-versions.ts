import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Materializes the exact installed `@fdraft/theme-sdk`/
 * `@fdraft/theme-renderer` package versions into a small generated TS
 * module (see docs/updates, "FDRAFT THEME RUNTIME — PROMPT 10") — neither
 * package exports its own `package.json` as an importable subpath (a
 * correctly restrictive `exports` map), so there is no direct way for
 * application code to read its own installed version at import time.
 * Same generate-then-check convention this repo already uses for
 * `scripts/sync-desktop-version.ts` — run manually (`pnpm run
 * sync-theme-runtime-versions`) whenever the pinned
 * `@fdraft/theme-sdk`/`@fdraft/theme-renderer` version changes, never
 * automatically on every `pnpm install`. Run with `--check` (used by CI
 * via `pnpm run check-theme-runtime-versions`) to verify there's no
 * drift instead of writing.
 */

const OUTPUT_PATH = fileURLToPath(
  new URL(
    "../src/infrastructure/theme-runtime/installed-versions.generated.ts",
    import.meta.url,
  ),
);

function installedVersion(pkg: "theme-sdk" | "theme-renderer"): string {
  const raw = readFileSync(`node_modules/@fdraft/${pkg}/package.json`, "utf-8");
  return (JSON.parse(raw) as { version: string }).version;
}

function render(sdkVersion: string, rendererVersion: string): string {
  return `// GENERATED FILE — do not edit by hand.
// Regenerate with \`pnpm run sync-theme-runtime-versions\`; verify with
// \`pnpm run check-theme-runtime-versions\`. See
// scripts/sync-theme-runtime-versions.ts.

export const INSTALLED_THEME_SDK_VERSION = "${sdkVersion}";
export const INSTALLED_THEME_RENDERER_VERSION = "${rendererVersion}";
`;
}

function main() {
  const sdkVersion = installedVersion("theme-sdk");
  const rendererVersion = installedVersion("theme-renderer");
  const rendered = render(sdkVersion, rendererVersion);

  const checkOnly = process.argv.includes("--check");
  if (checkOnly) {
    const current = readFileSync(OUTPUT_PATH, "utf-8");
    if (current !== rendered) {
      console.error(
        "Theme runtime version constants are stale — run `pnpm run sync-theme-runtime-versions`.",
      );
      process.exit(1);
    }
    console.log("Theme runtime version constants are up to date.");
    return;
  }

  writeFileSync(OUTPUT_PATH, rendered);
  console.log(
    `Synced ${OUTPUT_PATH} -> theme-sdk ${sdkVersion}, theme-renderer ${rendererVersion}`,
  );
}

main();
