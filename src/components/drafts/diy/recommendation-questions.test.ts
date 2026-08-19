import { describe, expect, it } from "vitest";
import { RECOMMENDATION_QUESTIONS } from "./recommendation-questions";
import type { DiySelectableFilmView } from "./diy-film-card";

const NOW = new Date(2026, 7, 19);

function makeFilm(
  overrides: Partial<DiySelectableFilmView> & { entryId: string },
): DiySelectableFilmView {
  return {
    filmId: `film-${overrides.entryId}`,
    title: overrides.entryId,
    releaseYear: null,
    runtimeMinutes: null,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-01",
    genres: null,
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
      const result = question("highest-rated").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["high", "mid", "low"]);
    });

    it("caps results at 10 even when more eligible films exist", () => {
      const films = Array.from({ length: 15 }, (_, i) =>
        makeFilm({ entryId: `film-${i}`, averageRating: i }),
      );
      const result = question("highest-rated").recommend(films, NOW);
      expect(result).toHaveLength(10);
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

    it("excludes films with no trustworthy rating at all, rather than padding the list out with them", () => {
      const films = [
        makeFilm({ entryId: "unrated", averageRating: null }),
        makeFilm({ entryId: "rated", averageRating: 1 }),
      ];
      const result = question("highest-rated").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["rated"]);
    });

    it("shows the rating alongside each result", () => {
      const film = makeFilm({ entryId: "a", averageRating: 4.567 });
      expect(question("highest-rated").qualifier(film, NOW)).toBe("★ 4.6");
    });
  });

  describe("longest-on-watchlist", () => {
    it("sorts by oldest date-added first", () => {
      const films = [
        makeFilm({ entryId: "newest", dateAdded: "2024-06-01" }),
        makeFilm({ entryId: "oldest", dateAdded: "2023-01-01" }),
        makeFilm({ entryId: "middle", dateAdded: "2023-12-01" }),
      ];
      const result = question("longest-on-watchlist").recommend(films, NOW);
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
      const result = question("longest-on-watchlist").recommend(films, NOW);
      expect(result).toHaveLength(5);
      expect(result.map((f) => f.entryId)).toEqual([
        "film-0",
        "film-1",
        "film-2",
        "film-3",
        "film-4",
      ]);
    });

    it("shows how long each result has been on the watchlist", () => {
      const film = makeFilm({ entryId: "a", dateAdded: "2026-01-01" });
      expect(question("longest-on-watchlist").qualifier(film, NOW)).toBe(
        "On your watchlist for 7 months",
      );
    });
  });

  describe("something-short", () => {
    it("only includes films under 120 minutes", () => {
      const films = [
        makeFilm({ entryId: "long", runtimeMinutes: 150 }),
        makeFilm({ entryId: "short", runtimeMinutes: 90 }),
        makeFilm({ entryId: "exactly-120", runtimeMinutes: 120 }),
      ];
      const result = question("something-short").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["short"]);
    });

    it("excludes films with no trustworthy runtime at all", () => {
      const films = [
        makeFilm({ entryId: "unknown", runtimeMinutes: null }),
        makeFilm({ entryId: "known", runtimeMinutes: 90 }),
      ];
      const result = question("something-short").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["known"]);
    });

    it("orders shortest first", () => {
      const films = [
        makeFilm({ entryId: "a", runtimeMinutes: 110 }),
        makeFilm({ entryId: "b", runtimeMinutes: 80 }),
        makeFilm({ entryId: "c", runtimeMinutes: 95 }),
      ];
      const result = question("something-short").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["b", "c", "a"]);
    });

    it("shows the runtime alongside each result", () => {
      const film = makeFilm({ entryId: "a", runtimeMinutes: 87 });
      expect(question("something-short").qualifier(film, NOW)).toBe("87 min");
    });
  });

  describe("something-recent", () => {
    it("sorts newest release year first", () => {
      const films = [
        makeFilm({ entryId: "old", releaseYear: 1990 }),
        makeFilm({ entryId: "new", releaseYear: 2024 }),
        makeFilm({ entryId: "mid", releaseYear: 2010 }),
      ];
      const result = question("something-recent").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["new", "mid", "old"]);
    });

    it("excludes films with no trustworthy release year", () => {
      const films = [
        makeFilm({ entryId: "unknown", releaseYear: null }),
        makeFilm({ entryId: "known", releaseYear: 2020 }),
      ];
      const result = question("something-recent").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["known"]);
    });

    it("shows the release year alongside each result", () => {
      const film = makeFilm({ entryId: "a", releaseYear: 2024 });
      expect(question("something-recent").qualifier(film, NOW)).toBe(
        "Released in 2024",
      );
    });
  });

  describe("take-me-back", () => {
    it("sorts toward the oldest release years", () => {
      const films = [
        makeFilm({ entryId: "old", releaseYear: 1962 }),
        makeFilm({ entryId: "new", releaseYear: 2024 }),
        makeFilm({ entryId: "mid", releaseYear: 2001 }),
      ];
      const result = question("take-me-back").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["old", "mid", "new"]);
    });

    it("excludes films with no trustworthy release year", () => {
      const films = [
        makeFilm({ entryId: "unknown", releaseYear: null }),
        makeFilm({ entryId: "known", releaseYear: 1975 }),
      ];
      const result = question("take-me-back").recommend(films, NOW);
      expect(result.map((f) => f.entryId)).toEqual(["known"]);
    });

    it("shows the release year alongside each result", () => {
      const film = makeFilm({ entryId: "a", releaseYear: 1975 });
      expect(question("take-me-back").qualifier(film, NOW)).toBe(
        "Released in 1975",
      );
    });
  });

  it("never mutates the input film list — pure recommendation, no side effects", () => {
    const films = [
      makeFilm({ entryId: "a", averageRating: 1 }),
      makeFilm({ entryId: "b", averageRating: 2 }),
    ];
    const snapshot = films.map((f) => f.entryId);
    for (const q of RECOMMENDATION_QUESTIONS) {
      q.recommend(films, NOW);
    }
    expect(films.map((f) => f.entryId)).toEqual(snapshot);
  });

  it("has exactly the five specified questions, no more, no fewer", () => {
    expect(RECOMMENDATION_QUESTIONS.map((q) => q.id).sort()).toEqual(
      [
        "highest-rated",
        "longest-on-watchlist",
        "something-short",
        "something-recent",
        "take-me-back",
      ].sort(),
    );
  });
});
