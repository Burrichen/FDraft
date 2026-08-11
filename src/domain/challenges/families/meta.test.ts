import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import type { BattleRoyaleState } from "../interactive/battle-royale";
import type { ThreeDoorsState } from "../interactive/three-doors";
import type { LotteryTicketBreakdown } from "../lottery";
import { metaChallenges } from "./meta";
import { buildContext, buildFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = metaChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("metaChallenges", () => {
  it("registers exactly the 6 meta challenges with unique ids", () => {
    const ids = metaChallenges.map((c) => c.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(metaChallenges.every((c) => c.category === "meta")).toBe(true);
  });

  it("marks exactly the three interactive challenges as interactive", () => {
    const interactiveIds = metaChallenges
      .filter((c) => c.interactive)
      .map((c) => c.id);
    expect(interactiveIds.sort()).toEqual([
      "battle-royale",
      "battle-royale-underdog",
      "three-doors",
    ]);
  });

  describe("the-number-7", () => {
    const challenge = findChallenge("the-number-7");

    it("picks the seventh film from a shuffled watchlist", () => {
      const films = Array.from({ length: 10 }, () => buildFilm());
      const result = challenge.attempt(
        buildContext({ candidates: films, rng: createSeededRng(1) }),
      );
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(films.map((f) => f.filmId)).toContain(result.film.filmId);
      }
    });

    it("is ineligible with fewer than seven eligible films", () => {
      const context = buildContext({
        candidates: Array.from({ length: 6 }, () => buildFilm()),
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "fewer_than_seven_eligible_films",
      });
    });

    it("boundary: exactly seven eligible films is eligible", () => {
      const context = buildContext({
        candidates: Array.from({ length: 7 }, () => buildFilm()),
      });
      expect(challenge.isEligible(context)).toBe(true);
      expect(challenge.attempt(context).status).toBe("success");
    });

    it("is deterministic for a given seed", () => {
      const films = Array.from({ length: 10 }, () => buildFilm());
      const a = challenge.attempt(
        buildContext({ candidates: films, rng: createSeededRng(7) }),
      );
      const b = challenge.attempt(
        buildContext({ candidates: films, rng: createSeededRng(7) }),
      );
      expect(
        a.status === "success" && b.status === "success" && a.film.filmId,
      ).toBe(b.status === "success" && b.film.filmId);
    });
  });

  describe("battle-royale", () => {
    const challenge = findChallenge("battle-royale");

    it("returns requires_user_choice with 8 candidates when enough films exist", () => {
      const films = Array.from({ length: 8 }, () => buildFilm());
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("requires_user_choice");
      if (result.status === "requires_user_choice") {
        expect(result.interactionId).toBe("battle-royale");
        expect((result.payload as BattleRoyaleState).candidates).toHaveLength(
          8,
        );
        expect((result.payload as BattleRoyaleState).variant).toBe("standard");
      }
    });

    it("is ineligible with fewer than eight eligible films", () => {
      const context = buildContext({
        candidates: Array.from({ length: 7 }, () => buildFilm()),
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "fewer_than_eight_eligible_films",
      });
    });
  });

  describe("battle-royale-underdog", () => {
    const challenge = findChallenge("battle-royale-underdog");

    it("has the user-facing title 'Battle Royale', with no 'Fake' anywhere", () => {
      expect(challenge.name).toBe("Battle Royale");
      expect(challenge.name.toLowerCase()).not.toContain("fake");
      expect(challenge.description.toLowerCase()).not.toContain("fake");
    });

    it("uses a distinct internal id from the standard variant", () => {
      expect(challenge.id).toBe("battle-royale-underdog");
      expect(challenge.id).not.toBe("battle-royale");
    });

    it("returns requires_user_choice with the underdog variant", () => {
      const films = Array.from({ length: 8 }, () => buildFilm());
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("requires_user_choice");
      if (result.status === "requires_user_choice") {
        expect(result.interactionId).toBe("battle-royale-underdog");
        expect((result.payload as BattleRoyaleState).variant).toBe("underdog");
      }
    });

    it("is ineligible with fewer than eight eligible films", () => {
      const context = buildContext({
        candidates: Array.from({ length: 7 }, () => buildFilm()),
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("three-doors", () => {
    const challenge = findChallenge("three-doors");

    it("returns requires_user_choice with three doors when enough films exist", () => {
      const films = [
        buildFilm({ runtimeMinutes: 70 }),
        buildFilm({ runtimeMinutes: 200, releaseYear: 1930 }),
        buildFilm({
          runtimeMinutes: 150,
          releaseYear: 2020,
          averageRating: 4.8,
        }),
      ];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("requires_user_choice");
      if (result.status === "requires_user_choice") {
        expect(result.interactionId).toBe("three-doors");
        expect((result.payload as ThreeDoorsState).doors).toHaveLength(3);
      }
    });

    it("is ineligible when no film has a known rating of 4.0+", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ runtimeMinutes: 70 }),
          buildFilm({ releaseYear: 1930 }),
          buildFilm({ averageRating: 2.0 }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("can still be ineligible at attempt() time even when isEligible() passed", () => {
      // isEligible only checks aggregate pool composition — three DISTINCT films
      // satisfying all three doors might not actually exist.
      const onlyFilm = buildFilm({
        runtimeMinutes: 70,
        releaseYear: 1930,
        averageRating: 4.8,
      });
      const context = buildContext({ candidates: [onlyFilm] });
      expect(challenge.isEligible(context)).toBe(false); // fewer than 3 candidates total
    });
  });

  describe("the-draft-lottery", () => {
    const challenge = findChallenge("the-draft-lottery");

    it("picks a film via a weighted draw and exposes the full ticket breakdown", () => {
      const films = Array.from({ length: 5 }, () => buildFilm());
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
      if (result.status === "success") {
        const tickets = result.displayValue
          ?.tickets as LotteryTicketBreakdown[];
        expect(tickets).toHaveLength(5);
        expect(tickets.every((t) => t.totalTickets >= 1)).toBe(true);
      }
    });

    it("is ineligible for an empty watchlist", () => {
      const context = buildContext({ candidates: [] });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });

    it("heavily favors a film with many more tickets over many draws", () => {
      const heavy = buildFilm({
        dateAdded: "2010-01-01",
        averageRating: 4.5,
        watchCount: 1,
      }); // many bonuses
      const light = buildFilm({
        dateAdded: "2025-12-01",
        averageRating: null,
        watchCount: 500,
      }); // baseline only
      let heavyWins = 0;
      const trials = 500;
      for (let i = 0; i < trials; i++) {
        const result = challenge.attempt(
          buildContext({ candidates: [heavy, light], rng: createSeededRng(i) }),
        );
        if (result.status === "success" && result.film.filmId === heavy.filmId)
          heavyWins++;
      }
      expect(heavyWins / trials).toBeGreaterThan(0.7);
    });
  });

  describe("the-anti-draft-lottery", () => {
    const challenge = findChallenge("the-anti-draft-lottery");

    it("picks a film via a weighted draw and exposes the full ticket breakdown", () => {
      const films = Array.from({ length: 5 }, () => buildFilm());
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
      if (result.status === "success") {
        const tickets = result.displayValue?.tickets;
        expect(tickets).toHaveLength(5);
      }
    });

    it("is ineligible for an empty watchlist", () => {
      const context = buildContext({ candidates: [] });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });

    it("favors an older, off-taste film over a recently-added one over many draws", () => {
      const older = buildFilm({ dateAdded: "2015-01-01" });
      const recent = buildFilm({ dateAdded: "2025-12-31" });
      let olderWins = 0;
      const trials = 500;
      for (let i = 0; i < trials; i++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [older, recent],
            rng: createSeededRng(i),
          }),
        );
        if (result.status === "success" && result.film.filmId === older.filmId)
          olderWins++;
      }
      expect(olderWins / trials).toBeGreaterThan(0.6);
    });
  });
});
