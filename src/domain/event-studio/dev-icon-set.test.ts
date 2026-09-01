import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Confirms the red FDraft (Dev) icon set (see docs/updates, "EVENT
 * STUDIO — PHASE 2" §2/§11) mirrors the existing beta icon set file-for-
 * file (same filenames Tauri/Windows expects) and is genuinely a
 * different, recoloured file from the normal green base icon — not a
 * placeholder copy. Doesn't decode PNG pixels (no image library in this
 * project) — a raw byte-content diff is a sufficient, cheap regression
 * guard given the file was generated via a real ImageMagick recolour
 * pass, not hand-authored.
 */
const ICONS_DIR = join(import.meta.dirname, "../../../src-tauri/icons");

describe("src-tauri/icons/dev/ — the red FDraft (Dev) icon set", () => {
  it("has exactly the same filenames as the existing beta icon set", () => {
    const betaFiles = readdirSync(join(ICONS_DIR, "beta")).sort();
    const devFiles = readdirSync(join(ICONS_DIR, "dev")).sort();
    expect(devFiles).toEqual(betaFiles);
  });

  it("icon.png is byte-for-byte different from the normal green base icon", () => {
    const base = readFileSync(join(ICONS_DIR, "icon.png"));
    const dev = readFileSync(join(ICONS_DIR, "dev", "icon.png"));
    expect(dev.equals(base)).toBe(false);
  });

  it("icon.png is also different from the beta (pale-blue) icon — a distinct third variant, not a re-used one", () => {
    const beta = readFileSync(join(ICONS_DIR, "beta", "icon.png"));
    const dev = readFileSync(join(ICONS_DIR, "dev", "icon.png"));
    expect(dev.equals(beta)).toBe(false);
  });

  it("every Windows tile/icon file referenced by tauri.studio.conf.json actually exists on disk", () => {
    for (const fileName of [
      "32x32.png",
      "128x128.png",
      "128x128@2x.png",
      "icon.icns",
      "icon.ico",
    ]) {
      const path = join(ICONS_DIR, "dev", fileName);
      expect(() => readFileSync(path)).not.toThrow();
    }
  });
});
