import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HALLOWEEN_ART } from "./halloween-art";
import { HalloweenPumpkin } from "./halloween-pumpkin";

const updateProfileSettings = vi.fn().mockResolvedValue(undefined);
let mockActiveProfile: {
  id: string;
  settings: { halloweenPumpkinState?: string };
} | null = { id: "profile-1", settings: { halloweenPumpkinState: "uncarved" } };

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: mockActiveProfile,
    updateProfileSettings,
  }),
}));

afterEach(() => {
  cleanup();
  updateProfileSettings.mockClear();
});

describe("HalloweenPumpkin", () => {
  it("labels the current state and advances to the next one on click", async () => {
    const user = userEvent.setup();
    render(<HalloweenPumpkin />);
    const button = screen.getByRole("button", {
      name: /pumpkin: uncarved/i,
    });
    await user.click(button);
    expect(updateProfileSettings).toHaveBeenCalledWith("profile-1", {
      halloweenPumpkinState: "carved",
    });
  });

  it("cycles through every state including wraparound (rotting → uncarved)", async () => {
    const user = userEvent.setup();
    mockActiveProfile = {
      id: "profile-1",
      settings: { halloweenPumpkinState: "rotting" },
    };
    render(<HalloweenPumpkin />);
    await user.click(screen.getByRole("button", { name: /pumpkin: rotting/i }));
    expect(updateProfileSettings).toHaveBeenCalledWith("profile-1", {
      halloweenPumpkinState: "uncarved",
    });
  });

  it("falls back to uncarved for a missing/invalid stored state", () => {
    mockActiveProfile = { id: "profile-1", settings: {} };
    render(<HalloweenPumpkin />);
    expect(
      screen.getByRole("button", { name: /pumpkin: uncarved/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing without an active profile", () => {
    mockActiveProfile = null;
    const { container } = render(<HalloweenPumpkin />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HalloweenPumpkin — image state mapping", () => {
  it("renders the bundled image for each of the four states", () => {
    const cases: Array<[string, string]> = [
      ["uncarved", HALLOWEEN_ART.pumpkinUncarved],
      ["carved", HALLOWEEN_ART.pumpkinCarved],
      ["lit", HALLOWEEN_ART.pumpkinLit],
      ["rotting", HALLOWEEN_ART.pumpkinRotting],
    ];
    for (const [state, expectedSrc] of cases) {
      mockActiveProfile = {
        id: "profile-1",
        settings: { halloweenPumpkinState: state },
      };
      const { container, unmount } = render(<HalloweenPumpkin />);
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        expectedSrc,
      );
      unmount();
    }
  });
});

describe("HalloweenPumpkin — abuse testing (PROMPT 21)", () => {
  it("rapid clicks never throw and never skip a state — each click computes 'next' from the currently-displayed state", async () => {
    mockActiveProfile = {
      id: "profile-1",
      settings: { halloweenPumpkinState: "uncarved" },
    };
    const user = userEvent.setup({ delay: null });
    render(<HalloweenPumpkin />);
    const button = screen.getByRole("button", { name: /pumpkin: uncarved/i });

    // Fire several rapid clicks before any re-render could reflect a
    // persisted change (the mock never updates `activeProfile` itself,
    // mirroring the real gap between calling `updateProfileSettings` and
    // the profile context re-rendering with the saved result).
    await user.click(button);
    await user.click(button);
    await user.click(button);

    // Every call computed "carved" from the same still-displayed
    // "uncarved" state — redundant, but never a skip-ahead or a crash.
    expect(updateProfileSettings).toHaveBeenCalledTimes(3);
    for (const call of updateProfileSettings.mock.calls) {
      expect(call).toEqual(["profile-1", { halloweenPumpkinState: "carved" }]);
    }
  });

  it("switching profiles (no remount needed) immediately reflects the new profile's own stored state", () => {
    mockActiveProfile = {
      id: "profile-a",
      settings: { halloweenPumpkinState: "rotting" },
    };
    const { rerender } = render(<HalloweenPumpkin />);
    expect(
      screen.getByRole("button", { name: /pumpkin: rotting/i }),
    ).toBeInTheDocument();

    mockActiveProfile = {
      id: "profile-b",
      settings: { halloweenPumpkinState: "uncarved" },
    };
    rerender(<HalloweenPumpkin />);
    expect(
      screen.getByRole("button", { name: /pumpkin: uncarved/i }),
    ).toBeInTheDocument();
  });
});
