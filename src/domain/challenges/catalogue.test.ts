import { describe, expect, it } from "vitest";
import { ALL_CHALLENGES, registerAllChallenges } from "./catalogue";
import { createChallengeRegistry } from "./registry";

describe("catalogue", () => {
  it("has 78 challenges across the full ten-category catalogue with unique ids", () => {
    expect(ALL_CHALLENGES).toHaveLength(78);
    const ids = ALL_CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(78);
  });

  it("every challenge has a non-empty name and description", () => {
    for (const challenge of ALL_CHALLENGES) {
      expect(challenge.name.length).toBeGreaterThan(0);
      expect(challenge.description.length).toBeGreaterThan(0);
    }
  });

  it("exactly the three Battle Royale / Three Doors challenges are interactive", () => {
    const interactiveIds = ALL_CHALLENGES.filter((c) => c.interactive)
      .map((c) => c.id)
      .sort();
    expect(interactiveIds).toEqual([
      "battle-royale",
      "battle-royale-underdog",
      "three-doors",
    ]);
  });

  it("registers cleanly into a fresh registry", () => {
    const registry = createChallengeRegistry();
    registerAllChallenges(registry);
    expect(registry.list()).toHaveLength(78);
  });

  it("is idempotent — registering twice does not throw or duplicate", () => {
    const registry = createChallengeRegistry();
    registerAllChallenges(registry);
    expect(() => registerAllChallenges(registry)).not.toThrow();
    expect(registry.list()).toHaveLength(78);
  });

  it("the real singleton registry has all 78 challenges registered on import", async () => {
    const { challengeRegistry } = await import("./registry");
    expect(challengeRegistry.list().length).toBeGreaterThanOrEqual(78);
  });
});
