import { describe, expect, it } from "vitest";
import {
  buildThemeExportFilename,
  extractPageScopedTheme,
} from "./theme-export-scope";
import { addPlacement, createFixedPlacement } from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const WATCHLIST = {
  pageId: "watchlist",
  stateId: "active",
  breakpointId: "desktop" as const,
};
const DRAFTS = { ...WATCHLIST, pageId: "drafts" };

function themeWithTwoPages() {
  const empty = fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets: {
      ghost: "events/halloween/interactives/ghost.png",
      bat: "events/halloween/interactives/bat.png",
    },
    layouts: {},
  });
  let theme = addPlacement(
    empty,
    WATCHLIST,
    createFixedPlacement("p1", "ghost"),
  );
  theme = addPlacement(theme, DRAFTS, createFixedPlacement("p2", "bat"));
  return theme;
}

describe("extractPageScopedTheme", () => {
  it("keeps only the requested page's layout", () => {
    const scoped = extractPageScopedTheme(themeWithTwoPages(), "watchlist");
    expect(Object.keys(scoped.layouts)).toEqual(["watchlist"]);
  });

  it("keeps only assets referenced by the requested page — not every asset in the theme", () => {
    const scoped = extractPageScopedTheme(themeWithTwoPages(), "watchlist");
    expect(Object.keys(scoped.assets)).toEqual(["ghost"]);
  });

  it("produces an empty layouts object for a page the theme has no layout for", () => {
    const scoped = extractPageScopedTheme(themeWithTwoPages(), "no-such-page");
    expect(scoped.layouts).toEqual({});
    expect(scoped.assets).toEqual({});
  });

  it("preserves top-level metadata (schemaVersion/themeId/eventId/scope) unchanged", () => {
    const scoped = extractPageScopedTheme(themeWithTwoPages(), "watchlist");
    expect(scoped.schemaVersion).toBe(1);
    expect(scoped.themeId).toBe("halloween");
    expect(scoped.eventId).toBe("halloween");
    expect(scoped.scope).toBe("event");
  });

  it("still validates against the shared production schema", () => {
    const scoped = extractPageScopedTheme(themeWithTwoPages(), "watchlist");
    expect(fdraftThemeSchema.safeParse(scoped).success).toBe(true);
  });
});

describe("buildThemeExportFilename", () => {
  it("builds the whole-event filename from just a preset label", () => {
    expect(buildThemeExportFilename("Halloween")).toBe(
      "Halloween.fdraft-theme",
    );
  });

  it("builds the page-scoped filename with the spec's own example", () => {
    expect(buildThemeExportFilename("Halloween", "Watchlist")).toBe(
      "Halloween - Watchlist.fdraft-theme",
    );
  });

  it("strips filesystem-unsafe characters from both parts", () => {
    expect(buildThemeExportFilename("Hallo:ween?", "Watch/list")).toBe(
      "Halloween - Watchlist.fdraft-theme",
    );
  });

  it("falls back to a generic label if sanitizing empties it out", () => {
    expect(buildThemeExportFilename("???", "///")).toBe(
      "Event - Page.fdraft-theme",
    );
  });
});
