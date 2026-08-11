import { collectionChallenges } from "./families/collections";
import { contextualChallenges } from "./families/contextual";
import { countryLanguageChallenges } from "./families/country-language";
import { directorChallenges } from "./families/directors";
import { genreChallenges } from "./families/genres";
import { metaChallenges } from "./families/meta";
import { popularityChallenges } from "./families/popularity";
import { ratingsChallenges } from "./families/ratings";
import { runtimeChallenges } from "./families/runtime";
import { watchlistAgeChallenges } from "./families/watchlist-age";
import { challengeRegistry, type ChallengeRegistry } from "./registry";
import type { ChallengeDefinition } from "./types";

export { challengeRegistry };

/**
 * Every challenge in the full catalogue (see docs/product-spec.md,
 * "Challenge Catalogue") — all ten categories are now implemented.
 */
export const ALL_CHALLENGES: ChallengeDefinition[] = [
  ...watchlistAgeChallenges,
  ...runtimeChallenges,
  ...ratingsChallenges,
  ...popularityChallenges,
  ...genreChallenges,
  ...directorChallenges,
  ...countryLanguageChallenges,
  ...collectionChallenges,
  ...contextualChallenges,
  ...metaChallenges,
];

/**
 * Registers every known challenge, skipping any id already present. Guards
 * against Next.js dev-mode module re-evaluation (Fast Refresh) re-running
 * this file and hitting the registry's duplicate-id throw — that throw is
 * still valuable for catching a genuine copy-paste id collision between two
 * *different* challenges, just not for re-importing the same ones.
 */
export function registerAllChallenges(
  registry: ChallengeRegistry,
  definitions: ChallengeDefinition[] = ALL_CHALLENGES,
): void {
  for (const definition of definitions) {
    if (!registry.getById(definition.id)) {
      registry.register(definition);
    }
  }
}

registerAllChallenges(challengeRegistry);
