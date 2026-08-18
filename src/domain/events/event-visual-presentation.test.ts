import { describe, expect, it } from "vitest";
import { resolveEventVisualThemeId } from "./event-visual-presentation";

describe("resolveEventVisualThemeId", () => {
  it("visuals disabled — always null, even with a themed active event", () => {
    expect(
      resolveEventVisualThemeId({
        event: { visualTheme: "january" },
        eventVisualsEnabled: false,
      }),
    ).toBeNull();
  });

  it("visuals enabled, no active event — null (nothing to theme)", () => {
    expect(
      resolveEventVisualThemeId({ event: null, eventVisualsEnabled: true }),
    ).toBeNull();
  });

  it("visuals enabled, event has no configured visualTheme — null, safe fallback", () => {
    expect(
      resolveEventVisualThemeId({
        event: { visualTheme: null },
        eventVisualsEnabled: true,
      }),
    ).toBeNull();
  });

  it("visuals enabled, event has a configured visualTheme — returns that theme id", () => {
    expect(
      resolveEventVisualThemeId({
        event: { visualTheme: "january" },
        eventVisualsEnabled: true,
      }),
    ).toBe("january");
  });

  it("visuals disabled takes priority over everything else — never leaks a theme id", () => {
    expect(
      resolveEventVisualThemeId({
        event: { visualTheme: "watchlist-frontier" },
        eventVisualsEnabled: false,
      }),
    ).toBeNull();
  });
});
