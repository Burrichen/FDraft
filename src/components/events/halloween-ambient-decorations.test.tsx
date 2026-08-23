import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  HalloweenAmbientDecorations,
  useHalloweenAmbientVisible,
} from "./halloween-ambient-decorations";

vi.mock("@/application/events/event-settings-store", () => ({
  getEventSettings: vi.fn(),
}));

let mockPathname = "/watchlist";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const mockRepositories = {} as never;
vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1" },
    repositories: mockRepositories,
  }),
}));

function Harness() {
  const visible = useHalloweenAmbientVisible();
  return visible ? <HalloweenAmbientDecorations /> : <p>no ambience</p>;
}

afterEach(() => {
  cleanup();
  vi.mocked(getEventSettings).mockReset();
  mockPathname = "/watchlist";
});

describe("useHalloweenAmbientVisible / HalloweenAmbientDecorations", () => {
  it("stays hidden when visuals are off, even with Halloween active", async () => {
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
    render(<Harness />);
    await waitFor(() => expect(getEventSettings).toHaveBeenCalled());
    expect(screen.getByText("no ambience")).toBeInTheDocument();
  });

  it("stays hidden when a different event is active, even with visuals on", async () => {
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "f-you-its-january",
      manuallyEnabledEvents: ["f-you-its-january"],
    });
    render(<Harness />);
    await waitFor(() => expect(getEventSettings).toHaveBeenCalled());
    expect(screen.getByText("no ambience")).toBeInTheDocument();
  });

  it("shows the ambient layer on an ordinary page once Halloween visuals are on and active", async () => {
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
    const { container } = render(<Harness />);
    await waitFor(() =>
      expect(container.querySelector("[aria-hidden='true']")).not.toBeNull(),
    );
  });

  it("stays hidden on the Halloween page itself, which already has its own denser decorative layer", async () => {
    mockPathname = "/events/halloween";
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
    render(<Harness />);
    await waitFor(() => expect(getEventSettings).toHaveBeenCalled());
    expect(screen.getByText("no ambience")).toBeInTheDocument();
  });
});
