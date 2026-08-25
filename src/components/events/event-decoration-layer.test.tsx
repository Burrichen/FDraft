import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EventDecorationLayout } from "@/domain/events/event-decoration-slots";
import {
  EventDecorationLayer,
  type DecorationAssetRegistry,
  type EventDecorationSlotPositions,
} from "./event-decoration-layer";

afterEach(cleanup);

const REGISTRY: DecorationAssetRegistry = {
  ghost: () => <span data-testid="ghost-piece">Ghost</span>,
};

const POSITIONS: EventDecorationSlotPositions = {
  "mid-right": "absolute top-1/2 right-4",
  "mid-left": "absolute top-1/2 left-4",
};

describe("EventDecorationLayer", () => {
  it("is aria-hidden and pointer-events-none at the root, and renders a guaranteed pick", () => {
    const layout: EventDecorationLayout = {
      "mid-right": {
        slot: "mid-right",
        visibleFrom: "base",
        variants: [{ assetId: "ghost", weight: 1 }],
      },
    };
    const { container } = render(
      <EventDecorationLayer
        layout={layout}
        registry={REGISTRY}
        positions={POSITIONS}
        seedInputs={{ eventId: "halloween", layoutKey: "test" }}
      />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("pointer-events-none");
    expect(screen.getByTestId("ghost-piece")).toBeInTheDocument();
  });

  it("renders nothing for a slot whose only variant is 'nothing'", () => {
    const layout: EventDecorationLayout = {
      "mid-right": {
        slot: "mid-right",
        visibleFrom: "base",
        variants: [{ assetId: null, weight: 1 }],
      },
    };
    render(
      <EventDecorationLayer
        layout={layout}
        registry={REGISTRY}
        positions={POSITIONS}
        seedInputs={{ eventId: "halloween", layoutKey: "test" }}
      />,
    );
    expect(screen.queryByTestId("ghost-piece")).not.toBeInTheDocument();
  });

  it("skips a slot whose picked asset id isn't in the registry, instead of crashing", () => {
    const layout: EventDecorationLayout = {
      "mid-right": {
        slot: "mid-right",
        visibleFrom: "base",
        variants: [{ assetId: "unregistered-thing", weight: 1 }],
      },
    };
    expect(() =>
      render(
        <EventDecorationLayer
          layout={layout}
          registry={REGISTRY}
          positions={POSITIONS}
          seedInputs={{ eventId: "halloween", layoutKey: "test" }}
        />,
      ),
    ).not.toThrow();
    expect(screen.queryByTestId("ghost-piece")).not.toBeInTheDocument();
  });

  it("skips a slot with no position entry for this surface, instead of rendering unpositioned", () => {
    const layout: EventDecorationLayout = {
      "footer-center": {
        slot: "footer-center",
        visibleFrom: "base",
        variants: [{ assetId: "ghost", weight: 1 }],
      },
    };
    render(
      <EventDecorationLayer
        layout={layout}
        registry={REGISTRY}
        positions={POSITIONS}
        seedInputs={{ eventId: "halloween", layoutKey: "test" }}
      />,
    );
    expect(screen.queryByTestId("ghost-piece")).not.toBeInTheDocument();
  });

  it("hides a slot below its visibleFrom breakpoint via a 'hidden {bp}:block' class, never by omitting it outright", () => {
    const layout: EventDecorationLayout = {
      "mid-right": {
        slot: "mid-right",
        visibleFrom: "lg",
        variants: [{ assetId: "ghost", weight: 1 }],
      },
    };
    render(
      <EventDecorationLayer
        layout={layout}
        registry={REGISTRY}
        positions={POSITIONS}
        seedInputs={{ eventId: "halloween", layoutKey: "test" }}
      />,
    );
    const piece = screen.getByTestId("ghost-piece");
    const wrapper = piece.parentElement;
    expect(wrapper).toHaveClass("hidden", "lg:block");
  });

  it("never rerolls on a rerender with the same inputs — no flicker", () => {
    const layout: EventDecorationLayout = {
      "mid-right": {
        slot: "mid-right",
        visibleFrom: "base",
        variants: [
          { assetId: "ghost", weight: 1 },
          { assetId: null, weight: 1 },
        ],
      },
    };
    const { rerender } = render(
      <EventDecorationLayer
        layout={layout}
        registry={REGISTRY}
        positions={POSITIONS}
        seedInputs={{
          eventId: "halloween",
          layoutKey: "test",
          profileId: "p1",
        }}
      />,
    );
    const firstPresence = screen.queryByTestId("ghost-piece") !== null;

    for (let i = 0; i < 5; i += 1) {
      rerender(
        <EventDecorationLayer
          layout={layout}
          registry={REGISTRY}
          positions={POSITIONS}
          seedInputs={{
            eventId: "halloween",
            layoutKey: "test",
            profileId: "p1",
          }}
        />,
      );
      expect(screen.queryByTestId("ghost-piece") !== null).toBe(firstPresence);
    }
  });
});
