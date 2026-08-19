import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChallengeBrowser,
  type ChallengeAvailability,
} from "./challenge-browser";
import type { DiySelectableFilmView } from "@/components/drafts/diy/diy-film-card";

afterEach(cleanup);

const CHALLENGES: ChallengeAvailability[] = [
  {
    id: "the-number-7",
    name: "The Number 7",
    description:
      "Shuffles your eligible watchlist and takes the seventh result.",
    category: "meta",
    interactive: false,
    eligible: true,
    ineligibleReason: null,
  },
  {
    id: "diy",
    name: "Pick Your Own",
    description: "You choose the exact film for this slot yourself.",
    category: "meta",
    interactive: false,
    eligible: true,
    ineligibleReason: null,
  },
];

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
  {
    entryId: "entry-2",
    filmId: "film-2",
    title: "Beta",
    releaseYear: 2021,
    runtimeMinutes: 90,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-02",
    genres: null,
  },
];

function renderBrowser(
  overrides: Partial<Parameters<typeof ChallengeBrowser>[0]> = {},
) {
  return render(
    <ChallengeBrowser
      challenges={CHALLENGES}
      availableGenres={[]}
      slotsNeeded={2}
      selectedChallengeIds={[]}
      onChange={vi.fn()}
      manualGenre=""
      onManualGenreChange={vi.fn()}
      diyEligibleFilms={DIY_FILMS}
      diyChallengeFilmEntryIds={[]}
      onDiyChallengeFilmEntryIdsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ChallengeBrowser — DIY Challenge Film", () => {
  it("lists 'Pick Your Own' as a normal, selectable challenge card", () => {
    renderBrowser();
    expect(screen.getByText("Pick Your Own")).toBeInTheDocument();
  });

  it("shows no film picker at all until a 'diy' slot is chosen", () => {
    renderBrowser({ selectedChallengeIds: ["the-number-7"] });
    expect(screen.queryByText(/choose \d+ of/)).not.toBeInTheDocument();
  });

  it("shows a film picker sized to how many 'diy' slots are chosen", () => {
    renderBrowser({ selectedChallengeIds: ["diy"] });
    expect(
      screen.getByText("Pick Your Own — choose 0 of 1 film"),
    ).toBeInTheDocument();
    expect(screen.getByText("Alpha (2020)")).toBeInTheDocument();
    expect(screen.getByText("Beta (2021)")).toBeInTheDocument();
  });

  it("pluralizes the count for more than one diy slot", () => {
    renderBrowser({ selectedChallengeIds: ["diy", "diy"] });
    expect(
      screen.getByText("Pick Your Own — choose 0 of 2 films"),
    ).toBeInTheDocument();
  });

  it("calls onDiyChallengeFilmEntryIdsChange when a film is picked", async () => {
    const onDiyChange = vi.fn();
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"],
      onDiyChallengeFilmEntryIdsChange: onDiyChange,
    });
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onDiyChange).toHaveBeenCalledWith(["entry-1"]);
  });

  it("deselects an already-picked film on a second click", async () => {
    const onDiyChange = vi.fn();
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"],
      diyChallengeFilmEntryIds: ["entry-1"],
      onDiyChallengeFilmEntryIdsChange: onDiyChange,
    });
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onDiyChange).toHaveBeenCalledWith([]);
  });

  it("does not allow picking more films than diy slots chosen", async () => {
    const onDiyChange = vi.fn();
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"], // only 1 slot
      diyChallengeFilmEntryIds: ["entry-1"], // already at the cap
      onDiyChallengeFilmEntryIdsChange: onDiyChange,
    });
    await user.click(screen.getByRole("button", { name: /Beta/ }));
    expect(onDiyChange).not.toHaveBeenCalled();
  });

  it("marks a picked film as selected", () => {
    renderBrowser({
      selectedChallengeIds: ["diy"],
      diyChallengeFilmEntryIds: ["entry-1"],
    });
    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a clear message when there are no eligible films to pick from", () => {
    renderBrowser({ selectedChallengeIds: ["diy"], diyEligibleFilms: [] });
    expect(
      screen.getByText("No eligible films on your watchlist right now."),
    ).toBeInTheDocument();
  });
});
