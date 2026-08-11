import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "../types";
import { directorChallenges } from "./directors";
import { buildContext, buildFilm, buildWatchedFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = directorChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("directorChallenges", () => {
  it("registers exactly the 9 director challenges with unique ids", () => {
    const ids = directorChallenges.map((c) => c.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    expect(directorChallenges.every((c) => c.category === "directors")).toBe(
      true,
    );
    expect(directorChallenges.every((c) => c.interactive === false)).toBe(true);
  });

  describe("director-roulette", () => {
    const challenge = findChallenge("director-roulette");

    it("only picks a film from a director with more than one active film", () => {
      const films = [
        buildFilm({ directors: ["Nolan"] }),
        buildFilm({ directors: ["Nolan"] }),
        buildFilm({ directors: ["Tarantino"] }),
      ];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
      if (result.status === "success")
        expect(result.film.directors).toEqual(["Nolan"]);
    });

    it("is ineligible when no director has more than one active film", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_director_with_multiple_active_films",
      });
    });

    it("is ineligible when director metadata is entirely missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("finish-the-job", () => {
    const challenge = findChallenge("finish-the-job");

    it("picks a remaining film from a director watched multiple times", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Nolan"] }),
          buildWatchedFilm({ directors: ["Nolan"] }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when the director has fewer than two watched films", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [buildWatchedFilm({ directors: ["Nolan"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_director_with_multiple_watched_and_remaining_unwatched",
      });
    });

    it("is ineligible when there is no watched history at all", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is ineligible when the qualifying director has nothing left on the watchlist", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Tarantino"] })],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Nolan"] }),
          buildWatchedFilm({ directors: ["Nolan"] }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_director_with_multiple_watched_and_remaining_unwatched",
      });
    });
  });

  describe("new-blood", () => {
    const challenge = findChallenge("new-blood");

    it("picks a film from a director never watched before", () => {
      const winner = buildFilm({ directors: ["Fresh Director"] });
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] }), winner],
        watchedFilms: [buildWatchedFilm({ directors: ["Nolan"] })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("treats every director as new when there is no watch history", () => {
      const film = buildFilm({ directors: ["Nolan"] });
      const result = challenge.attempt(
        buildContext({ candidates: [film], watchedFilms: [] }),
      );
      expect(result).toMatchObject({ status: "success", film });
    });

    it("is ineligible when every represented director has been watched", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [buildWatchedFilm({ directors: ["Nolan"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_from_a_never_watched_director",
      });
    });

    it("is ineligible when director metadata is missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("old-friend", () => {
    const challenge = findChallenge("old-friend");

    it("picks a film from a director rated 4+ stars previously", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Nolan"], userRating: 4.5 }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("boundary: exactly 4.0 qualifies (the documented default threshold)", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Nolan"], userRating: 4.0 }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("respects a configured threshold", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Nolan"], userRating: 3.5 }),
        ],
        config: {
          ...DEFAULT_CHALLENGE_ENGINE_CONFIG,
          oldFriendMinUserRating: 3.5,
        },
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no director was rated highly", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Nolan"], userRating: 2.0 }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_from_a_highly_rated_director",
      });
    });

    it("is ineligible when there are no user ratings at all", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("second-chance", () => {
    const challenge = findChallenge("second-chance");

    it("picks a film from a director whose most recent watched film was rated poorly", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 4.0,
            watchedAt: "2020-01-01",
          }),
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 1.5,
            watchedAt: "2021-01-01",
          }), // most recent
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("boundary: exactly 2.0 qualifies (the documented default threshold)", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 2.0,
            watchedAt: "2021-01-01",
          }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when the director was watched again after the poor rating", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 1.0,
            watchedAt: "2020-01-01",
          }),
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 4.5,
            watchedAt: "2021-01-01",
          }), // most recent — not poor
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_qualifying_second_chance_director",
      });
    });

    it("excludes watched records with an unknown watched date from the recency comparison", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
        watchedFilms: [
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 1.0,
            watchedAt: null,
          }),
        ],
      });
      // Cannot establish "most recent" without a date, so this director never qualifies.
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("respects a configured threshold", () => {
      const winner = buildFilm({ directors: ["Nolan"] });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({
            directors: ["Nolan"],
            userRating: 2.5,
            watchedAt: "2021-01-01",
          }),
        ],
        config: {
          ...DEFAULT_CHALLENGE_ENGINE_CONFIG,
          secondChanceMaxPoorRating: 2.5,
        },
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });
  });

  describe("auteur-month", () => {
    const challenge = findChallenge("auteur-month");

    it("picks a film from a director with at least three active films", () => {
      const films = [
        buildFilm({ directors: ["Nolan"] }),
        buildFilm({ directors: ["Nolan"] }),
        buildFilm({ directors: ["Nolan"] }),
      ];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
    });

    it("boundary: exactly two films does not qualify", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ directors: ["Nolan"] }),
          buildFilm({ directors: ["Nolan"] }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is ineligible when no director reaches three films", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_director_with_three_or_more_active_films",
      });
    });
  });

  describe("one-and-done", () => {
    const challenge = findChallenge("one-and-done");

    it("picks a film whose director appears exactly once", () => {
      const winner = buildFilm({ directors: ["Solo Director"] });
      const context = buildContext({
        candidates: [
          buildFilm({ directors: ["Nolan"] }),
          buildFilm({ directors: ["Nolan"] }),
          winner,
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when every director appears more than once", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ directors: ["Nolan"] }),
          buildFilm({ directors: ["Nolan"] }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_director_represented_exactly_once",
      });
    });
  });

  describe("director-monopoly", () => {
    const challenge = findChallenge("director-monopoly");

    it("picks a film from the director with the most active films", () => {
      const nolanFilms = [
        buildFilm({ directors: ["Nolan"] }),
        buildFilm({ directors: ["Nolan"] }),
        buildFilm({ directors: ["Nolan"] }),
      ];
      const other = buildFilm({ directors: ["Tarantino"] });
      const result = challenge.attempt(
        buildContext({ candidates: [...nolanFilms, other] }),
      );
      expect(result.status).toBe("success");
      if (result.status === "success")
        expect(result.film.directors).toEqual(["Nolan"]);
    });

    it("is ineligible when director metadata is missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_directors",
      });
    });

    it("breaks a tie between directors with equally many films", () => {
      const films = [
        buildFilm({ directors: ["A"] }),
        buildFilm({ directors: ["B"] }),
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

  describe("passing-the-torch", () => {
    const challenge = findChallenge("passing-the-torch");

    it("requires a previous draft pick", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"], genres: ["Horror"] })],
        previousPicks: [],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_previous_draft_pick",
      });
    });

    it("is ineligible when the previous pick has no known directors", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        previousPicks: [buildFilm({ directors: null, genres: ["Horror"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "previous_pick_missing_directors",
      });
    });

    it("is ineligible when the previous pick has no known genres", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        previousPicks: [buildFilm({ directors: ["Nolan"], genres: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "previous_pick_missing_genres",
      });
    });

    it("picks a different director sharing a genre with the previous pick", () => {
      const winner = buildFilm({
        directors: ["Tarantino"],
        genres: ["Horror"],
      });
      const context = buildContext({
        candidates: [
          winner,
          buildFilm({ directors: ["Nolan"], genres: ["Horror"] }),
        ],
        previousPicks: [
          buildFilm({ directors: ["Nolan"], genres: ["Horror", "Drama"] }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("excludes a film sharing a director with the previous pick even if genres match", () => {
      const context = buildContext({
        candidates: [buildFilm({ directors: ["Nolan"], genres: ["Horror"] })],
        previousPicks: [
          buildFilm({ directors: ["Nolan"], genres: ["Horror"] }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("excludes a film from a different director sharing no genres", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ directors: ["Tarantino"], genres: ["Comedy"] }),
        ],
        previousPicks: [
          buildFilm({ directors: ["Nolan"], genres: ["Horror"] }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });
});
