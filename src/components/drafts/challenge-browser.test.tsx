import { cleanup, render, screen, within } from "@testing-library/react";
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
    expect(screen.queryByText(/films? chosen$/)).not.toBeInTheDocument();
  });

  it("shows one 'choose a film' slot per chosen diy challenge", () => {
    renderBrowser({ selectedChallengeIds: ["diy"] });
    expect(
      screen.getByText("Pick Your Own — 0 of 1 film chosen"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    ).toBeInTheDocument();
  });

  it("pluralizes the count for more than one diy slot, with one button per slot", () => {
    renderBrowser({ selectedChallengeIds: ["diy", "diy"] });
    expect(
      screen.getByText("Pick Your Own — 0 of 2 films chosen"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose a film for slot 2" }),
    ).toBeInTheDocument();
  });

  it("opens a picker sheet for the clicked slot, listing the DIY-eligible films", async () => {
    const user = userEvent.setup();
    renderBrowser({ selectedChallengeIds: ["diy"] });
    await user.click(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    );
    expect(
      screen.getByRole("heading", { name: "Pick Your Own" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Choose exactly one film/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beta/ })).toBeInTheDocument();
  });

  it("confirming a pick calls onDiyChallengeFilmEntryIdsChange with that film in the right slot", async () => {
    const onDiyChange = vi.fn();
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"],
      onDiyChallengeFilmEntryIdsChange: onDiyChange,
    });
    await user.click(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    );
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onDiyChange).toHaveBeenCalledWith(["entry-1"]);
  });

  it("cancelling the sheet never calls onDiyChallengeFilmEntryIdsChange", async () => {
    const onDiyChange = vi.fn();
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"],
      onDiyChallengeFilmEntryIdsChange: onDiyChange,
    });
    await user.click(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    );
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiyChange).not.toHaveBeenCalled();
  });

  it("the Confirm button stays disabled until a film is picked", async () => {
    const user = userEvent.setup();
    renderBrowser({ selectedChallengeIds: ["diy"] });
    await user.click(
      screen.getByRole("button", { name: "Choose a film for slot 1" }),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("shows an already-filled slot's film, with Change/Clear actions", () => {
    renderBrowser({
      selectedChallengeIds: ["diy"],
      diyChallengeFilmEntryIds: ["entry-1"],
    });
    expect(
      screen.getByText("Pick Your Own — 1 of 1 film chosen"),
    ).toBeInTheDocument();
    expect(screen.getByText("Alpha (2020)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear Pick Your Own slot 1 of 1" }),
    ).toBeInTheDocument();
  });

  it("Clear removes that slot's pick", async () => {
    const onDiyChange = vi.fn();
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"],
      diyChallengeFilmEntryIds: ["entry-1"],
      onDiyChallengeFilmEntryIdsChange: onDiyChange,
    });
    await user.click(
      screen.getByRole("button", { name: "Clear Pick Your Own slot 1 of 1" }),
    );
    expect(onDiyChange).toHaveBeenCalledWith([null]);
  });

  it("excludes a film already chosen for another slot from a second slot's picker", async () => {
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy", "diy"],
      diyChallengeFilmEntryIds: ["entry-1", null],
    });
    await user.click(
      screen.getByRole("button", { name: "Choose a film for slot 2" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: /Alpha/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Beta/ }),
    ).toBeInTheDocument();
  });

  it("re-opening an already-filled slot's picker still offers its own current film", async () => {
    const user = userEvent.setup();
    renderBrowser({
      selectedChallengeIds: ["diy"],
      diyChallengeFilmEntryIds: ["entry-1"],
    });
    await user.click(screen.getByRole("button", { name: "Change" }));
    const alphaButton = screen.getByRole("button", { name: /Alpha/ });
    expect(alphaButton).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a clear message when there are no eligible films to pick from", () => {
    renderBrowser({ selectedChallengeIds: ["diy"], diyEligibleFilms: [] });
    expect(
      screen.getByText("No eligible films on your watchlist right now."),
    ).toBeInTheDocument();
  });
});
