import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendationSidebar } from "./recommendation-sidebar";
import type { DiySelectableFilmView } from "./diy-film-card";

afterEach(cleanup);

const NOW = new Date(2026, 7, 19);

const FILMS: DiySelectableFilmView[] = [
  {
    entryId: "entry-1",
    filmId: "film-1",
    title: "Alpha",
    releaseYear: 2020,
    runtimeMinutes: 100,
    posterUrl: null,
    averageRating: 5,
    dateAdded: "2023-01-01",
    genres: null,
  },
  {
    entryId: "entry-2",
    filmId: "film-2",
    title: "Beta",
    releaseYear: 2021,
    runtimeMinutes: 90,
    posterUrl: null,
    averageRating: 2,
    dateAdded: "2024-01-01",
    genres: null,
  },
];

describe("RecommendationSidebar", () => {
  it("shows the updated Need Ideas copy", () => {
    render(
      <RecommendationSidebar
        films={FILMS}
        selectedEntryIds={new Set()}
        onToggle={vi.fn()}
        now={NOW}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Need ideas?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Below are some questions that might give you some ideas — and some relevant movies!",
      ),
    ).toBeInTheDocument();
  });

  it("lists all five recommendation questions", () => {
    render(
      <RecommendationSidebar
        films={FILMS}
        selectedEntryIds={new Set()}
        onToggle={vi.fn()}
        now={NOW}
      />,
    );
    for (const label of [
      "What are my highest rated movies?",
      "What movies have been on my watchlist the longest?",
      "I want something short",
      "I want something recent",
      "Take me back",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("never selects a film on its own render — selection stays exactly what the caller passed in", () => {
    const onToggle = vi.fn();
    render(
      <RecommendationSidebar
        films={FILMS}
        selectedEntryIds={new Set()}
        onToggle={onToggle}
        now={NOW}
      />,
    );
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("forwards a click on a recommended film to the same onToggle callback the main grid uses", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <RecommendationSidebar
        films={FILMS}
        selectedEntryIds={new Set()}
        onToggle={onToggle}
        now={NOW}
      />,
    );

    const summary = screen.getByText("What are my highest rated movies?");
    await user.click(summary);
    const question = summary.closest("details");
    if (!question) throw new Error("expected a <details> ancestor");
    await user.click(within(question).getByRole("button", { name: /Alpha/ }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("entry-1");
  });

  it("shows each result's qualifier (why it qualified)", async () => {
    const user = userEvent.setup();
    render(
      <RecommendationSidebar
        films={FILMS}
        selectedEntryIds={new Set()}
        onToggle={vi.fn()}
        now={NOW}
      />,
    );
    const summary = screen.getByText("What are my highest rated movies?");
    await user.click(summary);
    const question = summary.closest("details");
    if (!question) throw new Error("expected a <details> ancestor");
    expect(within(question).getByText("★ 5.0")).toBeInTheDocument();
  });

  it("reflects an already-selected film's state without mutating the selection set itself", () => {
    render(
      <RecommendationSidebar
        films={FILMS}
        selectedEntryIds={new Set(["entry-2"])}
        onToggle={vi.fn()}
        now={NOW}
      />,
    );
    const summary = screen.getByText("What are my highest rated movies?");
    const question = summary.closest("details");
    if (!question) throw new Error("expected a <details> ancestor");
    const betaButton = within(question).getByRole("button", { name: /Beta/ });
    expect(betaButton).toHaveAttribute("aria-pressed", "true");
    const alphaButton = within(question).getByRole("button", { name: /Alpha/ });
    expect(alphaButton).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a clear empty state for a question no eligible film matches", () => {
    const noRatingsFilms = FILMS.map((film) => ({
      ...film,
      averageRating: null,
    }));
    render(
      <RecommendationSidebar
        films={noRatingsFilms}
        selectedEntryIds={new Set()}
        onToggle={vi.fn()}
        now={NOW}
      />,
    );
    const summary = screen.getByText("What are my highest rated movies?");
    const question = summary.closest("details");
    if (!question) throw new Error("expected a <details> ancestor");
    expect(
      within(question).getByText(
        "No eligible films on your watchlist match this yet.",
      ),
    ).toBeInTheDocument();
  });
});
