import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeAvailability } from "@/components/drafts/challenge-browser";
import { NewDraftForm } from "./new-draft-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", timezone: "UTC", settings: {} },
    repositories: {} as never,
  }),
}));

vi.mock("./actions", () => ({
  createDraftAction: vi.fn(async () => ({ error: null })),
}));

// `NewDraftForm` reads the shared discovery snapshot to resolve the
// currently active event for its One At A Time hand-off (see docs/updates,
// "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING") — none of these tests
// exercise that path, so a fixed "no event active" snapshot is sufficient,
// matching the same mocking convention `useProfileContext` already uses
// above rather than rendering under a real `EventDiscoveryProvider`.
vi.mock("@/components/events/event-discovery-provider", () => ({
  useEventDiscovery: () => ({
    result: {
      statuses: [],
      eventVisualsEnabled: false,
      eventsEnabled: false,
      now: new Date(),
    },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("NewDraftForm — no Freeform creation option", () => {
  it("does not offer a Freeform difficulty card", () => {
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Freeform/ }),
    ).not.toBeInTheDocument();
  });
});

describe("NewDraftForm — Random vs DIY mode", () => {
  it("defaults to Random and shows the random-configuration sections once a difficulty is picked", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    expect(
      screen.getByRole("heading", {
        name: "How do you want the list to be made?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).toBeInTheDocument();
  });

  it("switching to 'Build My Own Draft' hides random-only configuration and shows a Continue button instead", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    await user.click(screen.getByRole("radio", { name: /Build My Own Draft/ }));

    expect(
      screen.queryByRole("heading", {
        name: "How do you want the list to be made?",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create draft" }),
    ).not.toBeInTheDocument();
  });

  it("Continue navigates to the DIY selection screen with the chosen difficulty and deadline mode", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    await user.click(screen.getByRole("radio", { name: /Build My Own Draft/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith(
      "/drafts/new/diy?difficulty=medium&timeMode=calendar",
    );
  });

  it("switching back to Random restores the random-configuration sections", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    await user.click(screen.getByRole("radio", { name: /Build My Own Draft/ }));
    await user.click(
      screen.getByRole("radio", { name: /Roll My Draft For Me/ }),
    );

    expect(
      screen.getByRole("heading", {
        name: "How do you want the list to be made?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).toBeInTheDocument();
  });
});

const NUMBER_SEVEN: ChallengeAvailability = {
  id: "the-number-7",
  name: "The Number 7",
  description: "Shuffles your eligible watchlist and takes the seventh result.",
  category: "meta",
  interactive: false,
  eligible: true,
  ineligibleReason: null,
};

describe("NewDraftForm — Choose My Challenge (normal Challenge behaviour)", () => {
  it("fills every challenge slot via 'Choose My Challenge' and enables submission", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[NUMBER_SEVEN]}
        availableGenres={[]}
      />,
    );

    // "Baby" = 5 films, default split randomCount 2 / challengeCount 3.
    await user.click(screen.getByRole("button", { name: /Baby/ }));
    await user.click(
      screen.getByRole("radio", { name: /Choose My Challenge/ }),
    );
    await user.click(screen.getByRole("button", { name: /^The Number 7/ }));
    await user.click(screen.getByRole("button", { name: /^The Number 7/ }));
    await user.click(screen.getByRole("button", { name: /^The Number 7/ }));

    expect(screen.getByText("3 of 3 challenges chosen")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).not.toBeDisabled();
  });

  it("no longer offers 'Pick Your Own' as a challenge to choose", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[NUMBER_SEVEN]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Baby/ }));
    await user.click(
      screen.getByRole("radio", { name: /Choose My Challenge/ }),
    );

    expect(
      screen.queryByRole("button", { name: /^Pick Your Own/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Want a chance at.*Pick Your Own/),
    ).not.toBeInTheDocument();
  });
});
