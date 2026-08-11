import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { popularityChallenges } from "./popularity";
import { buildContext, buildFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = popularityChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("popularityChallenges", () => {
  it("registers exactly the 8 popularity challenges with unique ids", () => {
    const ids = popularityChallenges.map((c) => c.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(popularityChallenges.every((c) => c.category === "popularity")).toBe(
      true,
    );
    expect(popularityChallenges.every((c) => c.interactive === false)).toBe(
      true,
    );
  });

  describe("main-character", () => {
    const challenge = findChallenge("main-character");

    it("picks the most popular film", () => {
      const winner = buildFilm({ popularity: 99 });
      const context = buildContext({
        candidates: [buildFilm({ popularity: 10 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film has a known popularity score", () => {
      const context = buildContext({
        candidates: [buildFilm({ popularity: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_popularity",
      });
    });

    it("does not substitute another metric when popularity is missing", () => {
      // watchCount is high but popularity is null — must not be treated as "popular".
      const context = buildContext({
        candidates: [buildFilm({ popularity: null, watchCount: 999999 })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("breaks a tie between films sharing the highest popularity", () => {
      const tiedA = buildFilm({ popularity: 50 });
      const tiedB = buildFilm({ popularity: 50 });
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [tiedA, tiedB],
            rng: createSeededRng(seed),
          }),
        );
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.size).toBeGreaterThan(0);
    });
  });

  describe("hipster-pick", () => {
    const challenge = findChallenge("hipster-pick");

    it("picks the lowest watch count within a sample of 20", () => {
      const films = Array.from({ length: 20 }, (_, i) =>
        buildFilm({ watchCount: i + 1 }),
      );
      for (let seed = 0; seed < 10; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
        if (result.status === "success") {
          expect(result.film.watchCount).toBe(1);
        }
      }
    });

    it("samples all available films when fewer than 20 exist", () => {
      const lowest = buildFilm({ watchCount: 1 });
      const context = buildContext({
        candidates: [buildFilm({ watchCount: 50 }), lowest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: lowest,
      });
    });

    it("is ineligible when no film has a known watch count", () => {
      const context = buildContext({
        candidates: [buildFilm({ watchCount: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_watch_count",
      });
    });

    it("ignores films with unknown watch count entirely", () => {
      const lowest = buildFilm({ watchCount: 10 });
      const context = buildContext({
        candidates: [buildFilm({ watchCount: null }), lowest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: lowest,
      });
    });
  });

  describe("nobody-knows-this", () => {
    const challenge = findChallenge("nobody-knows-this");

    it("picks the smallest watch count", () => {
      const winner = buildFilm({ watchCount: 3 });
      const context = buildContext({
        candidates: [buildFilm({ watchCount: 500 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when watch count metadata is entirely missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ watchCount: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_watch_count",
      });
    });
  });

  describe("list-goblin", () => {
    const challenge = findChallenge("list-goblin");

    it("picks the film on the most lists", () => {
      const winner = buildFilm({ listAppearances: 1000 });
      const context = buildContext({
        candidates: [buildFilm({ listAppearances: 5 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when list-appearance metadata is unavailable", () => {
      const context = buildContext({
        candidates: [buildFilm({ listAppearances: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_list_appearances",
      });
    });
  });

  describe("cult-classic", () => {
    const challenge = findChallenge("cult-classic");

    it("picks a highly-rated film from the bottom quartile by watch count", () => {
      const winner = buildFilm({ averageRating: 4.5, watchCount: 1 });
      const context = buildContext({
        candidates: [
          winner,
          buildFilm({ averageRating: 4.8, watchCount: 100 }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no bottom-quartile film is rated 4.0+", () => {
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 3.0, watchCount: 1 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_bottom_quartile_watch_count_films_rated_4_plus",
      });
    });

    it("is ineligible when rating or watch count metadata is missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ averageRating: null, watchCount: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("boundary: exactly 4.0 qualifies", () => {
      const film = buildFilm({ averageRating: 4.0, watchCount: 1 });
      expect(
        challenge.attempt(buildContext({ candidates: [film] })),
      ).toMatchObject({
        status: "success",
        film,
      });
    });

    it("declares both average_rating and watch_count as required capabilities", () => {
      expect(challenge.requiredCapabilities).toEqual(
        expect.arrayContaining(["average_rating", "watch_count"]),
      );
    });
  });

  describe("everyone-saw-it-except-me", () => {
    const challenge = findChallenge("everyone-saw-it-except-me");

    it("picks the highest watch count", () => {
      const winner = buildFilm({ watchCount: 100000 });
      const context = buildContext({
        candidates: [buildFilm({ watchCount: 5 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film has a known watch count", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ watchCount: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_watch_count",
      });
    });
  });

  describe("nobodys-favourite", () => {
    const challenge = findChallenge("nobodys-favourite");

    it("picks the lowest fans count", () => {
      const winner = buildFilm({ fansCount: 0 });
      const context = buildContext({
        candidates: [buildFilm({ fansCount: 500 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when fans-count metadata is unavailable", () => {
      const context = buildContext({
        candidates: [buildFilm({ fansCount: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_fans_count",
      });
    });
  });

  describe("hidden-gem-algorithm", () => {
    const challenge = findChallenge("hidden-gem-algorithm");

    it("picks the fewest-watched film among those rated 4.0+", () => {
      const winner = buildFilm({ averageRating: 4.2, watchCount: 2 });
      const context = buildContext({
        candidates: [
          buildFilm({ averageRating: 4.9, watchCount: 500 }),
          winner,
          buildFilm({ averageRating: 3.0, watchCount: 1 }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film rated 4.0+ has a known watch count", () => {
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 4.5, watchCount: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_rated_4_plus_with_known_watch_count",
      });
    });

    it("boundary: a rating of exactly 4.0 qualifies", () => {
      const film = buildFilm({ averageRating: 4.0, watchCount: 5 });
      expect(
        challenge.attempt(buildContext({ candidates: [film] })),
      ).toMatchObject({
        status: "success",
        film,
      });
    });
  });
});
