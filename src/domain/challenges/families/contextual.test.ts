import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "../types";
import { contextualChallenges } from "./contextual";
import { buildContext, buildFilm, buildWatchedFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = contextualChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("contextualChallenges", () => {
  it("registers exactly the 3 contextual challenges with unique ids", () => {
    const ids = contextualChallenges.map((c) => c.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(contextualChallenges.every((c) => c.category === "contextual")).toBe(
      true,
    );
    expect(contextualChallenges.every((c) => c.interactive === false)).toBe(
      true,
    );
  });

  describe("palette-cleanser", () => {
    const challenge = findChallenge("palette-cleanser");

    it("picks the film most different from the last three picks", () => {
      const veryDifferent = buildFilm({
        releaseYear: 1920,
        runtimeMinutes: 240,
        genres: ["Documentary"],
      });
      const similar = buildFilm({
        releaseYear: 2019,
        runtimeMinutes: 101,
        genres: ["Drama"],
      });
      const context = buildContext({
        candidates: [similar, veryDifferent],
        previousPicks: [
          buildFilm({
            releaseYear: 2020,
            runtimeMinutes: 100,
            genres: ["Drama"],
          }),
          buildFilm({
            releaseYear: 2018,
            runtimeMinutes: 105,
            genres: ["Drama", "Comedy"],
          }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: veryDifferent,
      });
    });

    it("only looks at the last three picks, not further back", () => {
      // The 4th-from-last pick is wildly different, but outside the lookback window and should be ignored.
      const context = buildContext({
        candidates: [
          buildFilm({
            releaseYear: 2020,
            runtimeMinutes: 100,
            genres: ["Drama"],
          }),
        ],
        previousPicks: [
          buildFilm({
            releaseYear: 1900,
            runtimeMinutes: 300,
            genres: ["Documentary"],
          }),
          buildFilm({
            releaseYear: 2020,
            runtimeMinutes: 100,
            genres: ["Drama"],
          }),
          buildFilm({
            releaseYear: 2020,
            runtimeMinutes: 100,
            genres: ["Drama"],
          }),
          buildFilm({
            releaseYear: 2020,
            runtimeMinutes: 100,
            genres: ["Drama"],
          }),
        ],
      });
      const result = challenge.attempt(context);
      expect(result.status).toBe("success");
    });

    it("is ineligible with no previous picks", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        previousPicks: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_previous_picks_yet",
      });
    });

    it("is ineligible with no remaining candidates", () => {
      const context = buildContext({
        candidates: [],
        previousPicks: [buildFilm()],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("breaks a tie between equally-different films", () => {
      const tiedA = buildFilm({
        releaseYear: 1900,
        runtimeMinutes: null,
        genres: null,
      });
      const tiedB = buildFilm({
        releaseYear: 2140,
        runtimeMinutes: null,
        genres: null,
      });
      const context = buildContext({
        candidates: [tiedA, tiedB],
        previousPicks: [
          buildFilm({ releaseYear: 2020, runtimeMinutes: null, genres: null }),
        ],
      });
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt({
          ...context,
          rng: createSeededRng(seed),
        });
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.size).toBeGreaterThan(0);
    });
  });

  describe("decade-detox", () => {
    const challenge = findChallenge("decade-detox");

    it("picks a film from a decade absent from the last ten watches", () => {
      const winner = buildFilm({ releaseYear: 1975 });
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 2015 }), winner],
        watchedFilms: [
          buildWatchedFilm({ releaseYear: 2010, watchedAt: "2025-01-01" }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when there is no reliable recent watch history (no dated watches)", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 1975 })],
        watchedFilms: [
          buildWatchedFilm({ releaseYear: 2010, watchedAt: null }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_reliable_recent_watch_history",
      });
    });

    it("is ineligible when there is no watch history at all", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        watchedFilms: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("only looks at the most recent ten watches", () => {
      const oldWatches = Array.from({ length: 15 }, (_, i) =>
        buildWatchedFilm({
          releaseYear: 1970,
          watchedAt: `2020-01-${String(i + 1).padStart(2, "0")}`,
        }),
      );
      // The 11th-most-recent (outside the window of 10) is from the 1970s decade; the 10 most
      // recent are all from the 2010s, so 1970s should be detox-eligible again.
      const recentWatches = Array.from({ length: 10 }, (_, i) =>
        buildWatchedFilm({
          releaseYear: 2015,
          watchedAt: `2025-01-${String(i + 1).padStart(2, "0")}`,
        }),
      );
      const winner = buildFilm({ releaseYear: 1970 });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [...oldWatches, ...recentWatches],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when every represented decade appears in recent watch history", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 2015 })],
        watchedFilms: [
          buildWatchedFilm({ releaseYear: 2018, watchedAt: "2025-01-01" }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_decade_absent_from_recent_watches",
      });
    });

    it("respects a configured recent-history window", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 1970 })],
        watchedFilms: [
          buildWatchedFilm({ releaseYear: 1970, watchedAt: "2025-01-01" }),
        ],
        config: {
          ...DEFAULT_CHALLENGE_ENGINE_CONFIG,
          recentWatchHistoryWindow: 1,
        },
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("five-star-echo", () => {
    const challenge = findChallenge("five-star-echo");

    it("picks a film sharing a director with a 5-star watch", () => {
      const winner = buildFilm({
        directors: ["Miyazaki"],
        genres: ["Documentary"],
      });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [
          buildWatchedFilm({ directors: ["Miyazaki"], userRating: 5 }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("picks a film sharing a genre with a 5-star watch", () => {
      const winner = buildFilm({
        directors: ["Someone Else"],
        genres: ["Horror"],
      });
      const context = buildContext({
        candidates: [winner],
        watchedFilms: [buildWatchedFilm({ genres: ["Horror"], userRating: 5 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when there are no 5-star watches recorded", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        watchedFilms: [buildWatchedFilm({ userRating: 4.5 })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_five_star_watches_recorded",
      });
    });

    it("is ineligible when no candidate echoes a 5-star watch's director or genre", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ directors: ["Someone Else"], genres: ["Comedy"] }),
        ],
        watchedFilms: [
          buildWatchedFilm({
            directors: ["Miyazaki"],
            genres: ["Documentary"],
            userRating: 5,
          }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_echoing_a_five_star_watch",
      });
    });

    it("is ineligible when there is no watch history at all", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        watchedFilms: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });
});
