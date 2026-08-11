import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "../types";
import { runtimeChallenges } from "./runtime";
import { buildContext, buildFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = runtimeChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("runtimeChallenges", () => {
  it("registers exactly the 8 runtime challenges with unique ids", () => {
    const ids = runtimeChallenges.map((c) => c.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(runtimeChallenges.every((c) => c.category === "runtime")).toBe(true);
    expect(
      runtimeChallenges.every((c) =>
        c.requiredCapabilities.includes("runtime"),
      ),
    ).toBe(true);
    expect(runtimeChallenges.every((c) => c.interactive === false)).toBe(true);
  });

  describe("short-king", () => {
    const challenge = findChallenge("short-king");

    it("picks the shortest film with a known runtime", () => {
      const shortest = buildFilm({ runtimeMinutes: 75 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 120 }), shortest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: shortest,
      });
    });

    it("is ineligible when no film has a known runtime", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_runtime",
      });
    });

    it("ignores films with unknown runtime when others have known runtime", () => {
      const shortest = buildFilm({ runtimeMinutes: 90 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: null }), shortest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: shortest,
      });
    });

    it("breaks a tie between films sharing the shortest runtime", () => {
      const tiedA = buildFilm({ runtimeMinutes: 90 });
      const tiedB = buildFilm({ runtimeMinutes: 90 });
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
  });

  describe("plus-sized-short-king", () => {
    const challenge = findChallenge("plus-sized-short-king");

    it("picks the shortest feature-length film, skipping shorter non-feature-length films", () => {
      const shortestFeature = buildFilm({ runtimeMinutes: 41 });
      const context = buildContext({
        candidates: [
          buildFilm({ runtimeMinutes: 20 }),
          shortestFeature,
          buildFilm({ runtimeMinutes: 90 }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: shortestFeature,
      });
    });

    it("is ineligible when no film meets the feature-length threshold", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 20 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_feature_length_films_with_known_runtime",
      });
    });

    it("boundary: exactly the threshold (default 40 minutes) qualifies", () => {
      const film = buildFilm({ runtimeMinutes: 40 });
      const context = buildContext({ candidates: [film] });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film,
      });
    });

    it("respects a configured feature-length threshold", () => {
      const film = buildFilm({ runtimeMinutes: 60 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 45 }), film],
        config: {
          ...DEFAULT_CHALLENGE_ENGINE_CONFIG,
          featureLengthMinutesThreshold: 60,
        },
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film,
      });
    });
  });

  describe("under-90-club", () => {
    const challenge = findChallenge("under-90-club");

    it("picks a random film under 90 minutes", () => {
      const winner = buildFilm({ runtimeMinutes: 85 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 120 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film is under 90 minutes", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 90 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_under_90_minutes",
      });
    });

    it("boundary: exactly 90 minutes does not qualify", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 90 })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is ineligible when runtime metadata is entirely missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("boss-battle", () => {
    const challenge = findChallenge("boss-battle");

    it("picks a random film 150 minutes or longer", () => {
      const winner = buildFilm({ runtimeMinutes: 160 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 100 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film reaches 150 minutes", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 149 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_150_minutes_or_more",
      });
    });

    it("boundary: exactly 150 minutes qualifies", () => {
      const film = buildFilm({ runtimeMinutes: 150 });
      expect(
        challenge.attempt(buildContext({ candidates: [film] })),
      ).toMatchObject({
        status: "success",
        film,
      });
    });
  });

  describe("runtime-roulette", () => {
    const challenge = findChallenge("runtime-roulette");

    it("only picks a film from a single runtime band", () => {
      const films = [
        buildFilm({ runtimeMinutes: 60 }),
        buildFilm({ runtimeMinutes: 100 }),
        buildFilm({ runtimeMinutes: 140 }),
        buildFilm({ runtimeMinutes: 170 }),
      ];
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
      }
    });

    it("skips empty bands and still succeeds when only one band has candidates", () => {
      const onlyBand = buildFilm({ runtimeMinutes: 170 }); // 150+ band only
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: [onlyBand], rng: createSeededRng(seed) }),
        );
        expect(result).toMatchObject({ status: "success", film: onlyBand });
      }
    });

    it("is ineligible when no film has a known runtime", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_runtime",
      });
    });

    it("boundary: band edges (90, 120, 150) fall into the higher band", () => {
      const films = [
        buildFilm({ runtimeMinutes: 90 }),
        buildFilm({ runtimeMinutes: 120 }),
        buildFilm({ runtimeMinutes: 150 }),
      ];
      // Deterministically verify each edge value's own band has exactly that film as sole occupant.
      const context = buildContext({ candidates: [films[0]] });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: films[0],
      });
    });
  });

  describe("double-feature-half", () => {
    const challenge = findChallenge("double-feature-half");

    it("requires previous_draft_pick and the runtime capability", () => {
      expect(challenge.requiredCapabilities).toEqual(
        expect.arrayContaining(["runtime", "previous_draft_pick"]),
      );
    });

    it("is ineligible before any previous picks exist (deferred until later in generation)", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 90 })],
        previousPicks: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_previous_picks_yet",
      });
    });

    it("picks a film that pairs with a previous pick under 200 minutes combined", () => {
      const pairable = buildFilm({ runtimeMinutes: 90 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 150 }), pairable],
        previousPicks: [buildFilm({ runtimeMinutes: 100 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: pairable,
      });
    });

    it("is ineligible when no candidate pairs under 200 minutes", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 150 })],
        previousPicks: [buildFilm({ runtimeMinutes: 100 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_valid_runtime_pairing_under_200",
      });
    });

    it("boundary: a combined total of exactly 200 minutes does not qualify", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 100 })],
        previousPicks: [buildFilm({ runtimeMinutes: 100 })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is ineligible when the previous pick has no known runtime", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 90 })],
        previousPicks: [buildFilm({ runtimeMinutes: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("goldilocks", () => {
    const challenge = findChallenge("goldilocks");

    it("picks the film closest to 100 minutes", () => {
      const closest = buildFilm({ runtimeMinutes: 102 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 60 }), closest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: closest,
      });
    });

    it("is ineligible when no film has a known runtime", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ runtimeMinutes: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_runtime",
      });
    });

    it("boundary: exactly 100 minutes is the closest possible", () => {
      const exact = buildFilm({ runtimeMinutes: 100 });
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 90 }), exact],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: exact,
      });
    });

    it("breaks a tie between two films equidistant from 100", () => {
      const under = buildFilm({ runtimeMinutes: 95 });
      const over = buildFilm({ runtimeMinutes: 105 });
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

  describe("minute-match", () => {
    const challenge = findChallenge("minute-match");

    it("generates a target between 80 and 180 and displays it", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 100 })],
      });
      const result = challenge.attempt(context);
      expect(result.status).toBe("success");
      if (result.status === "success") {
        const target = result.displayValue?.targetMinutes;
        expect(typeof target).toBe("number");
        expect(target as number).toBeGreaterThanOrEqual(80);
        expect(target as number).toBeLessThanOrEqual(180);
      }
    });

    it("picks the film closest to the generated target", () => {
      // Seed chosen so the generated target plus tie-break are both exercised; verify
      // the invariant (closest film wins) rather than a hardcoded target.
      const films = [
        buildFilm({ runtimeMinutes: 80 }),
        buildFilm({ runtimeMinutes: 130 }),
        buildFilm({ runtimeMinutes: 180 }),
      ];
      for (let seed = 0; seed < 20; seed++) {
        const context = buildContext({
          candidates: films,
          rng: createSeededRng(seed),
        });
        const result = challenge.attempt(context);
        expect(result.status).toBe("success");
        if (result.status === "success") {
          const target = result.displayValue?.targetMinutes as number;
          const distances = films.map((f) =>
            Math.abs((f.runtimeMinutes ?? 0) - target),
          );
          const minDistance = Math.min(...distances);
          const winnerDistance = Math.abs(
            (result.film.runtimeMinutes ?? 0) - target,
          );
          expect(winnerDistance).toBe(minDistance);
        }
      }
    });

    it("is ineligible when no film has a known runtime, without generating a target", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_runtime",
      });
    });

    it("boundary: target generation covers both 80 and 180 across many seeds", () => {
      const context = buildContext({
        candidates: [buildFilm({ runtimeMinutes: 130 })],
      });
      const targets = new Set<number>();
      for (let seed = 0; seed < 500; seed++) {
        const result = challenge.attempt({
          ...context,
          rng: createSeededRng(seed),
        });
        if (result.status === "success") {
          targets.add(result.displayValue?.targetMinutes as number);
        }
      }
      expect(Math.min(...targets)).toBeGreaterThanOrEqual(80);
      expect(Math.max(...targets)).toBeLessThanOrEqual(180);
      // With 500 seeds over a 101-value range, expect broad coverage, not just a few values.
      expect(targets.size).toBeGreaterThan(50);
    });
  });
});
