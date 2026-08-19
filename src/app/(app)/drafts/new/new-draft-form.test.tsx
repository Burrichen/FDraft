import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeAvailability } from "@/components/drafts/challenge-browser";
import type { DiySelectableFilmView } from "@/components/drafts/diy/diy-film-card";
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

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("NewDraftForm — Random vs DIY mode", () => {
  it("defaults to Random and shows the random-configuration sections once a difficulty is picked", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
        diyEligibleFilms={[]}
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
        diyEligibleFilms={[]}
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
        diyEligibleFilms={[]}
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
        diyEligibleFilms={[]}
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
const DIY_CHALLENGE: ChallengeAvailability = {
  id: "diy",
  name: "Pick Your Own",
  description: "You choose the exact film for this slot yourself.",
  category: "meta",
  interactive: false,
  eligible: true,
  ineligibleReason: null,
};
const DIY_FILMS: DiySelectableFilmView[] = [
  {
    entryId: "entry-1",
    filmId: "film-1",
    title: "Alpha",
    releaseYear: 2020,
    runtimeMinutes: 100,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-01",
    genres: null,
  },
];

describe("NewDraftForm — DIY Challenge Film gating", () => {
  it("blocks submission until every chosen 'diy' challenge slot has a pre-picked film", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[NUMBER_SEVEN, DIY_CHALLENGE]}
        availableGenres={[]}
        diyEligibleFilms={DIY_FILMS}
      />,
    );

    // "Baby" = 5 films, default split randomCount 2 / challengeCount 3.
    await user.click(screen.getByRole("button", { name: /Baby/ }));
    await user.click(
      screen.getByRole("radio", { name: /Choose My Challenge/ }),
    );
    await user.click(screen.getByRole("button", { name: /^Pick Your Own/ }));
    await user.click(screen.getByRole("button", { name: /^The Number 7/ }));
    await user.click(screen.getByRole("button", { name: /^The Number 7/ }));

    // All 3 slots chosen (1 diy + 2 the-number-7), but no film picked yet
    // for the diy slot — must stay disabled.
    expect(screen.getByText("3 of 3 challenges chosen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    );
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).not.toBeDisabled();
  });

  it("shows an optional backup-film picker under 'Decide For Me', never blocking submission", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[NUMBER_SEVEN, DIY_CHALLENGE]}
        availableGenres={[]}
        diyEligibleFilms={DIY_FILMS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Baby/ }));
    expect(
      screen.getByText(
        'Want a chance at a "Pick Your Own" challenge slot? (optional)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).not.toBeDisabled();
  });
});
