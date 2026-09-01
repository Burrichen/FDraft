import { describe, expect, it } from "vitest";
import { validateThemeForExport } from "./theme-export-validation";
import { addPlacement, createFixedPlacement } from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const LOC = {
  pageId: "watchlist",
  stateId: "active",
  breakpointId: "desktop" as const,
};

function validTheme() {
  const empty = fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets: { ghost: "events/halloween/interactives/ghost.png" },
    layouts: {},
  });
  return addPlacement(empty, LOC, createFixedPlacement("p1", "ghost"));
}

describe("validateThemeForExport", () => {
  it("reports ok for a schema-valid theme", () => {
    expect(validateThemeForExport(validTheme())).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("reports not-ok with a useful path/message for a missing required field", () => {
    const broken = { ...validTheme(), themeId: undefined };
    const result = validateThemeForExport(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].path).toBe("themeId");
  });

  it("reports EVERY issue, not just the first", () => {
    const broken = { ...validTheme(), themeId: undefined, eventId: undefined };
    const result = validateThemeForExport(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a completely wrong shape without throwing", () => {
    const result = validateThemeForExport({ not: "a theme" });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
