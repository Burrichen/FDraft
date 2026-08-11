import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { genreChallenges } from "./genres";
import { buildContext, buildFilm, buildWatchedFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = genreChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("genreChallenges", () => {
  it("registers exactly the 9 genre challenges with unique ids", () => {
    const ids = genreChallenges.map((c) => c.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    expect(genreChallenges.every((c) => c.category === "genres")).toBe(true);
    expect(genreChallenges.every((c) => c.interactive === false)).toBe(true);
  });

  describe("genre-roulette", () => {
    const challenge = findChallenge("genre-roulette");

    it("only picks a film containing the chosen genre", () => {
      const films = [
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Comedy"] }),
      ];
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
        if (result.status === "success") {
          expect(result.film.genres).toContain(
            films.find((f) => f.filmId === result.film.filmId)?.genres?.[0],
          );
        }
      }
    });

    it("is ineligible when no film has known genres", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_genres",
      });
    });

    it("supports a manually selected genre for Choose My Challenge", () => {
      const winner = buildFilm({ genres: ["Horror"] });
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Comedy"] }), winner],
        manualSelections: { genre: "Horror" },
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when the manually selected genre has no matching film", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Comedy"] })],
        manualSelections: { genre: "Horror" },
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_with_manually_selected_genre",
      });
    });
  });

  describe("watchlist-infestation", () => {
    const challenge = findChallenge("watchlist-infestation");

    it("only picks from the most common genre", () => {
      const horrorFilms = [
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Horror"] }),
      ];
      const comedyFilm = buildFilm({ genres: ["Comedy"] });
      const result = challenge.attempt(
        buildContext({ candidates: [...horrorFilms, comedyFilm] }),
      );
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.film.genres).toEqual(["Horror"]);
      }
    });

    it("is ineligible when no film has known genres", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ genres: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_genres",
      });
    });

    it("breaks a tie between equally common genres", () => {
      const films = [
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Comedy"] }),
      ];
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.size).toBeGreaterThan(0);
    });
  });

  describe("extinction-event", () => {
    const challenge = findChallenge("extinction-event");

    it("only picks from the least common genre", () => {
      const horrorFilms = [
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Horror"] }),
      ];
      const rareFilm = buildFilm({ genres: ["Documentary"] });
      const result = challenge.attempt(
        buildContext({ candidates: [...horrorFilms, rareFilm] }),
      );
      expect(result).toMatchObject({ status: "success", film: rareFilm });
    });

    it("is ineligible when no film has known genres", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ genres: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_genres",
      });
    });
  });

  describe("genre-detox", () => {
    const challenge = findChallenge("genre-detox");

    it("picks a genre absent from the last five picks", () => {
      const winner = buildFilm({ genres: ["Documentary"] });
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror"] }), winner],
        previousPicks: [buildFilm({ genres: ["Horror"] })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("only looks at the last five picks, not further back", () => {
      const winner = buildFilm({ genres: ["Horror"] });
      const context = buildContext({
        candidates: [winner],
        previousPicks: [
          buildFilm({ genres: ["Horror"] }), // 6th-from-last — outside the lookback window
          buildFilm({ genres: ["Comedy"] }),
          buildFilm({ genres: ["Comedy"] }),
          buildFilm({ genres: ["Comedy"] }),
          buildFilm({ genres: ["Comedy"] }),
          buildFilm({ genres: ["Comedy"] }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when every represented genre appeared in the last five picks", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror"] })],
        previousPicks: [buildFilm({ genres: ["Horror"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_genre_absent_from_recent_picks",
      });
    });

    it("works with no previous picks at all", () => {
      const winner = buildFilm({ genres: ["Horror"] });
      const result = challenge.attempt(
        buildContext({ candidates: [winner], previousPicks: [] }),
      );
      expect(result).toMatchObject({ status: "success", film: winner });
    });
  });

  describe("double-agent", () => {
    const challenge = findChallenge("double-agent");

    it("picks a film matching both randomly chosen genres", () => {
      const winner = buildFilm({ genres: ["Horror", "Comedy"] });
      const context = buildContext({
        candidates: [
          winner,
          buildFilm({ genres: ["Horror"] }),
          buildFilm({ genres: ["Comedy"] }),
        ],
      });
      const result = challenge.attempt(context);
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.film.filmId).toBe(winner.filmId);
        expect(result.displayValue?.genres).toBeDefined();
      }
    });

    it("is ineligible with fewer than two genres represented", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror"] })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "fewer_than_two_genres_represented",
      });
    });

    it("rerolls to a different genre pair when the first has no match, bounded by a max attempt count", () => {
      // Horror+Comedy has no film; Horror+Drama does. The engine must try
      // more than one pair before succeeding.
      const winner = buildFilm({ genres: ["Horror", "Drama"] });
      const context = buildContext({
        candidates: [
          winner,
          buildFilm({ genres: ["Horror"] }),
          buildFilm({ genres: ["Comedy"] }),
          buildFilm({ genres: ["Drama"] }),
        ],
      });
      let sawSuccess = false;
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt({
          ...context,
          rng: createSeededRng(seed),
        });
        if (result.status === "success") {
          sawSuccess = true;
          expect(result.film.filmId).toBe(winner.filmId);
        }
      }
      expect(sawSuccess).toBe(true);
    });

    it("is ineligible when no pair of genres has a matching film after exhausting attempts", () => {
      // Every film has exactly one distinct genre — no pair can ever match.
      const context = buildContext({
        candidates: [
          buildFilm({ genres: ["Horror"] }),
          buildFilm({ genres: ["Comedy"] }),
          buildFilm({ genres: ["Drama"] }),
        ],
      });
      const result = challenge.attempt(context);
      expect(result).toEqual({
        status: "ineligible",
        reason: "no_film_matching_any_genre_pair_after_max_attempts",
      });
    });
  });

  describe("genre-collision", () => {
    const challenge = findChallenge("genre-collision");

    it("requires watched_history", () => {
      expect(challenge.requiredCapabilities).toContain("watched_history");
    });

    it("is ineligible when there is no watched history at all", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror"] })],
        watchedFilms: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_watched_history_available",
      });
    });

    it("picks a film whose genre combination has never been watched", () => {
      const winner = buildFilm({ genres: ["Horror", "Comedy"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [buildWatchedFilm({ genres: ["Drama"] })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when every candidate's genre combination was already watched", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror", "Comedy"] })],
        watchedFilms: [buildWatchedFilm({ genres: ["Horror", "Comedy"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_with_unwatched_genre_combination",
      });
    });

    it("treats genre combinations canonically — order does not matter", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Comedy", "Horror"] })],
        watchedFilms: [buildWatchedFilm({ genres: ["Horror", "Comedy"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_with_unwatched_genre_combination",
      });
    });
  });

  describe("genre-whiplash", () => {
    const challenge = findChallenge("genre-whiplash");

    it("requires a previous draft pick", () => {
      expect(challenge.requiredCapabilities).toContain("previous_draft_pick");
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror"] })],
        previousPicks: [],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_previous_draft_pick",
      });
    });

    it("is ineligible when the previous pick has no known genres", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror"] })],
        previousPicks: [buildFilm({ genres: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "previous_pick_missing_genres",
      });
    });

    it("picks a film sharing zero genres with the previous pick", () => {
      const winner = buildFilm({ genres: ["Documentary"] });
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror", "Comedy"] }), winner],
        previousPicks: [buildFilm({ genres: ["Horror"] })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("excludes a film sharing even one genre", () => {
      const context = buildContext({
        candidates: [buildFilm({ genres: ["Horror", "Comedy"] })],
        previousPicks: [buildFilm({ genres: ["Horror"] })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("dominant-species", () => {
    const challenge = findChallenge("dominant-species");

    it("only picks from the most common genre", () => {
      const horrorFilms = [
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Horror"] }),
      ];
      const comedyFilm = buildFilm({ genres: ["Comedy"] });
      const result = challenge.attempt(
        buildContext({ candidates: [...horrorFilms, comedyFilm] }),
      );
      expect(result.status).toBe("success");
      if (result.status === "success")
        expect(result.film.genres).toEqual(["Horror"]);
    });

    it("is ineligible when no film has known genres", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ genres: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_genres",
      });
    });
  });

  describe("minority-report", () => {
    const challenge = findChallenge("minority-report");

    it("only picks from one of the three smallest genres", () => {
      const films = [
        ...Array.from({ length: 10 }, () => buildFilm({ genres: ["Horror"] })),
        buildFilm({ genres: ["Documentary"] }),
        buildFilm({ genres: ["Noir"] }),
        buildFilm({ genres: ["Western"] }),
      ];
      const smallGenreIds = new Set(["Documentary", "Noir", "Western"]);
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
        if (result.status === "success") {
          expect(result.film.genres?.some((g) => smallGenreIds.has(g))).toBe(
            true,
          );
        }
      }
    });

    it("works with fewer than three genres represented", () => {
      const films = [
        buildFilm({ genres: ["Horror"] }),
        buildFilm({ genres: ["Comedy"] }),
      ];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
    });

    it("is ineligible when no film has known genres", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ genres: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_genres",
      });
    });
  });
});
