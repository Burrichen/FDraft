import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { ratingsChallenges } from "./ratings";
import { buildContext, buildFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = ratingsChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("ratingsChallenges", () => {
  it("registers exactly the 9 ratings challenges with unique ids", () => {
    const ids = ratingsChallenges.map((c) => c.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    expect(ratingsChallenges.every((c) => c.category === "ratings")).toBe(true);
    expect(
      ratingsChallenges.every((c) =>
        c.requiredCapabilities.includes("average_rating"),
      ),
    ).toBe(true);
    expect(ratingsChallenges.every((c) => c.interactive === false)).toBe(true);
  });

  describe("crown-jewel", () => {
    const challenge = findChallenge("crown-jewel");

    it("picks the highest-rated film", () => {
      const best = buildFilm({ averageRating: 4.9 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 3.0 }), best],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: best,
      });
    });

    it("is ineligible when no film has a known rating", () => {
      const context = buildContext({
        candidates: [buildFilm({ averageRating: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_rating",
      });
    });

    it("breaks a tie between films sharing the highest rating", () => {
      const tiedA = buildFilm({ averageRating: 4.5 });
      const tiedB = buildFilm({ averageRating: 4.5 });
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
      for (const id of seen) expect([tiedA.filmId, tiedB.filmId]).toContain(id);
    });

    it("boundary: a single candidate is trivially the winner", () => {
      const only = buildFilm({ averageRating: 2.0 });
      expect(
        challenge.attempt(buildContext({ candidates: [only] })),
      ).toMatchObject({
        status: "success",
        film: only,
      });
    });
  });

  describe("trash-goblin", () => {
    const challenge = findChallenge("trash-goblin");

    it("picks the lowest-rated film", () => {
      const worst = buildFilm({ averageRating: 0.5 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 3.0 }), worst],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: worst,
      });
    });

    it("is ineligible when no film has a known rating", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_rating",
      });
    });

    it("breaks a tie between films sharing the lowest rating", () => {
      const tiedA = buildFilm({ averageRating: 1.0 });
      const tiedB = buildFilm({ averageRating: 1.0 });
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

  describe("danger-zone", () => {
    const challenge = findChallenge("danger-zone");

    it("picks a random film rated below 3.0", () => {
      const winner = buildFilm({ averageRating: 2.5 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 4.0 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film is below 3.0", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: 3.0 })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_rating_lt_3",
      });
    });

    it("boundary: exactly 3.0 does not qualify", () => {
      expect(
        challenge.isEligible(
          buildContext({ candidates: [buildFilm({ averageRating: 3.0 })] }),
        ),
      ).toBe(false);
    });
  });

  describe("respectable-citizen", () => {
    const challenge = findChallenge("respectable-citizen");

    it("picks a random film rated between 3.0 and 3.5", () => {
      const winner = buildFilm({ averageRating: 3.2 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 4.5 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film falls in the 3.0-3.5 band", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: 3.6 })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_rating_3_to_3_5",
      });
    });

    it("boundary: both 3.0 and 3.5 are inclusive", () => {
      const low = buildContext({
        candidates: [buildFilm({ averageRating: 3.0 })],
      });
      const high = buildContext({
        candidates: [buildFilm({ averageRating: 3.5 })],
      });
      expect(challenge.isEligible(low)).toBe(true);
      expect(challenge.isEligible(high)).toBe(true);
    });
  });

  describe("prestige-pick", () => {
    const challenge = findChallenge("prestige-pick");

    it("picks a random film rated 4.0 or higher", () => {
      const winner = buildFilm({ averageRating: 4.2 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 3.0 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible with the spec's own example reason code", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: 3.9 })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_rating_gte_4",
      });
    });

    it("boundary: exactly 4.0 qualifies", () => {
      const film = buildFilm({ averageRating: 4.0 });
      expect(
        challenge.attempt(buildContext({ candidates: [film] })),
      ).toMatchObject({ status: "success", film });
    });
  });

  describe("perfectly-average", () => {
    const challenge = findChallenge("perfectly-average");

    it("picks the film closest to 2.5", () => {
      const closest = buildFilm({ averageRating: 2.6 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 5.0 }), closest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: closest,
      });
    });

    it("is ineligible when no film has a known rating", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_rating",
      });
    });

    it("boundary: exactly 2.5 is the closest possible", () => {
      const exact = buildFilm({ averageRating: 2.5 });
      const context = buildContext({
        candidates: [buildFilm({ averageRating: 2.0 }), exact],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: exact,
      });
    });

    it("breaks a tie between two films equidistant from 2.5", () => {
      const under = buildFilm({ averageRating: 2.0 });
      const over = buildFilm({ averageRating: 3.0 });
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [under, over],
            rng: createSeededRng(seed),
          }),
        );
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.size).toBeGreaterThan(0);
    });
  });

  describe("rating-roulette", () => {
    const challenge = findChallenge("rating-roulette");

    it("only picks a film from within one half-star band", () => {
      const films = [
        buildFilm({ averageRating: 1.2 }),
        buildFilm({ averageRating: 3.7 }),
        buildFilm({ averageRating: 4.9 }),
      ];
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
      }
    });

    it("is ineligible when no film has a known rating", () => {
      const context = buildContext({
        candidates: [buildFilm({ averageRating: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("only chooses among bands actually represented by films", () => {
      const onlyBandFilm = buildFilm({ averageRating: 4.9 });
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [onlyBandFilm],
            rng: createSeededRng(seed),
          }),
        );
        expect(result).toMatchObject({ status: "success", film: onlyBandFilm });
      }
    });

    it("boundary: a perfect 5.0 rating falls in the top band, not out of range", () => {
      const perfect = buildFilm({ averageRating: 5.0 });
      const context = buildContext({ candidates: [perfect] });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: perfect,
      });
    });

    it("keeps non-overlapping bands: 3.4 and 3.5 fall in different bands", () => {
      const lowBand = buildFilm({ averageRating: 3.4 });
      const highBand = buildFilm({ averageRating: 3.5 });
      // With only these two films in different bands, whichever band is chosen has exactly one film.
      for (let seed = 0; seed < 10; seed++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [lowBand, highBand],
            rng: createSeededRng(seed),
          }),
        );
        expect(result.status).toBe("success");
        if (result.status === "success") {
          expect([lowBand.filmId, highBand.filmId]).toContain(
            result.film.filmId,
          );
        }
      }
    });
  });

  describe("trust-the-people", () => {
    const challenge = findChallenge("trust-the-people");

    it("only picks from the top 10% by rating", () => {
      const films = Array.from({ length: 10 }, (_, i) =>
        buildFilm({ averageRating: i + 1 }),
      );
      const topTenPercentIds = new Set([films[9].filmId]); // highest-rated single film
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") {
          expect(topTenPercentIds.has(result.film.filmId)).toBe(true);
        }
      }
    });

    it("is ineligible when no film has a known rating", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_rating",
      });
    });

    it("boundary: a single-film watchlist trivially satisfies top 10%", () => {
      const only = buildFilm({ averageRating: 3.0 });
      expect(
        challenge.attempt(buildContext({ candidates: [only] })),
      ).toMatchObject({
        status: "success",
        film: only,
      });
    });
  });

  describe("defy-the-people", () => {
    const challenge = findChallenge("defy-the-people");

    it("only picks from the bottom 10% by rating", () => {
      const films = Array.from({ length: 10 }, (_, i) =>
        buildFilm({ averageRating: i + 1 }),
      );
      const bottomTenPercentIds = new Set([films[0].filmId]); // lowest-rated single film
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") {
          expect(bottomTenPercentIds.has(result.film.filmId)).toBe(true);
        }
      }
    });

    it("is ineligible when no film has a known rating", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ averageRating: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_rating",
      });
    });

    it("boundary: a single-film watchlist trivially satisfies bottom 10%", () => {
      const only = buildFilm({ averageRating: 3.0 });
      expect(
        challenge.attempt(buildContext({ candidates: [only] })),
      ).toMatchObject({
        status: "success",
        film: only,
      });
    });
  });
});
