import { describe, expect, it } from "vitest";
import { RECOMMENDATION_QUESTIONS } from "./recommendation-questions";
import type { DiySelectableFilmView } from "./diy-film-card";

function makeFilm(
  overrides: Partial<DiySelectableFilmView> & { entryId: string },
): DiySelectableFilmView {
  return {
    title: overrides.entryId,
    releaseYear: null,
    runtimeMinutes: null,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-01",
    ...overrides,
  };
}

function question(id: string) {
  const found = RECOMMENDATION_QUESTIONS.find((q) => q.id === id);
  if (!found) throw new Error(`no question registered with id "${id}"`);
  return found;
}

describe("RECOMMENDATION_QUESTIONS", () => {
  describe("highest-rated", () => {
    it("sorts by the same rating source FDraft already uses, highest first", () => {
      const films = [
        makeFilm({ entryId: "low", averageRating: 2.1 }),
        makeFilm({ entryId: "high", averageRating: 4.8 }),
        makeFilm({ entryId: "mid", averageRating: 3.5 }),
      ];
      const result = question("highest-rated").recommend(films);
      expect(result.map((f) => f.entryId)).toEqual(["high", "mid", "low"]);
    });

    it("caps results at 10 even when more eligible films exist", () => {
      const films = Array.from({ length: 15 }, (_, i) =>
        makeFilm({ entryId: `film-${i}`, averageRating: i }),
      );
      const result = question("highest-rated").recommend(films);
      expect(result).toHaveLength(10);
      // Highest ratings (14 down to 5) are the top 10.
      expect(result.map((f) => f.entryId)).toEqual([
        "film-14",
        "film-13",
        "film-12",
        "film-11",
        "film-10",
        "film-9",
        "film-8",
        "film-7",
        "film-6",
        "film-5",
      ]);
    });

    it("puts films with no rating at all last, never crashing on missing data", () => {
      const films = [
        makeFilm({ entryId: "unrated", averageRating: null }),
        makeFilm({ entryId: "rated", averageRating: 1 }),
      ];
      const result = question("highest-rated").recommend(films);
      expect(result.map((f) => f.entryId)).toEqual(["rated", "unrated"]);
    });
  });

  describe("longest-on-watchlist", () => {
    it("sorts by oldest date-added first", () => {
      const films = [
        makeFilm({ entryId: "newest", dateAdded: "2024-06-01" }),
        makeFilm({ entryId: "oldest", dateAdded: "2023-01-01" }),
        makeFilm({ entryId: "middle", dateAdded: "2023-12-01" }),
      ];
      const result = question("longest-on-watchlist").recommend(films);
      expect(result.map((f) => f.entryId)).toEqual([
        "oldest",
        "middle",
        "newest",
      ]);
    });

    it("caps results at 5 even when more eligible films exist", () => {
      const films = Array.from({ length: 8 }, (_, i) =>
        makeFilm({
          entryId: `film-${i}`,
          dateAdded: `2024-01-0${i + 1}`,
        }),
      );
      const result = question("longest-on-watchlist").recommend(films);
      expect(result).toHaveLength(5);
      expect(result.map((f) => f.entryId)).toEqual([
        "film-0",
        "film-1",
        "film-2",
        "film-3",
        "film-4",
      ]);
    });
  });

  it("never mutates the input film list — pure recommendation, no side effects", () => {
    const films = [
      makeFilm({ entryId: "a", averageRating: 1 }),
      makeFilm({ entryId: "b", averageRating: 2 }),
    ];
    const snapshot = films.map((f) => f.entryId);
    for (const q of RECOMMENDATION_QUESTIONS) {
      q.recommend(films);
    }
    expect(films.map((f) => f.entryId)).toEqual(snapshot);
  });
});
