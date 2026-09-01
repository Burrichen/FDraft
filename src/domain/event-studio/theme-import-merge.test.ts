import { describe, expect, it } from "vitest";
import { mergePageScopedImport } from "./theme-import-merge";
import { addPlacement, createFixedPlacement } from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const WATCHLIST = {
  pageId: "watchlist",
  stateId: "active",
  breakpointId: "desktop" as const,
};
const DRAFTS = { ...WATCHLIST, pageId: "drafts" };

function emptyTheme(assets: Record<string, string> = {}) {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets,
    layouts: {},
  });
}

describe("mergePageScopedImport", () => {
  it("returns null when the imported file has no layout for the target page", () => {
    const current = emptyTheme();
    const imported = addPlacement(
      emptyTheme({ ghost: "events/halloween/interactives/ghost.png" }),
      DRAFTS,
      createFixedPlacement("p1", "ghost"),
    );
    expect(mergePageScopedImport(current, imported, "watchlist")).toBeNull();
  });

  it("replaces the target page with the imported page's layout", () => {
    const current = addPlacement(
      emptyTheme({ ghost: "events/halloween/interactives/ghost.png" }),
      WATCHLIST,
      createFixedPlacement("current-1", "ghost"),
    );
    const imported = addPlacement(
      emptyTheme({ bat: "events/halloween/interactives/bat.png" }),
      WATCHLIST,
      createFixedPlacement("imported-1", "bat"),
    );

    const merged = mergePageScopedImport(current, imported, "watchlist");

    expect(
      merged!.layouts.watchlist.states.active.breakpoints.desktop!.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["imported-1"]);
  });

  it("leaves every other page in the current theme untouched", () => {
    const current = addPlacement(
      emptyTheme({ ghost: "events/halloween/interactives/ghost.png" }),
      DRAFTS,
      createFixedPlacement("current-drafts", "ghost"),
    );
    const imported = addPlacement(
      emptyTheme({ bat: "events/halloween/interactives/bat.png" }),
      WATCHLIST,
      createFixedPlacement("imported-1", "bat"),
    );

    const merged = mergePageScopedImport(current, imported, "watchlist");

    expect(
      merged!.layouts.drafts.states.active.breakpoints.desktop!.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["current-drafts"]);
  });

  it("merges in the imported page's asset when the current theme has no such id yet", () => {
    const current = emptyTheme();
    const imported = addPlacement(
      emptyTheme({ bat: "events/halloween/interactives/bat.png" }),
      WATCHLIST,
      createFixedPlacement("imported-1", "bat"),
    );

    const merged = mergePageScopedImport(current, imported, "watchlist");

    expect(merged!.assets.bat).toBe("events/halloween/interactives/bat.png");
  });

  it("reuses the existing id when the current theme already has the exact same id -> path", () => {
    const current = emptyTheme({
      bat: "events/halloween/interactives/bat.png",
    });
    const imported = addPlacement(
      emptyTheme({ bat: "events/halloween/interactives/bat.png" }),
      WATCHLIST,
      createFixedPlacement("imported-1", "bat"),
    );

    const merged = mergePageScopedImport(current, imported, "watchlist");

    expect(Object.keys(merged!.assets)).toEqual(["bat"]);
    const placement =
      merged!.layouts.watchlist.states.active.breakpoints.desktop!
        .placements[0];
    expect(placement.kind === "fixed" && placement.assetId).toBe("bat");
  });

  it("mints a new non-colliding id when the same id maps to a DIFFERENT path in each theme", () => {
    const current = emptyTheme({
      bat: "events/halloween/interactives/current-bat.png",
    });
    const imported = addPlacement(
      emptyTheme({ bat: "events/halloween/interactives/imported-bat.png" }),
      WATCHLIST,
      createFixedPlacement("imported-1", "bat"),
    );

    const merged = mergePageScopedImport(current, imported, "watchlist");

    expect(merged!.assets.bat).toBe(
      "events/halloween/interactives/current-bat.png",
    );
    const placement =
      merged!.layouts.watchlist.states.active.breakpoints.desktop!
        .placements[0];
    const newAssetId = placement.kind === "fixed" ? placement.assetId : null;
    expect(newAssetId).not.toBe("bat");
    expect(merged!.assets[newAssetId!]).toBe(
      "events/halloween/interactives/imported-bat.png",
    );
  });

  it("still validates against the shared production schema", () => {
    const current = emptyTheme();
    const imported = addPlacement(
      emptyTheme({ bat: "events/halloween/interactives/bat.png" }),
      WATCHLIST,
      createFixedPlacement("imported-1", "bat"),
    );
    const merged = mergePageScopedImport(current, imported, "watchlist");
    expect(fdraftThemeSchema.safeParse(merged).success).toBe(true);
  });
});
