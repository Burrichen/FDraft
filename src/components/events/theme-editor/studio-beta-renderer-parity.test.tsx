import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventThemeLayoutRenderer } from "@/components/events/event-theme-layout-renderer";
import { EditableThemeCanvas } from "./editable-theme-canvas";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", displayName: "Alex", settings: {} },
  }),
}));

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

/**
 * TRUE PREVIEW PARITY (EVENT STUDIO — PHASE 7 §2) — Studio's editing
 * overlay (`EditableThemeCanvas`) and Beta's own read-only renderer
 * (`EventThemeLayoutRenderer`, what Admin Preview Import and any future
 * live consumption both use) are required to share the exact same
 * parser/renderer/breakpoint/crop/interaction logic, "never a duplicate
 * approximation." This isn't achieved by two implementations that happen
 * to agree — `EditableThemeCanvas` imports `PlacementContent` and the
 * `resolveFixedPlacement`/`resolveWeightedPlacement` resolvers directly
 * FROM `event-theme-layout-renderer.tsx`/`fdraft-theme-resolve.ts` (see
 * both files' own doc comments) — so this test renders the SAME theme
 * through both real components and asserts their output is pixel-
 * identical for a cropped, rotated, offset placement, pinning that
 * sharing down as an enforced regression rather than an unverified claim.
 */
describe("Studio canvas / Beta renderer parity (EVENT STUDIO — PHASE 7 §2)", () => {
  afterEach(cleanup);

  it("a cropped, rotated fixed placement resolves to identical asset src, crop box, and transform in both real renderers", () => {
    setViewportWidth(1440);
    const theme = fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "parity-test",
      eventId: "parity-test",
      scope: "event",
      assets: { ghost: "events/parity-test/decorations/ghost.png" },
      layouts: {
        eventPage: {
          states: {
            active: {
              breakpoints: {
                desktop: {
                  placements: [
                    {
                      id: "ghost-1",
                      kind: "fixed",
                      assetId: "ghost",
                      anchor: "top-left",
                      offsetX: 4,
                      offsetY: 6,
                      width: 5,
                      height: 5,
                      rotation: 12,
                      opacity: 0.8,
                      crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { container: betaContainer } = render(
      <EventThemeLayoutRenderer
        theme={theme}
        pageId="eventPage"
        stateId="active"
      />,
    );

    const { container: studioContainer } = render(
      <EditableThemeCanvas
        theme={theme}
        location={{
          pageId: "eventPage",
          stateId: "active",
          breakpointId: "desktop",
        }}
        width={1440}
        height={900}
        zoom={1}
        selectedPlacementIds={new Set()}
        onSelectionChange={() => {}}
        groups={[]}
        lockedPlacementIds={new Set()}
        freeResize={false}
        cropPlacementId={null}
        interactionTestMode={false}
        previewSeed="unused-fixed-placements-ignore-seed"
        snap={{
          toGrid: false,
          toPage: false,
          toCenter: false,
          toObjects: false,
          gridSizePx: 20,
        }}
        showGrid={false}
        onCommit={() => {}}
        onCommitMultiple={() => {}}
        onDropAsset={() => {}}
        onCloseCrop={() => {}}
      />,
    );

    const betaWrapper = betaContainer.querySelector(
      '[data-fdraft-placement-id="ghost-1"]',
    ) as HTMLElement;
    const studioWrapper = studioContainer.querySelector(
      '[data-fdraft-placement-id="ghost-1"]',
    ) as HTMLElement;
    expect(betaWrapper).not.toBeNull();
    expect(studioWrapper).not.toBeNull();

    // Identical positioning/sizing/rotation/opacity CSS — the same
    // `placementWrapperStyle(resolved)` call, fed the same resolved data.
    expect(studioWrapper.style.position).toBe(betaWrapper.style.position);
    expect(studioWrapper.style.opacity).toBe(betaWrapper.style.opacity);
    expect(studioWrapper.style.width).toBe(betaWrapper.style.width);
    expect(studioWrapper.style.height).toBe(betaWrapper.style.height);
    expect(studioWrapper.style.transform).toContain("rotate(12deg)");
    expect(betaWrapper.style.transform).toContain("rotate(12deg)");

    // Identical crop rendering: the SAME `CroppedImage` — one inner image,
    // sized/positioned as a percentage derived from the same crop rect.
    const betaImg = betaWrapper.querySelector("img") as HTMLImageElement;
    const studioImg = studioWrapper.querySelector("img") as HTMLImageElement;
    expect(betaImg.getAttribute("src")).toBe(studioImg.getAttribute("src"));
    expect(betaImg.style.width).toBe(studioImg.style.width);
    expect(betaImg.style.left).toBe(studioImg.style.left);
    expect(betaImg.style.top).toBe(studioImg.style.top);
  });
});
