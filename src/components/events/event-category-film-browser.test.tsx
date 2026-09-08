import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventCategoryFilmBrowser } from "./event-category-film-browser";
import type { EventCategorySelectableFilmView } from "./event-category-film-card";

afterEach(() => {
  cleanup();
});

function film(
  overrides: Partial<EventCategorySelectableFilmView> = {},
): EventCategorySelectableFilmView {
  return {
    filmId: "film-1",
    title: "Untitled",
    releaseYear: 2000,
    runtimeMinutes: null,
    posterUrl: null,
    averageRating: null,
    onWatchlist: false,
    ...overrides,
  };
}

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE
 * CLEANUP" §8/§9 — the "Prefer items from my Watchlist" toggle's effect on
 * "Choose My Own" ordering: ON sorts Watchlist films to the top, OFF is
 * plain alphabetical. Either way every film stays visible — this only ever
 * reorders, never filters.
 */
describe("EventCategoryFilmBrowser — ordering vs Prefer items from my Watchlist", () => {
  const films = [
    film({ filmId: "z", title: "Zed Movie", onWatchlist: false }),
    film({ filmId: "a", title: "Alpha Movie", onWatchlist: false }),
    film({ filmId: "m", title: "Mid Movie", onWatchlist: true }),
  ];

  function titlesInOrder() {
    return screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p")?.textContent);
  }

  it("preferWatchlist ON sorts Watchlist films first, then alphabetically within each group", () => {
    render(
      <EventCategoryFilmBrowser
        films={films}
        selectedFilmIds={new Set()}
        preferWatchlist={true}
        onToggle={vi.fn()}
      />,
    );
    expect(titlesInOrder()).toEqual(["Mid Movie", "Alpha Movie", "Zed Movie"]);
  });

  it("preferWatchlist OFF ignores watchlist membership — plain alphabetical throughout", () => {
    render(
      <EventCategoryFilmBrowser
        films={films}
        selectedFilmIds={new Set()}
        preferWatchlist={false}
        onToggle={vi.fn()}
      />,
    );
    expect(titlesInOrder()).toEqual(["Alpha Movie", "Mid Movie", "Zed Movie"]);
  });

  it("never hides a non-Watchlist film, in either state", () => {
    render(
      <EventCategoryFilmBrowser
        films={films}
        selectedFilmIds={new Set()}
        preferWatchlist={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
