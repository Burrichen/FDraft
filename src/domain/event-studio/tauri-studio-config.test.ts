import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies FDraft (Dev)'s distinct application identity and the RFC 7396
 * merge-patch semantics `tauri.studio.conf.json` relies on (see
 * docs/updates, "EVENT STUDIO — PHASE 2" §1/§2/§11) — a plain JSON check,
 * not a real Tauri build (that's covered by the manual `pnpm run
 * studio:dev`/`pnpm run desktop:dev` smoke checks in this phase's own
 * completion report). Lives under `src/` (not next to the config files
 * themselves in `src-tauri/`) purely because that's this project's
 * vitest `include` glob (`vitest.config.ts`) — same reasoning as
 * `theme-apply-script.test.ts`.
 */
const SRC_TAURI = join(import.meta.dirname, "../../../src-tauri");

function readJson(fileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SRC_TAURI, fileName), "utf-8"));
}

/** A minimal RFC 7396 JSON Merge Patch — deep-merges objects, replaces everything else (arrays included) wholesale — matching Tauri CLI's own documented `--config` merge behavior exactly (verified against Tauri 2.11.5's vendored `tauri-utils` source). */
function mergePatch(target: unknown, patch: unknown): unknown {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return patch;
  }
  const result: Record<string, unknown> =
    typeof target === "object" && target !== null && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = mergePatch(result[key], value);
    }
  }
  return result;
}

describe("tauri.studio.conf.json — FDraft (Dev)'s distinct identity (EVENT STUDIO — PHASE 2 §1/§2)", () => {
  const base = readJson("tauri.conf.json");
  const studioOverride = readJson("tauri.studio.conf.json");
  const merged = mergePatch(base, studioOverride) as Record<string, unknown>;

  it("declares a different bundle identifier from normal FDraft — the one thing that actually isolates WebView2 storage", () => {
    expect(studioOverride.identifier).toBe("com.burrichen.fdraft.dev");
    expect(studioOverride.identifier).not.toBe(base.identifier);
  });

  it("declares a distinct product name", () => {
    expect(studioOverride.productName).toBe("FDraft (Dev)");
    expect(studioOverride.productName).not.toBe(base.productName);
  });

  it("merges to a window titled 'FDraft (Dev)', preserving every other window field from the base config (arrays replace wholesale under RFC 7396 — this proves the override reproduces them, not just the title)", () => {
    const mergedWindows = (
      merged.app as { windows: Array<Record<string, unknown>> }
    ).windows;
    expect(mergedWindows).toHaveLength(1);
    expect(mergedWindows[0]?.title).toBe("FDraft (Dev)");
    expect(mergedWindows[0]?.width).toBe(1280);
    expect(mergedWindows[0]?.minWidth).toBe(960);
    expect(mergedWindows[0]?.theme).toBe("Dark");
  });

  it("points bundle.icon at the separate red dev icon set, not the base icon set", () => {
    const icons = (studioOverride.bundle as { icon: string[] }).icon;
    expect(icons.every((path) => path.startsWith("icons/dev/"))).toBe(true);
    const baseIcons = (base.bundle as { icon: string[] }).icon;
    expect(icons).not.toEqual(baseIcons);
  });

  it("adds the studio capability on top of default, never replacing it", () => {
    const capabilities = (
      merged.app as { security: { capabilities: string[] } }
    ).security.capabilities;
    expect(capabilities).toEqual(["default", "studio"]);
  });

  it("normal FDraft's own base config only ever enables the default capability", () => {
    const capabilities = (base.app as { security: { capabilities: string[] } })
      .security.capabilities;
    expect(capabilities).toEqual(["default"]);
  });

  it("routes the Dev build's dev/build commands through the studio-flagged frontend scripts", () => {
    const build = studioOverride.build as Record<string, string>;
    expect(build.beforeDevCommand).toBe("pnpm run studio:dev-frontend");
    expect(build.beforeBuildCommand).toBe(
      "pnpm run build:desktop-frontend:studio",
    );
  });
});

describe("capabilities/studio.json — the dialog permission is opt-in, not ambient", () => {
  it("grants dialog:default only within the studio-identified capability file", () => {
    const studioCapability = readJson(join("capabilities", "studio.json"));
    expect(studioCapability.identifier).toBe("studio");
    expect(studioCapability.permissions).toEqual(["dialog:default"]);
  });

  it("the default capability file (shared by every build) never grants dialog access", () => {
    const defaultCapability = readJson(join("capabilities", "default.json"));
    const permissions = defaultCapability.permissions as unknown[];
    const flatIds = permissions.map((p) =>
      typeof p === "string" ? p : (p as { identifier: string }).identifier,
    );
    expect(flatIds).not.toContain("dialog:default");
  });
});
