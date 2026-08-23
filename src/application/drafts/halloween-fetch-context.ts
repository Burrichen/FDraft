import { fetchLocalChallengeCandidates } from "@/application/drafts/local-fetch-context";
import { getHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import type { ChallengeCandidateFilm } from "@/domain/challenges/types";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type HalloweenFetchRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  history: HistoryRepository;
};

/**
 * The Halloween-adjacent pool (see docs/updates, "PROMPT 19 — HALLOWEEN
 * DRAFT MECHANICS" §3): a film must exist on the profile's ACTIVE
 * watchlist AND carry "Horror" as a genre tag in its real metadata.
 * Reuses `fetchLocalChallengeCandidates` unchanged — every existing
 * eligibility check (unreleased/franchise-order/identity-mismatch/already
 * watched) still applies for free — and simply filters to a case-
 * insensitive genre match. A film with no metadata at all has
 * `genres: null`, which never matches, satisfying "missing genre metadata
 * means it does not qualify" with no extra code.
 */
export async function fetchHalloweenAdjacentCandidates(
  repos: HalloweenFetchRepos,
  profileId: string,
): Promise<ChallengeCandidateFilm[]> {
  const candidates = await fetchLocalChallengeCandidates(repos, profileId);
  return candidates.filter((candidate) =>
    (candidate.genres ?? []).some((genre) => genre.toLowerCase() === "horror"),
  );
}

export interface HalloweenManifestCandidate {
  filmId: string;
  title: string;
  releaseYear: number | null;
}

/**
 * The Horror or Kitsch pool (see §4/§5): every film the global manifest
 * has resolved-or-created locally (see `halloween-manifest-overlay.ts`),
 * excluding anything the profile has already watched — the one universal
 * FDraft invariant worth preserving here. Deliberately does NOT run the
 * richer `evaluateCandidateEligibility` checks (unreleased/franchise-order/
 * identity-mismatch) — those exist for watchlist pool integrity; Horror/
 * Kitsch are curator-maintained one-off picks, not a franchise-ordered
 * watchlist, and don't need them.
 */
export async function fetchHalloweenManifestCandidates(
  repos: { films: FilmRepository; history: HistoryRepository },
  profileId: string,
  filmIds: string[],
): Promise<HalloweenManifestCandidate[]> {
  if (filmIds.length === 0) {
    return [];
  }
  const [films, watchedHistory] = await Promise.all([
    Promise.all(filmIds.map((id) => repos.films.getById(id))),
    repos.history.listWatchedHistory(profileId),
  ]);
  const watchedFilmIds = new Set(watchedHistory.map((entry) => entry.filmId));

  return films
    .filter((film): film is NonNullable<typeof film> => film !== null)
    .filter((film) => !watchedFilmIds.has(film.id))
    .map((film) => ({
      filmId: film.id,
      title: film.title,
      releaseYear: film.releaseYear,
    }));
}

export interface HalloweenPoolCapacity {
  halloweenAdjacentAvailable: number;
  horrorAvailable: number;
  kitschAvailable: number;
}

/**
 * "Halloween-adjacent 12 available / Horror 58 available / Kitsch 37
 * available" (see §9). Each number is computed INDEPENDENTLY — not
 * cross-pool-deduplicated against the other two — a deliberate,
 * documented simplification: a film that happens to qualify for more than
 * one pool is counted in each pool's display total, but true
 * non-duplication is only guaranteed at actual generation time, via the
 * sequential draw in `createHalloweenLocalDraft`.
 */
export async function computeHalloweenPoolCapacity(
  repos: HalloweenFetchRepos,
  profileId: string,
): Promise<HalloweenPoolCapacity> {
  const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
  const [adjacent, horror, kitsch] = await Promise.all([
    fetchHalloweenAdjacentCandidates(repos, profileId),
    fetchHalloweenManifestCandidates(repos, profileId, horrorFilmIds),
    fetchHalloweenManifestCandidates(repos, profileId, kitschFilmIds),
  ]);
  return {
    halloweenAdjacentAvailable: adjacent.length,
    horrorAvailable: horror.length,
    kitschAvailable: kitsch.length,
  };
}
