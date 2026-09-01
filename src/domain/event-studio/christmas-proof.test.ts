import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFDraftThemeText } from "@/domain/event-themes/fdraft-theme-schema";
import { resolveWeightedPlacement } from "@/domain/event-themes/fdraft-theme-resolve";
import { getEventStudioPresets } from "@/components/events/event-studio-presets";
// Registers Christmas into the shared Event Art registry (normally
// triggered once by `app-shell.tsx` mounting — see `register-event-art.ts`)
// so `getEventStudioPresets()`/`getEventArtRegistration()` below see it
// the same way a real running app would, without needing a full app mount.
import "@/components/events/christmas-art-registration";

/**
 * The "Christmas Proof" (EVENT STUDIO — PHASE 7 §8) — Event Studio was
 * built to be event-agnostic (see §9), and `public/event-themes/
 * christmas.fdraft-theme` / `public/events/christmas/` were bundled as
 * genuine scaffolding, not throwaway fixtures — this test proves the
 * REAL bundled files (not a hand-rolled test fixture) actually work end
 * to end, WITHOUT implementing any Christmas gameplay. Reads straight
 * off disk (the same file `loadCanonicalEventTheme` fetches at runtime,
 * and the same file `theme:apply`/Beta Admin Preview Import consume) so
 * this is proof against the real artifact, not an approximation of it.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

function readRealChristmasTheme(): string {
  return readFileSync(
    join(REPO_ROOT, "public", "event-themes", "christmas.fdraft-theme"),
    "utf-8",
  );
}

describe("Christmas Proof — the real bundled christmas.fdraft-theme (EVENT STUDIO — PHASE 7 §8)", () => {
  it("Christmas preset loads — the real bundled file parses through the exact shared schema", () => {
    const result = parseFDraftThemeText(readRealChristmasTheme());
    expect(result.ok).toBe(true);
  });

  it("Christmas preset appears in Event Studio's own preset list", () => {
    const presets = getEventStudioPresets();
    expect(presets.some((preset) => preset.id === "christmas")).toBe(true);
  });

  it("Christmas images appear from the Christmas folder — every referenced asset path lives under events/christmas/, and the real file exists on disk", () => {
    const result = parseFDraftThemeText(readRealChristmasTheme());
    if (!result.ok) throw new Error("expected a valid theme");

    const assetPaths = Object.values(result.theme.assets);
    expect(assetPaths.length).toBeGreaterThan(0);
    for (const relativePath of assetPaths) {
      expect(relativePath.startsWith("events/christmas/")).toBe(true);
      expect(existsSync(join(REPO_ROOT, "public", relativePath))).toBe(true);
    }
  });

  it("the snowflake nav icon works — Christmas's art registration reserves lucide-react's Snowflake, unused by any other event", async () => {
    const { getEventArtRegistration } =
      await import("@/components/events/event-art-registry");
    const { Snowflake } = await import("lucide-react");
    const registration = getEventArtRegistration("christmas");
    expect(registration?.navIcon).toBe(Snowflake);
  });

  it("weighted group works — the lower-right group resolves to snowman, stocking, or Nothing across a spread of seeds, never anything else", () => {
    const result = parseFDraftThemeText(readRealChristmasTheme());
    if (!result.ok) throw new Error("expected a valid theme");
    const placement =
      result.theme.layouts.eventPage!.states.default!.breakpoints.desktop!.placements.find(
        (p) => p.id === "lower-right",
      );
    if (!placement || placement.kind !== "weighted") {
      throw new Error("expected the lower-right weighted placement");
    }

    const resolvedAssetIds = new Set<string | null>();
    for (let seed = 0; seed < 50; seed += 1) {
      const resolved = resolveWeightedPlacement(
        result.theme,
        placement,
        `proof-seed-${seed}`,
      );
      resolvedAssetIds.add(resolved?.assetPath ?? null);
    }
    // Every resolved outcome is one of the three declared variants
    // (snowman, stocking, or "Nothing" -> a null assetPath/no render).
    for (const outcome of resolvedAssetIds) {
      if (outcome === null) continue;
      expect(
        outcome.endsWith("snowman.png") || outcome.endsWith("stocking.png"),
      ).toBe(true);
    }
  });

  it("theme exports and re-imports cleanly — a round-trip through JSON stays valid against the same shared schema", () => {
    const result = parseFDraftThemeText(readRealChristmasTheme());
    if (!result.ok) throw new Error("expected a valid theme");

    const exported = JSON.stringify(result.theme);
    const reimported = parseFDraftThemeText(exported);
    expect(reimported.ok).toBe(true);
    expect(reimported).toEqual(result);
  });

  it("Beta Preview would render it correctly — the fixed fairy-lights placement resolves to its real, existing asset file", () => {
    const result = parseFDraftThemeText(readRealChristmasTheme());
    if (!result.ok) throw new Error("expected a valid theme");
    const placement =
      result.theme.layouts.eventPage!.states.default!.breakpoints.desktop!.placements.find(
        (p) => p.id === "header-right",
      );
    expect(placement?.kind).toBe("fixed");
    if (placement?.kind !== "fixed")
      throw new Error("expected fixed placement");
    const relativePath = result.theme.assets[placement.assetId ?? ""];
    expect(relativePath).toBeDefined();
    expect(existsSync(join(REPO_ROOT, "public", relativePath!))).toBe(true);
  });
});
