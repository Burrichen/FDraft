import { cleanup, render, screen } from "@testing-library/react";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventThemeLayoutRenderer } from "./event-theme-layout-renderer";
import {
  fdraftThemeSchema,
  type FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", displayName: "Alex", settings: {} },
  }),
}));

afterEach(cleanup);

type FDraftThemeInput = z.input<typeof fdraftThemeSchema>;

function buildTheme(
  overrides: Partial<FDraftThemeInput> = {},
): FDraftThemeFile {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: { ghost: "events/test/decorations/ghost.png" },
    layouts: {},
    ...overrides,
  });
}

function setViewportWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const minWidthMatch = /min-width:\s*(\d+)px/.exec(query);
    const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : 0;
    return {
      matches: width >= minWidth,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

describe("EventThemeLayoutRenderer — read-only production rendering (EVENT STUDIO — PHASE 1 §10/§11)", () => {
  it("renders a fixed placement's asset image at the resolved geometry", () => {
    setViewportWidth(1440);
    const theme = buildTheme({
      layouts: {
        eventPage: {
          states: {
            active: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "ghost-corner",
                      kind: "fixed",
                      assetId: "ghost",
                      anchor: "top-right",
                      width: 3.5,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { container } = render(
      <EventThemeLayoutRenderer
        theme={theme}
        pageId="eventPage"
        stateId="active"
      />,
    );

    const wrapper = container.querySelector(
      '[data-fdraft-placement-id="ghost-corner"]',
    ) as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.width).toBe("3.5rem");
    const img = wrapper.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/events/test/decorations/ghost.png");
  });

  it("positions a viewport-space placement with position: fixed", () => {
    setViewportWidth(1440);
    const theme = buildTheme({
      layouts: {
        ambient: {
          states: {
            default: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "corner",
                      kind: "fixed",
                      assetId: "ghost",
                      coordinateSpace: "viewport",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const { container } = render(
      <EventThemeLayoutRenderer
        theme={theme}
        pageId="ambient"
        stateId="default"
      />,
    );
    const wrapper = container.querySelector(
      '[data-fdraft-placement-id="corner"]',
    ) as HTMLElement;
    expect(wrapper.style.position).toBe("fixed");
  });

  it("no editing affordances of any kind are rendered (read-only §11)", () => {
    setViewportWidth(1440);
    const theme = buildTheme({
      layouts: {
        eventPage: {
          states: {
            active: {
              breakpoints: {
                desktop: {
                  placements: [{ id: "p1", kind: "fixed", assetId: "ghost" }],
                },
              },
            },
          },
        },
      },
    });
    const { container } = render(
      <EventThemeLayoutRenderer
        theme={theme}
        pageId="eventPage"
        stateId="active"
      />,
    );
    expect(
      container.querySelectorAll("button, input, [draggable=true]"),
    ).toHaveLength(0);
  });

  it("renders the registered component for an interaction id, not a plain image", () => {
    setViewportWidth(1440);
    const theme = buildTheme({
      layouts: {
        eventPage: {
          states: {
            active: {
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
    render(
      <EventThemeLayoutRenderer
        theme={theme}
        pageId="eventPage"
        stateId="active"
      />,
    );
    // HalloweenPumpkin renders a real, clickable, accessible button —
    // proof the actual registered interactive component mounted, not a
    // plain decorative image.
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("selects the mobile breakpoint's layout at a narrow viewport", () => {
    setViewportWidth(375);
    const theme = buildTheme({
      layouts: {
        eventPage: {
          states: {
            active: {
              breakpoints: {
                desktop: {
                  placements: [
                    { id: "desktop-only", kind: "fixed", assetId: "ghost" },
                  ],
                },
                mobile: {
                  placements: [
                    { id: "mobile-only", kind: "fixed", assetId: "ghost" },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const { container } = render(
      <EventThemeLayoutRenderer
        theme={theme}
        pageId="eventPage"
        stateId="active"
      />,
    );
    expect(
      container.querySelector('[data-fdraft-placement-id="mobile-only"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-fdraft-placement-id="desktop-only"]'),
    ).toBeNull();
  });

  it("does not crash when an asset id resolves to a path with no real file on disk (missing assets fail gracefully — §9)", () => {
    setViewportWidth(1440);
    const theme = buildTheme({
      assets: { ghost: "events/test/decorations/does-not-exist.png" },
      layouts: {
        eventPage: {
          states: {
            active: {
              breakpoints: {
                desktop: {
                  placements: [{ id: "p1", kind: "fixed", assetId: "ghost" }],
                },
              },
            },
          },
        },
      },
    });
    expect(() =>
      render(
        <EventThemeLayoutRenderer
          theme={theme}
          pageId="eventPage"
          stateId="active"
        />,
      ),
    ).not.toThrow();
  });
});
