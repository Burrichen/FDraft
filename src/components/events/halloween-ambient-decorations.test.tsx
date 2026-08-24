import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventOccurrenceStatus } from "@/application/events/event-discovery";
import {
  HalloweenAmbientDecorations,
  useHalloweenAmbientVisible,
} from "./halloween-ambient-decorations";

let mockPathname = "/watchlist";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

let mockStatuses: EventOccurrenceStatus[] = [];
let mockEventVisualsEnabled = false;

vi.mock("@/components/events/event-discovery-provider", () => ({
  useEventDiscovery: () => ({
    result: {
      statuses: mockStatuses,
      eventVisualsEnabled: mockEventVisualsEnabled,
      now: new Date(0),
    },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

function halloweenStatus(
  overrides: Partial<EventOccurrenceStatus> = {},
): EventOccurrenceStatus {
  return {
    event: { id: "halloween" } as EventOccurrenceStatus["event"],
    occurrenceKey: "halloween:2026",
    available: true,
    manuallyEnabled: false,
    participation: "joined",
    ...overrides,
  };
}

function Harness() {
  const visible = useHalloweenAmbientVisible();
  return visible ? <HalloweenAmbientDecorations /> : <p>no ambience</p>;
}

afterEach(() => {
  cleanup();
  mockPathname = "/watchlist";
  mockStatuses = [];
  mockEventVisualsEnabled = false;
});

describe("useHalloweenAmbientVisible / HalloweenAmbientDecorations", () => {
  it("stays hidden when visuals are off, even with Halloween active", async () => {
    mockStatuses = [halloweenStatus()];
    mockEventVisualsEnabled = false;
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByText("no ambience")).toBeInTheDocument(),
    );
  });

  it("stays hidden when a different event is active, even with visuals on", async () => {
    mockStatuses = [
      {
        event: { id: "f-you-its-january" } as EventOccurrenceStatus["event"],
        occurrenceKey: "f-you-its-january:2026",
        available: true,
        manuallyEnabled: false,
        participation: "joined",
      },
    ];
    mockEventVisualsEnabled = true;
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByText("no ambience")).toBeInTheDocument(),
    );
  });

  it("shows the ambient layer on an ordinary page once Halloween visuals are on and active", async () => {
    mockStatuses = [halloweenStatus()];
    mockEventVisualsEnabled = true;
    const { container } = render(<Harness />);
    await waitFor(() =>
      expect(container.querySelector("[aria-hidden='true']")).not.toBeNull(),
    );
  });

  it("stays hidden once Halloween's window has closed, even though it was joined", async () => {
    mockStatuses = [halloweenStatus({ available: false })];
    mockEventVisualsEnabled = true;
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByText("no ambience")).toBeInTheDocument(),
    );
  });

  it("stays hidden on the Halloween page itself, which already has its own denser decorative layer", async () => {
    mockPathname = "/events/halloween";
    mockStatuses = [halloweenStatus()];
    mockEventVisualsEnabled = true;
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByText("no ambience")).toBeInTheDocument(),
    );
  });
});
