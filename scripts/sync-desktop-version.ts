#!/usr/bin/env -S pnpm dlx tsx
/**
 * `package.json`'s `version` is the single authoritative source for
 * FDraft's application version (see docs/product-spec.md's Tauri
 * integration notes, "VERSIONING": "Do not duplicate version strings
 * throughout the source"). Tauri needs its own copies in
 * `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` — neither format
 * supports referencing an external file — so this syncs both from
 * `package.json` rather than letting them drift independently.
 *
 * Also derives BETA BRANDING from that same version string (see
 * docs/updates, "BETA APP IDENTITY"): a version with a semver
 * pre-release suffix (e.g. "1.2.0-beta.5") is a hands-on-testing build,
 * so its installer/app name reads "FDraft (Beta)" and it ships the pale-
 * blue icon set under `icons/beta/` instead of the normal green one —
 * entirely so a beta install is visually distinguishable at a glance
 * from a real release, including sitting side-by-side in the Start Menu.
 * A plain version (no `-` suffix) always resolves back to the normal
 * "FDraft" name/icon, so this never needs manually reverting after a
 * beta cycle ends.
 *
 * Run automatically before `desktop:dev`/`build:desktop-frontend` (see
 * package.json); safe to run manually at any other time too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

interface TauriConf {
  version: string;
  productName: string;
  app: { windows: Array<{ title: string; [key: string]: unknown }> };
  bundle: { icon: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

async function main() {
  // Dynamic import, not a top-level `import * as prettier` — `tsx` runs
  // this file with a CJS output format, which supports neither top-level
  // `await` nor this specific dual CJS/ESM package's synchronous
  // `require()` interop (`ERR_REQUIRE_ASYNC_MODULE`). Wrapping everything
  // in this `main()` sidesteps both.
  const prettier = await import("prettier");

  const { version } = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf8"),
  ) as { version: string };

  // Full semver core plus an optional pre-release suffix (e.g.
  // "1.2.0-beta.1") — both tauri.conf.json and Cargo.toml's `version`
  // fields accept this via the `semver` crate, same as npm/Cargo itself,
  // so pre-release builds sync through cleanly rather than needing a
  // separate un-tagged version scheme.
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error(
      `package.json's version ("${version}") isn't a valid semver core (x.y.z, optionally with a -prerelease suffix) — Tauri's config requires that format.`,
    );
  }

  const isBeta = version.includes("-");
  const productName = isBeta ? "FDraft (Beta)" : "FDraft";
  const iconDir = isBeta ? "icons/beta" : "icons";

  const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");
  const originalTauriConfText = readFileSync(tauriConfPath, "utf8");
  const tauriConf = JSON.parse(originalTauriConfText) as TauriConf;

  tauriConf.version = version;
  tauriConf.productName = productName;
  tauriConf.app.windows[0].title = productName;
  tauriConf.bundle.icon = [
    `${iconDir}/32x32.png`,
    `${iconDir}/128x128.png`,
    `${iconDir}/128x128@2x.png`,
    `${iconDir}/icon.icns`,
    `${iconDir}/icon.ico`,
  ];

  // Formatted through Prettier itself (the project's own resolved
  // config), not a bare `JSON.stringify(..., null, 2)` — that always
  // breaks a short array like `bundle.targets`/`bundle.icon` onto
  // multiple lines, which Prettier itself collapses onto one, so every
  // run of this script used to silently re-introduce a `pnpm
  // format:check` failure the very next time it ran.
  const prettierConfig = await prettier.resolveConfig(tauriConfPath);
  const updatedTauriConfText = await prettier.format(
    JSON.stringify(tauriConf, null, 2),
    { ...prettierConfig, filepath: tauriConfPath },
  );
  if (updatedTauriConfText !== originalTauriConfText) {
    writeFileSync(tauriConfPath, updatedTauriConfText);
    console.log(
      `Synced src-tauri/tauri.conf.json -> version ${version}, productName "${productName}", icons from ${iconDir}/`,
    );
  }

  const cargoTomlPath = path.join(ROOT, "src-tauri/Cargo.toml");
  const cargoToml = readFileSync(cargoTomlPath, "utf8");
  const updatedCargoToml = cargoToml.replace(
    /^version = "[^"]*"/m,
    `version = "${version}"`,
  );
  if (updatedCargoToml !== cargoToml) {
    writeFileSync(cargoTomlPath, updatedCargoToml);
    console.log(`Synced src-tauri/Cargo.toml version -> ${version}`);
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
