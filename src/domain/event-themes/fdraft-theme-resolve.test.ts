import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  resolveFDraftThemeLayout,
  resolveWeightedPlacement,
} from "./fdraft-theme-resolve";
import { fdraftThemeSchema, type FDraftThemeFile } from "./fdraft-theme-schema";

type FDraftThemeInput = z.input<typeof fdraftThemeSchema>;

function buildTheme(
  overrides: Partial<FDraftThemeInput> = {},
): FDraftThemeFile {
  const parsed = fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: { ghost: "events/test/decorations/ghost.png" },
    layouts: {},
    ...overrides,
  });
  return parsed;
}

describe("resolveFDraftThemeLayout — fixed placements", () => {
  it("resolves a fixed placement's full geometry", () => {
    const theme = buildTheme({
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "ghost-corner",
                      kind: "fixed",
                      assetId: "ghost",
                      anchor: "top-right",
                      offsetX: -1,
                      offsetY: 1,
                      width: 3.5,
                      rotation: 12,
                      opacity: 0.8,
                      flipX: true,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "seed-1" },
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      placementId: "ghost-corner",
      anchor: "top-right",
      offsetX: -1,
      offsetY: 1,
      width: 3.5,
      rotation: 12,
      opacity: 0.8,
      flipX: true,
      assetPath: "/events/test/decorations/ghost.png",
    });
  });

  it("omits an invisible placement", () => {
    const theme = buildTheme({
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
                      visible: false,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "seed-1" },
    );
    expect(resolved).toHaveLength(0);
  });

  it("omits a fixed placement with no asset AND no interaction (nothing to render)", () => {
    const theme = buildTheme({
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [{ id: "p1", kind: "fixed", assetId: null }],
                },
              },
            },
          },
        },
      },
    });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "seed-1" },
    );
    expect(resolved).toHaveLength(0);
  });

  it("resolves an interaction-only placement (no backing asset)", () => {
    const theme = buildTheme({
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "pumpkin",
                      kind: "fixed",
                      assetId: null,
                      interactionId: "halloween-pumpkin",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "seed-1" },
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].interactionId).toBe("halloween-pumpkin");
    expect(resolved[0].assetPath).toBeNull();
  });

  it("preserves aspect ratio when height is null but width and aspectRatio are set", () => {
    const theme = buildTheme({
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
                      width: 4,
                      aspectRatio: 2,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "seed-1" },
    );
    expect(resolved[0].width).toBe(4);
    expect(resolved[0].aspectRatio).toBe(2);
  });
});

function weightedTheme(): FDraftThemeFile {
  return buildTheme({
    assets: {
      ghost: "events/test/decorations/ghost.png",
      pumpkin: "events/test/decorations/pumpkin.png",
    },
    layouts: {
      page: {
        states: {
          default: {
            breakpoints: {
              desktop: {
                placements: [
                  {
                    id: "mid-right",
                    kind: "weighted",
                    variants: [
                      { id: "ghost", assetId: "ghost", weight: 35 },
                      { id: "pumpkin", assetId: "pumpkin", weight: 25 },
                      { id: "nothing", assetId: null, weight: 40 },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  });
}

describe("resolveFDraftThemeLayout — weighted variants (§6/§7)", () => {
  it("is deterministic: the same seed always resolves to the same pick", () => {
    const theme = weightedTheme();
    const params = {
      pageId: "page",
      stateId: "default",
      breakpointId: "desktop" as const,
    };
    const first = resolveFDraftThemeLayout(theme, params, {
      sessionSeed: "stable-seed",
    });
    const second = resolveFDraftThemeLayout(theme, params, {
      sessionSeed: "stable-seed",
    });
    expect(second).toEqual(first);
  });

  it("different seeds can (though aren't guaranteed to) resolve to different picks — verified across a spread of seeds that at least one option other than the first is reachable", () => {
    const theme = weightedTheme();
    const params = {
      pageId: "page",
      stateId: "default",
      breakpointId: "desktop" as const,
    };
    const picks = new Set(
      Array.from({ length: 30 }, (_, i) =>
        resolveFDraftThemeLayout(theme, params, {
          sessionSeed: `seed-${i}`,
        })
          .map((p) => p.assetPath)
          .join(","),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("supports an explicit 'nothing' outcome (weighted pick of assetId: null) — placement is simply absent", () => {
    const theme = buildTheme({
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "always-nothing",
                      kind: "weighted",
                      variants: [{ id: "nothing", assetId: null, weight: 1 }],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "any-seed" },
    );
    expect(resolved).toHaveLength(0);
  });

  it("applies a variant's scale to the shared placement's base width/height", () => {
    const theme = buildTheme({
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "scaled",
                      kind: "weighted",
                      width: 4,
                      height: 4,
                      variants: [
                        {
                          id: "ghost",
                          assetId: "ghost",
                          weight: 1,
                          scale: 0.5,
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "any-seed" },
    );
    expect(resolved[0].width).toBe(2);
    expect(resolved[0].height).toBe(2);
  });

  it("repeated resolution with the same inputs never 'rerolls' — no flicker across many calls in a row", () => {
    const theme = weightedTheme();
    const params = {
      pageId: "page",
      stateId: "default",
      breakpointId: "desktop" as const,
    };
    const seedInputs = { sessionSeed: "session-abc", profileId: "alex" };
    const results = Array.from({ length: 20 }, () =>
      resolveFDraftThemeLayout(theme, params, seedInputs),
    );
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });
});

describe("resolveFDraftThemeLayout — breakpoint fallback (§3)", () => {
  function multiTierTheme(): FDraftThemeFile {
    return buildTheme({
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                mobile: {
                  placements: [
                    { id: "mobile-only", kind: "fixed", assetId: "ghost" },
                  ],
                },
                desktop: {
                  placements: [
                    { id: "desktop-only", kind: "fixed", assetId: "ghost" },
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  it("uses the exact tier when it's defined", () => {
    const theme = multiTierTheme();
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "s" },
    );
    expect(resolved[0].placementId).toBe("desktop-only");
  });

  it("falls back from tablet (undefined) to mobile, since tablet isn't explicitly defined", () => {
    const theme = multiTierTheme();
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "tablet" },
      { sessionSeed: "s" },
    );
    expect(resolved[0].placementId).toBe("mobile-only");
  });

  it("resolves to an empty layout (never an error) for a page/state that doesn't exist at all", () => {
    const theme = buildTheme();
    const resolved = resolveFDraftThemeLayout(
      theme,
      {
        pageId: "nonexistent",
        stateId: "nonexistent",
        breakpointId: "desktop",
      },
      { sessionSeed: "s" },
    );
    expect(resolved).toEqual([]);
  });
});

describe("resolveWeightedPlacement — per-variant adjustments (EVENT STUDIO — PHASE 5 §3)", () => {
  function singleVariantTheme(variantOverrides: Record<string, unknown>) {
    return buildTheme({
      assets: { ghost: "events/test/decorations/ghost.png" },
      layouts: {
        page: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "mid-right",
                      kind: "weighted",
                      offsetX: 2,
                      offsetY: 3,
                      rotation: 10,
                      variants: [
                        {
                          id: "ghost",
                          assetId: "ghost",
                          weight: 100,
                          ...variantOverrides,
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  function onlyPlacement(theme: FDraftThemeFile) {
    const placement =
      theme.layouts.page!.states.default!.breakpoints.desktop!.placements[0];
    return placement as Extract<typeof placement, { kind: "weighted" }>;
  }

  it("offsetXAdjustment/offsetYAdjustment are ADDED on top of the group's own offset", () => {
    const theme = singleVariantTheme({
      offsetXAdjustment: 1.5,
      offsetYAdjustment: -0.5,
    });
    const resolved = resolveWeightedPlacement(theme, onlyPlacement(theme), "s");
    expect(resolved?.offsetX).toBeCloseTo(3.5);
    expect(resolved?.offsetY).toBeCloseTo(2.5);
  });

  it("rotationAdjustment is ADDED on top of the group's own rotation", () => {
    const theme = singleVariantTheme({ rotationAdjustment: 15 });
    const resolved = resolveWeightedPlacement(theme, onlyPlacement(theme), "s");
    expect(resolved?.rotation).toBe(25);
  });

  it("defaults every adjustment to 0 (no change) when a variant doesn't set them", () => {
    const theme = singleVariantTheme({});
    const resolved = resolveWeightedPlacement(theme, onlyPlacement(theme), "s");
    expect(resolved?.offsetX).toBe(2);
    expect(resolved?.offsetY).toBe(3);
    expect(resolved?.rotation).toBe(10);
  });

  it("resolveFDraftThemeLayout's weighted branch applies the same adjustments end to end", () => {
    const theme = singleVariantTheme({ offsetXAdjustment: 4 });
    const resolved = resolveFDraftThemeLayout(
      theme,
      { pageId: "page", stateId: "default", breakpointId: "desktop" },
      { sessionSeed: "any-seed" },
    );
    expect(resolved[0]?.offsetX).toBe(6);
  });
});
