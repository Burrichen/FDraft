import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FDRAFT_THEME_CURRENT_SCHEMA_VERSION,
  fdraftThemeSchema,
  parseFDraftThemeText,
} from "./fdraft-theme-schema";

const THEME_DIR = join(process.cwd(), "public", "event-themes");

function readBundledTheme(fileName: string): string {
  return readFileSync(join(THEME_DIR, fileName), "utf-8");
}

describe("parseFDraftThemeText — the four bundled canonical themes (EVENT STUDIO — PHASE 1 §13/§17)", () => {
  it("parses the bundled Halloween theme", () => {
    const result = parseFDraftThemeText(readBundledTheme("halloween.fdraft-theme"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.themeId).toBe("halloween");
    expect(result.theme.eventId).toBe("halloween");
    expect(result.theme.scope).toBe("event");
    expect(Object.keys(result.theme.layouts)).toEqual(
      expect.arrayContaining(["eventPage", "introModal", "endingModal"]),
    );
  });

  it("parses the bundled January theme (an event with genuinely no decorations)", () => {
    const result = parseFDraftThemeText(readBundledTheme("january.fdraft-theme"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.eventId).toBe("f-you-its-january");
    expect(result.theme.layouts).toEqual({});
  });

  it("parses the bundled Default theme", () => {
    const result = parseFDraftThemeText(readBundledTheme("default.fdraft-theme"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.scope).toBe("default");
    expect(result.theme.eventId).toBeNull();
  });

  it("parses the bundled Christmas scaffold theme", () => {
    const result = parseFDraftThemeText(readBundledTheme("christmas.fdraft-theme"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.eventId).toBe("christmas");
    expect(
      result.theme.layouts.eventPage?.states.default?.breakpoints.desktop
        ?.placements,
    ).toHaveLength(3);
  });
});

describe("parseFDraftThemeText — rejection cases (§16/§17)", () => {
  it("rejects malformed JSON with a clear reason", () => {
    const result = parseFDraftThemeText("{ not valid json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_json");
  });

  it("rejects a schemaVersion newer than this build supports", () => {
    const result = parseFDraftThemeText(
      JSON.stringify({
        schemaVersion: FDRAFT_THEME_CURRENT_SCHEMA_VERSION + 1,
        themeId: "future",
        eventId: "future",
        scope: "event",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsupported_schema_version");
  });

  it("rejects a placement referencing an asset id not declared in the theme's own assets map", () => {
    const result = parseFDraftThemeText(
      JSON.stringify({
        schemaVersion: 1,
        themeId: "bad",
        eventId: "bad",
        scope: "event",
        assets: {},
        layouts: {
          eventPage: {
            states: {
              default: {
                breakpoints: {
                  desktop: {
                    placements: [
                      {
                        id: "ghost",
                        kind: "fixed",
                        assetId: "unknown-asset",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_schema");
    expect(result.message).toMatch(/unknown-asset/);
  });

  it("rejects an unregistered interaction id", () => {
    const result = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: "bad",
      eventId: "bad",
      scope: "event",
      assets: {},
      layouts: {
        eventPage: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "p1",
                      kind: "fixed",
                      interactionId: "run-arbitrary-code",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an asset path that looks like a Windows filesystem path", () => {
    const result = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: "bad",
      eventId: "bad",
      scope: "event",
      assets: { evil: "C:\\Users\\evil\\payload.png" },
      layouts: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an asset path that's a remote URL", () => {
    const result = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: "bad",
      eventId: "bad",
      scope: "event",
      assets: { evil: "https://evil.example.com/ghost.png" },
      layouts: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an asset path with directory traversal", () => {
    const result = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: "bad",
      eventId: "bad",
      scope: "event",
      assets: { evil: "events/halloween/../../secrets/ghost.png" },
      layouts: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an event-scoped theme with no eventId", () => {
    const result = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: "bad",
      eventId: null,
      scope: "event",
      assets: {},
      layouts: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed fixed placement with rotation, flip, opacity, and crop", () => {
    const result = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: "ok",
      eventId: "ok",
      scope: "event",
      assets: { ghost: "events/ok/decorations/ghost.png" },
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "p1",
                      kind: "fixed",
                      assetId: "ghost",
                      anchor: "center",
                      rotation: 15,
                      flipX: true,
                      flipY: false,
                      opacity: 0.5,
                      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a crop rect that extends past the source image bounds", () => {
    const result = fdraftThemeCropRectCheck({ x: 0.8, y: 0, width: 0.5, height: 0.5 });
    expect(result.success).toBe(false);
  });
});

function fdraftThemeCropRectCheck(crop: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return fdraftThemeSchema.safeParse({
    schemaVersion: 1,
    themeId: "ok",
    eventId: "ok",
    scope: "event",
    assets: { ghost: "events/ok/decorations/ghost.png" },
    layouts: {
      page: {
        states: {
          default: {
            breakpoints: {
              desktop: {
                placements: [
                  { id: "p1", kind: "fixed", assetId: "ghost", crop },
                ],
              },
            },
          },
        },
      },
    },
  });
}
