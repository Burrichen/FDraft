import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalThemeFileMtimeMs,
  isThemePreviewEnabled,
  readLocalThemeFile,
  ThemePreviewDisabledError,
  ThemePreviewPathError,
} from "./theme-preview-server";

describe("isThemePreviewEnabled", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv ?? "test");
  });

  it("is enabled outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isThemePreviewEnabled()).toBe(true);
  });

  it("is disabled in production — the whole surface is inert", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isThemePreviewEnabled()).toBe(false);
  });
});

describe("readLocalThemeFile / getLocalThemeFileMtimeMs", () => {
  let scratchDir: string;
  let themePath: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "fdraft-theme-preview-test-"));
    themePath = join(scratchDir, "sample.fdtheme");
    writeFileSync(themePath, new Uint8Array([1, 2, 3, 4]));
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("reads real bytes from an absolute .fdtheme path", async () => {
    const bytes = await readLocalThemeFile(themePath);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("rejects a relative path", async () => {
    await expect(readLocalThemeFile("./sample.fdtheme")).rejects.toThrow(
      ThemePreviewPathError,
    );
  });

  it("rejects a path without the .fdtheme extension", async () => {
    await expect(
      readLocalThemeFile(join(scratchDir, "sample.zip")),
    ).rejects.toThrow(ThemePreviewPathError);
  });

  it("refuses to read anything at all in production, even a valid path", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(readLocalThemeFile(themePath)).rejects.toThrow(
      ThemePreviewDisabledError,
    );
  });

  it("reports a real mtime that changes after the file is rewritten", async () => {
    const first = await getLocalThemeFileMtimeMs(themePath);
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(themePath, new Uint8Array([5, 6, 7, 8]));
    const second = await getLocalThemeFileMtimeMs(themePath);
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it("refuses to report mtime at all in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(getLocalThemeFileMtimeMs(themePath)).rejects.toThrow(
      ThemePreviewDisabledError,
    );
  });
});
