import {
  fetchLocalChallengeCandidates,
  fetchLocalChallengeWatchedFilms,
} from "@/application/drafts/local-fetch-context";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import type {
  ChallengeCandidateFilm,
  ChallengeContext,
  ChallengeWatchedFilmRecord,
} from "@/domain/challenges/types";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "@/domain/challenges/types";
import type { DataCapability } from "@/domain/shared/data-capability";
import { createDefaultRng } from "@/domain/shared/rng";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

/**
 * Local port of `src/lib/challenges/list-availability.ts` — identical
 * logic (same capability-based "why disabled" reasoning), sourced from the
 * local repositories instead of Supabase. Powers "Choose My Challenge" on
 * the local `/drafts/new` page.
 *
 * Interactive challenges (Battle Royale, its Underdog variant, Three
 * Doors) are filtered OUT of what's offered here — see
 * docs/product-spec.md implementation log, Phase 9.5B, "What this phase
 * does NOT do": resolving an interactive challenge (`resolve_draft_
 * challenge_interaction`'s local equivalent) hasn't been ported yet, so
 * offering them here would let a user pick a challenge slot that can never
 * finish. "Decide My Challenge For Me" already never selects an
 * interactive challenge on its own (unchanged, existing engine behavior —
 * see Phase 8's implementation log) so this filter only affects the
 * explicit browser.
 */
export interface ChallengeAvailability {
  id: string;
  name: string;
  description: string;
  category: string;
  interactive: boolean;
  eligible: boolean;
  ineligibleReason: string | null;
}

const CAPABILITY_LABELS: Record<DataCapability, string> = {
  runtime: "runtime",
  genres: "genres",
  directors: "directors",
  countries: "country of origin",
  languages: "language",
  collection: "collection/franchise",
  average_rating: "community rating",
  popularity: "popularity score",
  watch_count: "watch count",
  fans_count: "fans count",
  list_appearances: "list appearances",
  watched_history: "watch history",
  user_ratings: "your own ratings",
  previous_draft_pick: "a previous draft pick",
  primary_language: "original language",
};

function computeAvailableCapabilities(
  candidates: readonly ChallengeCandidateFilm[],
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
): Set<DataCapability> {
  const available = new Set<DataCapability>();
  const hasAny = <T>(values: readonly T[], predicate: (value: T) => boolean) =>
    values.some(predicate);

  if (hasAny(candidates, (c) => c.runtimeMinutes !== null))
    available.add("runtime");
  if (hasAny(candidates, (c) => !!c.genres?.length)) available.add("genres");
  if (hasAny(candidates, (c) => !!c.directors?.length))
    available.add("directors");
  if (hasAny(candidates, (c) => !!c.countries?.length))
    available.add("countries");
  if (hasAny(candidates, (c) => !!c.languages?.length))
    available.add("languages");
  if (hasAny(candidates, (c) => c.collectionId !== null))
    available.add("collection");
  if (hasAny(candidates, (c) => c.averageRating !== null))
    available.add("average_rating");
  if (hasAny(candidates, (c) => c.popularity !== null))
    available.add("popularity");
  if (hasAny(candidates, (c) => c.watchCount !== null))
    available.add("watch_count");
  if (hasAny(candidates, (c) => c.fansCount !== null))
    available.add("fans_count");
  if (hasAny(candidates, (c) => c.listAppearances !== null))
    available.add("list_appearances");
  if (hasAny(candidates, (c) => c.primaryLanguage !== null))
    available.add("primary_language");
  if (watchedFilms.length > 0) available.add("watched_history");
  if (hasAny(watchedFilms, (w) => w.userRating !== null))
    available.add("user_ratings");
  available.add("previous_draft_pick");

  return available;
}

export async function listLocalChallengeAvailability(
  repos: {
    watchlist: WatchlistRepository;
    films: FilmRepository;
    history: HistoryRepository;
  },
  profileId: string,
): Promise<{ challenges: ChallengeAvailability[]; availableGenres: string[] }> {
  const candidates = await fetchLocalChallengeCandidates(repos, profileId);
  const watchedFilms = await fetchLocalChallengeWatchedFilms(repos, profileId);
  const availableCapabilities = computeAvailableCapabilities(
    candidates,
    watchedFilms,
  );

  const context: ChallengeContext = {
    rng: createDefaultRng(),
    now: new Date(),
    candidates,
    previousPicks: [],
    watchedFilms,
    config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
  };

  const challenges = challengeRegistry
    .list()
    .filter((challenge) => !challenge.interactive)
    .map((challenge) => {
      const eligible = challenge.isEligible(context);
      const missingCapabilities = challenge.requiredCapabilities.filter(
        (cap) => !availableCapabilities.has(cap),
      );

      let ineligibleReason: string | null = null;
      if (!eligible) {
        ineligibleReason =
          missingCapabilities.length > 0
            ? `Needs ${missingCapabilities.map((cap) => CAPABILITY_LABELS[cap]).join(", ")} data, which isn't available yet.`
            : "Not enough eligible films in your watchlist right now.";
      }

      return {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        category: challenge.category,
        interactive: challenge.interactive,
        eligible,
        ineligibleReason,
      };
    });

  const availableGenres = [
    ...new Set(candidates.flatMap((candidate) => candidate.genres ?? [])),
  ].sort();

  return { challenges, availableGenres };
}
