#!/usr/bin/env -S pnpm dlx tsx
/**
 * The frontend half of `studio:dev` (see docs/updates, "EVENT STUDIO —
 * PHASE 2" §1/§5) — starts the exact same Next.js dev server `pnpm dev`
 * would, with ONE difference: `NEXT_PUBLIC_EVENT_STUDIO=1` set for this
 * process only, so `isEventStudioBuild` (`src/lib/event-studio-build.ts`)
 * resolves `true` for whatever window loads this dev server.
 * `tauri.studio.conf.json` (merged in via `tauri dev --config`) points
 * its own `beforeDevCommand` at this script rather than a plain
 * `"pnpm dev"`.
 *
 * Sets the env var through Node's own `env` object (not a shell
 * `VAR=1 cmd` prefix) — that syntax isn't portable to Windows' default
 * shell, the same reasoning `build-desktop-frontend.ts` already
 * documents for its own env injection.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");

const result = spawnSync("pnpm", ["exec", "next", "dev"], {
  cwd: ROOT,
  stdio: "inherit",
  // On Windows, `pnpm` resolves to a `.cmd` shim — spawnSync can't launch
  // those directly without a shell.
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_PUBLIC_EVENT_STUDIO: "1" },
});
process.exit(result.status ?? 1);
