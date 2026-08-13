#!/usr/bin/env -S pnpm dlx tsx
/**
 * Produces the static frontend Tauri's production build consumes (see
 * docs/product-spec.md's Tauri integration notes, "STATIC PRODUCTION
 * FRONTEND") — `next build` with `output: "export"` (set by
 * `next.config.ts` when `NEXT_PUBLIC_TAURI=1`), writing to `./out`.
 *
 * `src/app/api/**` (the two metadata routes) are POST handlers that read
 * the request body — Next's static export only supports GET-only Route
 * Handlers, and fails the build the moment ANY incompatible route exists
 * in the tree, regardless of whether the frontend actually calls it. Since
 * the desktop build never uses these routes at all (its own metadata
 * transport goes through the Tauri HTTP plugin instead — see
 * `src/application/metadata/remote-metadata-client.ts`), this script
 * moves that directory out of `src/app` for the duration of the build and
 * always restores it afterward, success or failure, so `pnpm dev`/`pnpm
 * build` (the web target) are never left broken.
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_DIR = path.join(ROOT, "src/app/api");
const STAGING_DIR = path.join(ROOT, ".desktop-build-staging");
const STAGED_API_DIR = path.join(STAGING_DIR, "api");

function restoreApiDirIfStaged(): void {
  if (existsSync(STAGED_API_DIR) && !existsSync(API_DIR)) {
    renameSync(STAGED_API_DIR, API_DIR);
  }
  if (existsSync(STAGING_DIR)) {
    rmSync(STAGING_DIR, { recursive: true, force: true });
  }
}

// Self-heal first: a previous run that crashed before its `finally` could
// run would otherwise permanently break the web dev/build targets.
restoreApiDirIfStaged();

// `tsconfig.json`'s `include` always lists `.next/dev/types/**/*.ts` (a
// fixed path Next.js itself adds, independent of `distDir`) — a stale copy
// left over from an earlier `next dev` run still references whatever
// routes existed then. If that included the two routes this script is
// about to move out of the way, the build's typecheck phase fails on a
// module that's merely stale on disk, not actually part of this build.
rmSync(path.join(ROOT, ".next/dev"), { recursive: true, force: true });

mkdirSync(STAGING_DIR, { recursive: true });
renameSync(API_DIR, STAGED_API_DIR);

try {
  const result = spawnSync("pnpm", ["exec", "next", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    // On Windows, `pnpm` resolves to a `.cmd` shim — spawnSync can't launch
    // those directly without a shell, and fails silently (no output, no
    // next build banner) rather than actually running the build.
    shell: process.platform === "win32",
    env: { ...process.env, NEXT_PUBLIC_TAURI: "1" },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  restoreApiDirIfStaged();
}
