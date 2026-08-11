import type { ChallengeContext, ChallengeDefinition } from "./types";

/**
 * Central catalogue of challenge definitions. Deliberately just a typed
 * lookup with a duplicate-id guard — selection (which challenges to try),
 * execution (calling `.attempt`), and presentation are all separate
 * concerns layered on top of this, not folded in here.
 */
export interface ChallengeRegistry {
  register(definition: ChallengeDefinition): void;
  getById(id: string): ChallengeDefinition | undefined;
  list(): ChallengeDefinition[];
  listByCategory(
    category: ChallengeDefinition["category"],
  ): ChallengeDefinition[];
  /** Challenges whose cheap `isEligible` pre-check passes for the given context. */
  listEligible(context: ChallengeContext): ChallengeDefinition[];
}

export function createChallengeRegistry(): ChallengeRegistry {
  const challenges = new Map<string, ChallengeDefinition>();

  return {
    register(definition) {
      if (challenges.has(definition.id)) {
        throw new Error(`Challenge id already registered: ${definition.id}`);
      }
      challenges.set(definition.id, definition);
    },
    getById(id) {
      return challenges.get(id);
    },
    list() {
      return [...challenges.values()];
    },
    listByCategory(category) {
      return [...challenges.values()].filter(
        (challenge) => challenge.category === category,
      );
    },
    listEligible(context) {
      return [...challenges.values()].filter((challenge) =>
        challenge.isEligible(context),
      );
    },
  };
}

/**
 * The application's real challenge registry. Empty until the challenge
 * catalogue phase registers definitions against it — see
 * docs/product-spec.md, "Challenge Catalogue".
 */
export const challengeRegistry = createChallengeRegistry();
