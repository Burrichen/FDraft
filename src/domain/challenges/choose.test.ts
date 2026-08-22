import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { attemptChosenChallenges } from "./choose";
import { metaChallenges } from "./families/meta";
import { buildContext, buildFilm } from "./families/test-helpers";
import { createChallengeRegistry } from "./registry";
import type { ChallengeDefinition, ChallengeResult } from "./types";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "./types";

/** The real "diy" ChallengeDefinition (see families/meta.ts) — used, not a stub, so this test exercises the actual reservation semantics. */
function realDiyChallenge(): ChallengeDefinition {
  const diy = metaChallenges.find((c) => c.id === "diy");
  if (!diy) throw new Error("diy challenge not registered");
  return diy;
}

function alwaysSucceeds(id: string): ChallengeDefinition {
  return {
    id,
    name: id,
    description: id,
    category: "meta",
    requiredCapabilities: [],
    interactive: false,
    isEligible: (ctx) => ctx.candidates.length > 0,
    attempt: (ctx): ChallengeResult =>
      ctx.candidates.length === 0
        ? { status: "ineligible", reason: "no_candidates" }
        : { status: "success", film: ctx.candidates[0] },
  };
}

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

function interactiveStub(
  id: string,
  shownFilmCount: number,
): ChallengeDefinition {
  return {
    id,
    name: id,
    description: id,
    category: "meta",
    requiredCapabilities: [],
    interactive: true,
    isEligible: (ctx) => ctx.candidates.length >= shownFilmCount,
    attempt: (ctx): ChallengeResult => ({
      status: "requires_user_choice",
      interactionId: "three-doors",
      payload: {
        doors: ctx.candidates
          .slice(0, shownFilmCount)
          .map((film) => ({ kind: "short", film })),
      },
    }),
  };
}

function baseCtx(overrides: Parameters<typeof buildContext>[0] = {}) {
  return {
    rng: createSeededRng(1),
    now: new Date("2026-01-01T00:00:00.000Z"),
    candidates: [],
    watchedFilms: [],
    config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
    ...overrides,
  };
}

describe("attemptChosenChallenges", () => {
  it("fills every chosen slot with a successful challenge", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    registry.register(alwaysSucceeds("b"));
    const films = [
      buildFilm({ watchlistEntryId: "e1" }),
      buildFilm({ watchlistEntryId: "e2" }),
    ];

    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["a", "b"],
      context: baseCtx({ candidates: films }),
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.result.status === "success")).toBe(true);
  });

  it("never produces duplicate films across chosen challenges", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    const films = [
      buildFilm({ watchlistEntryId: "e1" }),
      buildFilm({ watchlistEntryId: "e2" }),
    ];

    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["a", "a", "a"], // same challenge chosen 3 times, only 2 films available
      context: baseCtx({ candidates: films }),
    });

    const successFilmIds = results
      .map((r) =>
        r.result.status === "success" ? r.result.film.watchlistEntryId : null,
      )
      .filter((id): id is string => id !== null);
    expect(new Set(successFilmIds).size).toBe(successFilmIds.length);
    expect(successFilmIds).toHaveLength(2);
    expect(results[2].result.status).not.toBe("success");
  });

  it("does not substitute a different challenge when the chosen one fails", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysFails("a", "specific_failure_reason"));
    registry.register(alwaysSucceeds("b")); // eligible, but must NOT be substituted in for "a"

    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["a"],
      context: baseCtx({ candidates: [buildFilm()] }),
    });

    expect(results).toEqual([
      {
        challengeId: "a",
        result: { status: "ineligible", reason: "specific_failure_reason" },
      },
    ]);
  });

  it("reports failure for an unknown challenge id without throwing", () => {
    const registry = createChallengeRegistry();
    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["does-not-exist"],
      context: baseCtx({ candidates: [buildFilm()] }),
    });
    expect(results).toEqual([
      {
        challengeId: "does-not-exist",
        result: { status: "failure", reason: "unknown_challenge_id" },
      },
    ]);
  });

  it("removes every film shown by an interactive challenge from the pool for later slots", () => {
    const registry = createChallengeRegistry();
    registry.register(interactiveStub("doors", 3));
    registry.register(alwaysSucceeds("filler"));
    const films = Array.from({ length: 4 }, (_, i) =>
      buildFilm({ watchlistEntryId: `e${i}` }),
    );

    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["doors", "filler"],
      context: baseCtx({ candidates: films }),
    });

    expect(results[0].result.status).toBe("requires_user_choice");
    const fillerResult = results[1].result;
    expect(fillerResult.status).toBe("success");
    if (fillerResult.status === "success") {
      // Only e3 was never shown as a door candidate — it must be the one filler picks.
      expect(fillerResult.film.watchlistEntryId).toBe("e3");
    }
  });

  it("passes manualSelections through to every attempted challenge", () => {
    const registry = createChallengeRegistry();
    let seenManualGenre: string | undefined;
    registry.register({
      id: "reads-manual-selection",
      name: "reads-manual-selection",
      description: "reads-manual-selection",
      category: "genres",
      requiredCapabilities: [],
      interactive: false,
      isEligible: () => true,
      attempt: (ctx) => {
        seenManualGenre = ctx.manualSelections?.genre;
        return { status: "success", film: ctx.candidates[0] };
      },
    });

    attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["reads-manual-selection"],
      context: baseCtx({
        candidates: [buildFilm()],
        manualSelections: { genre: "Horror" },
      }),
    });

    expect(seenManualGenre).toBe("Horror");
  });

  it("resolves a 'diy' slot before an earlier-listed challenge can steal its pre-selected film", () => {
    // "a" is a generic challenge that (like The Number 7 or a lottery) just
    // grabs whatever film happens to be first in the pool — it has no idea
    // a later slot's user reserved that exact film for their DIY pick.
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    registry.register(realDiyChallenge());
    const reserved = buildFilm({ watchlistEntryId: "reserved-for-diy" });
    const other = buildFilm({ watchlistEntryId: "other" });

    const { results } = attemptChosenChallenges({
      registry,
      // "a" is listed FIRST, "diy" second — without diy-first resolution,
      // "a" would consume `reserved` before "diy" ever ran.
      chosenChallengeIds: ["a", "diy"],
      context: baseCtx({
        candidates: [reserved, other],
        manualSelections: { diyFilmEntryIds: [reserved.watchlistEntryId] },
      }),
    });

    expect(results).toHaveLength(2);
    const diyResult = results[1].result;
    expect(diyResult.status).toBe("success");
    if (diyResult.status === "success") {
      expect(diyResult.film.watchlistEntryId).toBe("reserved-for-diy");
    }
    const aResult = results[0].result;
    expect(aResult.status).toBe("success");
    if (aResult.status === "success") {
      expect(aResult.film.watchlistEntryId).toBe("other");
    }
  });

  it("preserves relative order among multiple non-diy slots when a diy slot is reordered ahead of them", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    registry.register(alwaysSucceeds("b"));
    registry.register(realDiyChallenge());
    const films = Array.from({ length: 3 }, (_, i) =>
      buildFilm({ watchlistEntryId: `e${i}` }),
    );

    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: ["a", "diy", "b"],
      context: baseCtx({
        candidates: films,
        manualSelections: { diyFilmEntryIds: ["e2"] },
      }),
    });

    expect(results.map((r) => r.challengeId)).toEqual(["a", "diy", "b"]);
    expect(results.every((r) => r.result.status === "success")).toBe(true);
  });

  it("returns an empty results array for an empty chosen-challenge list", () => {
    const registry = createChallengeRegistry();
    const { results } = attemptChosenChallenges({
      registry,
      chosenChallengeIds: [],
      context: baseCtx({ candidates: [buildFilm()] }),
    });
    expect(results).toEqual([]);
  });

  it("is deterministic for a given seed", () => {
    const registry = createChallengeRegistry();
    registry.register(alwaysSucceeds("a"));
    const films = [
      buildFilm({ watchlistEntryId: "e1" }),
      buildFilm({ watchlistEntryId: "e2" }),
    ];
    const run = () =>
      attemptChosenChallenges({
        registry,
        chosenChallengeIds: ["a"],
        context: baseCtx({ candidates: films, rng: createSeededRng(7) }),
      });
    const first = run();
    const second = run();
    expect(first).toEqual(second);
  });
});
