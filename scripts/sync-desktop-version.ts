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
 * Run automatically before `desktop:dev`/`build:desktop-frontend` (see
 * package.json); safe to run manually at any other time too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const { version } = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as { version: string };

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(
    `package.json's version ("${version}") isn't a plain x.y.z — Tauri's config requires exactly that format.`,
  );
}

const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8")) as {
  version: string;
};
if (tauriConf.version !== version) {
  tauriConf.version = version;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
  console.log(`Synced src-tauri/tauri.conf.json version -> ${version}`);
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
