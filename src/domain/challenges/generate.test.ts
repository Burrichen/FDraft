import { describe, expect, it, vi } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { generateChallengeFilms } from "./generate";
import { createChallengeRegistry } from "./registry";
import type {
  ChallengeCandidateFilm,
  ChallengeContext,
  ChallengeDefinition,
  ChallengeResult,
} from "./types";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "./types";

function buildFilm(
  overrides: Partial<ChallengeCandidateFilm> = {},
): ChallengeCandidateFilm {
  return {
    watchlistEntryId: "entry-1",
    filmId: "film-1",
    title: "Test Film",
    releaseYear: 2000,
    dateAdded: "2024-01-01",
    position: 0,
    selectionWeight: 1,
    runtimeMinutes: 100,
    genres: null,
    directors: null,
    countries: null,
    languages: null,
    primaryLanguage: null,
    collectionId: null,
    collectionOrder: null,
    averageRating: null,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    ...overrides,
  };
}

function buildContext(
  overrides: Partial<ChallengeContext> = {},
): Omit<ChallengeContext, "previousPicks"> {
  return {
    rng: createSeededRng(1),
    now: new Date("2026-01-01T00:00:00.000Z"),
    candidates: [],
    watchedFilms: [],
    config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
    ...overrides,
  };
}

/** A challenge that always succeeds by picking the first candidate, uniquely identified for assertions. */
function alwaysSucceeds(id: string): ChallengeDefinition {
  return {
    id,
    name: id,
    description: id,
    category: "meta",
    requiredCapabilities: [],
    interactive: false,
    isEligible: (ctx) => ctx.candidates.length > 0,
    attempt: (ctx): ChallengeResult => {
      if (ctx.candidates.length === 0) {
        return { status: "ineligible", reason: "no_candidates" };
      }
      return { status: "success", film: ctx.candidates[0] };
    },
  };
}

/** A challenge that always fails/ineligible — used to test rerolling and bounded attempts. */
function alwaysFails(id: string, reason = "always_fails"): ChallengeDefinition {
  return {
    id,
    name: id,
    description: id,
    category: "meta",
    requiredCapabilities: [],
    interactive: false,
    isEligible: () => true,
    attempt: (): ChallengeResult => ({ status: "ineligible", reason }),
  };
}

describe("generateChallengeFilms", () => {
  it("fills every slot when a succeeding challenge is available", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("succeed"));
    const films = [
      buildFilm({ watchlistEntryId: "e1", filmId: "f1" }),
      buildFilm({ watchlistEntryId: "e2", filmId: "f2" }),
    ];

    const result = generateChallengeFilms({
      registry,
      slotCount: 2,
      context: buildContext({ candidates: films }),
    });

    expect(result.slots).toHaveLength(2);
    expect(result.unfulfilledSlotCount).toBe(0);
  });

  it("never produces duplicate draft films across slots", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("succeed"));
    const films = [
      buildFilm({ watchlistEntryId: "e1", filmId: "f1" }),
      buildFilm({ watchlistEntryId: "e2", filmId: "f2" }),
    ];

    const result = generateChallengeFilms({
      registry,
      slotCount: 5, // more slots than films
      context: buildContext({ candidates: films }),
    });

    const filmIds = result.slots.map((s) => s.film.filmId);
    expect(new Set(filmIds).size).toBe(filmIds.length);
    // Ran out of candidates after 2 successes; the remaining 3 slots are unfulfilled, not duplicated.
    expect(result.slots).toHaveLength(2);
    expect(result.unfulfilledSlotCount).toBe(3);
  });

  it("rerolls to a different challenge when the first one fails", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysFails("fails-a"));
    registry.register(alwaysSucceeds("succeeds"));
    const films = [buildFilm()];

    const result = generateChallengeFilms({
      registry,
      slotCount: 1,
      context: buildContext({ candidates: films }),
    });

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].challengeId).toBe("succeeds");
    // Both challenges were attempted for this slot: the failing one, then the successful reroll.
    expect(result.attempts.map((a) => a.challengeId).sort()).toEqual([
      "fails-a",
      "succeeds",
    ]);
  });

  it("logs a skipped/ineligible attempt with its reason", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysFails("fails-a", "no_films_rating_gte_4"));
    const films = [buildFilm()];

    const result = generateChallengeFilms({
      registry,
      slotCount: 1,
      context: buildContext({ candidates: films }),
      maxAttemptsPerSlot: 1,
    });

    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      challengeId: "fails-a",
      status: "ineligible",
      reason: "no_films_rating_gte_4",
      attemptNumber: 1,
    });
    expect(result.slots).toHaveLength(0);
    expect(result.unfulfilledSlotCount).toBe(1);
  });

  it("bounds the number of attempts per slot and gives up rather than trying every eligible challenge", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysFails("fails-a"));
    registry.register(alwaysFails("fails-b"));
    registry.register(alwaysFails("fails-c"));
    const films = [buildFilm()];

    const result = generateChallengeFilms({
      registry,
      slotCount: 1,
      context: buildContext({ candidates: films }),
      maxAttemptsPerSlot: 2,
    });

    expect(result.attempts).toHaveLength(2);
    expect(result.slots).toHaveLength(0);
    expect(result.unfulfilledSlotCount).toBe(1);
  });

  it("terminates without an infinite loop when no challenge is ever eligible", () => {
    const registry = createChallengeRegistry();
    registry.register({
      id: "never-eligible",
      name: "never-eligible",
      description: "never-eligible",
      category: "meta",
      requiredCapabilities: [],
      interactive: false,
      isEligible: () => false,
      attempt: () => ({ status: "ineligible", reason: "never" }),
    });
    const films = [buildFilm()];

    const result = generateChallengeFilms({
      registry,
      slotCount: 10,
      context: buildContext({ candidates: films }),
    });

    expect(result.slots).toHaveLength(0);
    expect(result.unfulfilledSlotCount).toBe(10);
    // One synthetic "no eligible challenges" log entry, then the loop breaks — it does not
    // retry the other 9 slots once it knows nothing can ever succeed.
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].reason).toBe("no_eligible_challenges_remaining");
  });

  it("terminates without an infinite loop when slotCount exceeds available candidates", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("succeed"));

    const result = generateChallengeFilms({
      registry,
      slotCount: 1000,
      context: buildContext({ candidates: [buildFilm()] }),
    });

    expect(result.slots).toHaveLength(1);
    expect(result.unfulfilledSlotCount).toBe(999);
  });

  it("returns immediately for a zero slot count", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("succeed"));

    const result = generateChallengeFilms({
      registry,
      slotCount: 0,
      context: buildContext({ candidates: [buildFilm()] }),
    });

    expect(result.slots).toEqual([]);
    expect(result.attempts).toEqual([]);
    expect(result.unfulfilledSlotCount).toBe(0);
  });

  it("avoids reusing a challenge across slots while an unused eligible one remains", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    registry.register(alwaysSucceeds("b"));
    const films = [
      buildFilm({ watchlistEntryId: "e1", filmId: "f1" }),
      buildFilm({ watchlistEntryId: "e2", filmId: "f2" }),
    ];

    const result = generateChallengeFilms({
      registry,
      slotCount: 2,
      context: buildContext({ candidates: films }),
    });

    const usedChallengeIds = result.slots.map((s) => s.challengeId);
    expect(new Set(usedChallengeIds).size).toBe(2);
  });

  it("allows reusing a challenge once every other eligible challenge is exhausted", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("only-one"));
    const films = [
      buildFilm({ watchlistEntryId: "e1", filmId: "f1" }),
      buildFilm({ watchlistEntryId: "e2", filmId: "f2" }),
    ];

    const result = generateChallengeFilms({
      registry,
      slotCount: 2,
      context: buildContext({ candidates: films }),
    });

    expect(result.slots).toHaveLength(2);
    expect(result.slots.every((s) => s.challengeId === "only-one")).toBe(true);
  });

  it("passes displayValue through from a successful attempt", () => {
    const registry = createChallengeRegistry();
    registry.register({
      id: "with-display",
      name: "with-display",
      description: "with-display",
      category: "meta",
      requiredCapabilities: [],
      interactive: false,
      isEligible: (ctx) => ctx.candidates.length > 0,
      attempt: (ctx) => ({
        status: "success",
        film: ctx.candidates[0],
        displayValue: { targetMinutes: 137 },
      }),
    });

    const result = generateChallengeFilms({
      registry,
      slotCount: 1,
      context: buildContext({ candidates: [buildFilm()] }),
    });

    expect(result.slots[0].displayValue).toEqual({ targetMinutes: 137 });
  });

  it("is deterministic for a given seed", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    registry.register(alwaysSucceeds("b"));
    registry.register(alwaysSucceeds("c"));
    const films = Array.from({ length: 3 }, (_, i) =>
      buildFilm({ watchlistEntryId: `e${i}`, filmId: `f${i}` }),
    );

    const run = () =>
      generateChallengeFilms({
        registry,
        slotCount: 3,
        context: buildContext({ candidates: films, rng: createSeededRng(42) }),
      });

    const first = run();
    const second = run();
    expect(first.slots.map((s) => s.challengeId)).toEqual(
      second.slots.map((s) => s.challengeId),
    );
    expect(first.slots.map((s) => s.film.filmId)).toEqual(
      second.slots.map((s) => s.film.filmId),
    );
  });

  it("provides previously-picked films to later challenges via context.previousPicks", () => {
    const registry = createChallengeRegistry();
    const seenPreviousPicks: number[] = [];
    registry.register({
      id: "records-previous-picks",
      name: "records-previous-picks",
      description: "records-previous-picks",
      category: "meta",
      requiredCapabilities: [],
      interactive: false,
      isEligible: (ctx) => ctx.candidates.length > 0,
      attempt: (ctx) => {
        seenPreviousPicks.push(ctx.previousPicks.length);
        return { status: "success", film: ctx.candidates[0] };
      },
    });
    const films = [
      buildFilm({ watchlistEntryId: "e1", filmId: "f1" }),
      buildFilm({ watchlistEntryId: "e2", filmId: "f2" }),
    ];

    generateChallengeFilms({
      registry,
      slotCount: 2,
      context: buildContext({ candidates: films }),
    });

    expect(seenPreviousPicks).toEqual([0, 1]);
  });

  it("does not call console.log in production mode", () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const registry = createChallengeRegistry();
      registry.register(alwaysSucceeds("succeed"));
      generateChallengeFilms({
        registry,
        slotCount: 1,
        context: buildContext({ candidates: [buildFilm()] }),
      });
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      vi.stubEnv("NODE_ENV", originalEnv ?? "test");
    }
  });
});
