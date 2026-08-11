import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { collectionChallenges } from "./collections";
import { buildContext, buildFilm, buildWatchedFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = collectionChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("collectionChallenges", () => {
  it("registers exactly the 4 collection challenges with unique ids", () => {
    const ids = collectionChallenges.map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(
      collectionChallenges.every((c) => c.category === "collections"),
    ).toBe(true);
    expect(collectionChallenges.every((c) => c.interactive === false)).toBe(
      true,
    );
  });

  describe("finish-what-you-started", () => {
    const challenge = findChallenge("finish-what-you-started");

    it("picks a collection film whose earlier entry you've already watched", () => {
      const winner = buildFilm({ collectionId: "bourne" });
      const context = buildContext({
        candidates: [winner, buildFilm({ collectionId: "matrix" })],
        watchedFilms: [buildWatchedFilm({ collectionId: "bourne" })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no watched collection matches a remaining film", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: "matrix" })],
        watchedFilms: [buildWatchedFilm({ collectionId: "bourne" })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_collection_film_with_earlier_entry_watched",
      });
    });

    it("is ineligible when there is no watch history at all", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: "bourne" })],
        watchedFilms: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is ineligible when collection metadata is missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: null })],
        watchedFilms: [buildWatchedFilm({ collectionId: "bourne" })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("franchise-debt", () => {
    const challenge = findChallenge("franchise-debt");

    it("picks the oldest addition belonging to a collection", () => {
      const winner = buildFilm({
        collectionId: "bourne",
        dateAdded: "2020-01-01",
      });
      const context = buildContext({
        candidates: [
          winner,
          buildFilm({ collectionId: "matrix", dateAdded: "2023-01-01" }),
          buildFilm({ collectionId: null, dateAdded: "2010-01-01" }),
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film has a known collection", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_collection",
      });
    });

    it("breaks a tie between collection films added on the same date", () => {
      const tiedA = buildFilm({ collectionId: "a", dateAdded: "2020-01-01" });
      const tiedB = buildFilm({ collectionId: "b", dateAdded: "2020-01-01" });
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

  describe("gateway-drug", () => {
    const challenge = findChallenge("gateway-drug");

    it("picks the first film (by collection order) of a never-started collection", () => {
      const first = buildFilm({ collectionId: "bourne", collectionOrder: 1 });
      const second = buildFilm({ collectionId: "bourne", collectionOrder: 2 });
      const context = buildContext({ candidates: [second, first] });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: first,
      });
    });

    it("falls back to release year ordering when collection order is unavailable", () => {
      const first = buildFilm({
        collectionId: "bourne",
        collectionOrder: null,
        releaseYear: 2002,
      });
      const second = buildFilm({
        collectionId: "bourne",
        collectionOrder: null,
        releaseYear: 2004,
      });
      const context = buildContext({ candidates: [second, first] });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: first,
      });
    });

    it("excludes a collection you've already started", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: "bourne", collectionOrder: 1 })],
        watchedFilms: [buildWatchedFilm({ collectionId: "bourne" })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("treats every collection as never-started when there is no watch history", () => {
      const first = buildFilm({ collectionId: "bourne", collectionOrder: 1 });
      const result = challenge.attempt(
        buildContext({ candidates: [first], watchedFilms: [] }),
      );
      expect(result).toMatchObject({ status: "success", film: first });
    });

    it("skips a collection whose ordering cannot be reliably determined", () => {
      // Mixed: one film has an order, the other doesn't, and release years are also mixed/missing.
      const context = buildContext({
        candidates: [
          buildFilm({
            collectionId: "bourne",
            collectionOrder: 1,
            releaseYear: null,
          }),
          buildFilm({
            collectionId: "bourne",
            collectionOrder: null,
            releaseYear: null,
          }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_never_started_collection_with_reliable_first_film",
      });
    });

    it("is ineligible when no film has known collection metadata", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("no-homework", () => {
    const challenge = findChallenge("no-homework");

    it("picks a standalone film with no collection", () => {
      const winner = buildFilm({ collectionId: null });
      const context = buildContext({
        candidates: [buildFilm({ collectionId: "bourne" }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when every film belongs to a collection", () => {
      const context = buildContext({
        candidates: [buildFilm({ collectionId: "bourne" })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_standalone_films",
      });
    });
  });
});
