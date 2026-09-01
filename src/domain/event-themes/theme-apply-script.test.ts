import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * A real, end-to-end smoke test of `scripts/theme-apply.ts` (see
 * docs/updates, "EVENT STUDIO — PHASE 1" §15/§17) — actually invokes the
 * script via `tsx` as a genuine subprocess (not a re-import of its
 * internals), the same way `npm run theme:apply -- <file>` does, against
 * a scratch theme id so it can never collide with (or need to restore) a
 * real canonical file. Lives under `src/` (not next to the script itself
 * in `scripts/`) purely because that's this project's vitest `include`
 * glob — see `vitest.config.ts`.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRATCH_THEME_ID = "_test-apply-scratch";
const CANONICAL_TARGET = path.join(
  REPO_ROOT,
  "public",
  "event-themes",
  `${SCRATCH_THEME_ID}.fdraft-theme`,
);

function runThemeApply(filePath: string): {
  status: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/theme-apply.ts", filePath],
      {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        // On Windows, `pnpm` (and `npx`) resolve to a `.cmd` shim —
        // `execFileSync` can't launch those directly without a shell, and
        // fails to spawn at all (a `null` exit status, no real stdout/
        // stderr captured) rather than actually running the script — the
        // same issue `build-desktop-frontend.ts`/`studio-dev-frontend.ts`
        // already document and guard against for their own `spawnSync`
        // calls.
        shell: process.platform === "win32",
      },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (cause) {
    const error = cause as {
      status: number | null;
      stdout: string | null;
      stderr: string | null;
    };
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

describe("scripts/theme-apply.ts (real subprocess invocation)", () => {
  let scratchFile: string | null = null;

  afterEach(() => {
    if (existsSync(CANONICAL_TARGET)) {
      unlinkSync(CANONICAL_TARGET);
    }
    if (scratchFile) {
      rmSync(path.dirname(scratchFile), { recursive: true, force: true });
      scratchFile = null;
    }
  });

  it("validates and copies a well-formed theme to the canonical location, printing what changed", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fdraft-theme-apply-"));
    scratchFile = path.join(dir, "scratch.fdraft-theme");
    writeFileSync(
      scratchFile,
      JSON.stringify({
        schemaVersion: 1,
        themeId: SCRATCH_THEME_ID,
        eventId: SCRATCH_THEME_ID,
        scope: "event",
        assets: {},
        layouts: {},
      }),
    );

    const result = runThemeApply(scratchFile);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/created/i);
    expect(existsSync(CANONICAL_TARGET)).toBe(true);
  });

  it("reports 'already up to date' and makes no further write on a second identical run", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fdraft-theme-apply-"));
    scratchFile = path.join(dir, "scratch.fdraft-theme");
    writeFileSync(
      scratchFile,
      JSON.stringify({
        schemaVersion: 1,
        themeId: SCRATCH_THEME_ID,
        eventId: SCRATCH_THEME_ID,
        scope: "event",
        assets: {},
        layouts: {},
      }),
    );

    runThemeApply(scratchFile);
    const second = runThemeApply(scratchFile);

    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/already up to date/i);
  });

  it("refuses malformed JSON, exits non-zero, and never writes a canonical file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fdraft-theme-apply-"));
    scratchFile = path.join(dir, "scratch.fdraft-theme");
    writeFileSync(scratchFile, "{ not valid json");

    const result = runThemeApply(scratchFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not valid json/i);
    expect(existsSync(CANONICAL_TARGET)).toBe(false);
  });

  it("refuses a theme with an unsupported (future) schema version", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fdraft-theme-apply-"));
    scratchFile = path.join(dir, "scratch.fdraft-theme");
    writeFileSync(
      scratchFile,
      JSON.stringify({
        schemaVersion: 999,
        themeId: SCRATCH_THEME_ID,
        eventId: SCRATCH_THEME_ID,
        scope: "event",
      }),
    );

    const result = runThemeApply(scratchFile);

    expect(result.status).not.toBe(0);
    expect(existsSync(CANONICAL_TARGET)).toBe(false);
  });

  it("refuses when no file argument is given", () => {
    const result = runThemeApply("");
    expect(result.status).not.toBe(0);
  });
});
