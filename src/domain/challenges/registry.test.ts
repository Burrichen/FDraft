import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { createChallengeRegistry } from "./registry";
import type { ChallengeContext, ChallengeDefinition } from "./types";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "./types";

function buildContext(
  overrides: Partial<ChallengeContext> = {},
): ChallengeContext {
  return {
    rng: createSeededRng(1),
    now: new Date("2026-01-01T00:00:00.000Z"),
    candidates: [],
    previousPicks: [],
    watchedFilms: [],
    config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
    ...overrides,
  };
}

function buildChallenge(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    id: "test-challenge",
    name: "Test Challenge",
    description: "A challenge used only in tests.",
    category: "meta",
    requiredCapabilities: [],
    interactive: false,
    isEligible: () => true,
    attempt: () => ({
      status: "ineligible",
      reason: "no_candidates",
    }),
    ...overrides,
  };
}

describe("createChallengeRegistry", () => {
  it("registers and retrieves a challenge by id", () => {
    const registry = createChallengeRegistry();
    const challenge = buildChallenge();
    registry.register(challenge);
    expect(registry.getById("test-challenge")).toBe(challenge);
  });

  it("returns undefined for an unknown id", () => {
    const registry = createChallengeRegistry();
    expect(registry.getById("nonexistent")).toBeUndefined();
  });

  it("throws when registering a duplicate id", () => {
    const registry = createChallengeRegistry();
    registry.register(buildChallenge());
    expect(() => registry.register(buildChallenge())).toThrow();
  });

  it("lists all registered challenges", () => {
    const registry = createChallengeRegistry();
    registry.register(buildChallenge({ id: "a" }));
    registry.register(buildChallenge({ id: "b" }));
    expect(
      registry
        .list()
        .map((c) => c.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("filters by category", () => {
    const registry = createChallengeRegistry();
    registry.register(buildChallenge({ id: "a", category: "runtime" }));
    registry.register(buildChallenge({ id: "b", category: "genres" }));
    expect(registry.listByCategory("runtime").map((c) => c.id)).toEqual(["a"]);
  });

  it("filters to eligible challenges for a given context without calling attempt", () => {
    const registry = createChallengeRegistry();
    let attemptCalls = 0;
    registry.register(
      buildChallenge({
        id: "eligible",
        isEligible: () => true,
        attempt: () => {
          attemptCalls++;
          return { status: "failure", reason: "should not be called" };
        },
      }),
    );
    registry.register(
      buildChallenge({ id: "ineligible", isEligible: () => false }),
    );

    const eligible = registry.listEligible(buildContext());

    expect(eligible.map((c) => c.id)).toEqual(["eligible"]);
    expect(attemptCalls).toBe(0);
  });
});
