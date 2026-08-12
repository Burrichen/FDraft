import { differenceInCalendarDays, differenceInYears } from "date-fns";
import { parseCalendarDate } from "@/domain/time/calendar-date";
import {
  countOccurrences,
  percentileSubsetAscendingBy,
  withKnownGenres,
  withKnownWatchCount,
} from "./families/shared";
import type {
  ChallengeCandidateFilm,
  ChallengeEngineConfig,
  ChallengeWatchedFilmRecord,
} from "./types";

/**
 * The shared ticket-calculation framework behind "The Draft Lottery" and
 * "The Anti-Draft Lottery" (see docs/product-spec.md — the anti-lottery
 * explicitly "start[s] from the same transparent ticket framework"). Every
 * film gets a baseline ticket plus bonuses; the anti-lottery additionally
 * applies penalties on top of the exact same base calculation, so the two
 * challenges can never drift into two different definitions of "tickets".
 *
 * Both challenges expose the full per-film breakdown (not just the total),
 * satisfying "store/expose the ticket calculation for debugging".
 */

const HIGHLY_RATED_MIN_RATING = 4.0;
const UNDERWATCHED_PERCENTILE = 0.25;
const UNDERREPRESENTED_GENRE_PERCENTILE = 0.25;

export interface LotteryTicketBreakdown {
  watchlistEntryId: string;
  filmId: string;
  baseline: number;
  /** +1 per complete year the film has been on the watchlist. */
  completeYearsOnWatchlistBonus: number;
  /** +2 if the film's watch count is in the bottom 25% of eligible films with known watch count. 0 if watch count is unknown. */
  underwatchedBonus: number;
  /** +2 if any of the film's genres is in the bottom 25% of genre frequency across eligible films. 0 if genres are unknown. */
  underrepresentedGenreBonus: number;
  /** +1 if the film's average rating is 4.0 or higher. 0 if rating is unknown. */
  highlyRatedBonus: number;
  totalTickets: number;
}

/** Which watchlist entries fall in the bottom 25% by watch count — see "underwatched" in the module doc comment. */
function getUnderwatchedEntryIds(
  candidates: readonly ChallengeCandidateFilm[],
): Set<string> {
  const withWatchCount = withKnownWatchCount(candidates);
  const bottomQuartile = percentileSubsetAscendingBy(
    withWatchCount,
    (film) => film.watchCount,
    UNDERWATCHED_PERCENTILE,
  );
  return new Set(bottomQuartile.map((film) => film.watchlistEntryId));
}

/** Which genres fall in the bottom 25% by frequency — see "underrepresented genre" in the module doc comment. */
function getUnderrepresentedGenres(
  candidates: readonly ChallengeCandidateFilm[],
): Set<string> {
  const counts = countOccurrences(
    withKnownGenres(candidates),
    (film) => film.genres,
  );
  const entries = [...counts.entries()].map(([genre, count]) => ({
    genre,
    count,
  }));
  const bottomQuartile = percentileSubsetAscendingBy(
    entries,
    (entry) => entry.count,
    UNDERREPRESENTED_GENRE_PERCENTILE,
  );
  return new Set(bottomQuartile.map((entry) => entry.genre));
}

/** The base ticket calculation shared by both lottery challenges — see the module doc comment. */
export function calculateLotteryTickets(
  candidates: readonly ChallengeCandidateFilm[],
  now: Date,
): LotteryTicketBreakdown[] {
  const underwatchedEntryIds = getUnderwatchedEntryIds(candidates);
  const underrepresentedGenres = getUnderrepresentedGenres(candidates);

  return candidates.map((film) => {
    const baseline = 1;
    const completeYearsOnWatchlistBonus = Math.max(
      0,
      differenceInYears(now, parseCalendarDate(film.dateAdded)),
    );
    const underwatchedBonus = underwatchedEntryIds.has(film.watchlistEntryId)
      ? 2
      : 0;
    const underrepresentedGenreBonus = (film.genres ?? []).some((genre) =>
      underrepresentedGenres.has(genre),
    )
      ? 2
      : 0;
    const highlyRatedBonus =
      film.averageRating !== null &&
      film.averageRating >= HIGHLY_RATED_MIN_RATING
        ? 1
        : 0;

    return {
      watchlistEntryId: film.watchlistEntryId,
      filmId: film.filmId,
      baseline,
      completeYearsOnWatchlistBonus,
      underwatchedBonus,
      underrepresentedGenreBonus,
      highlyRatedBonus,
      totalTickets:
        baseline +
        completeYearsOnWatchlistBonus +
        underwatchedBonus +
        underrepresentedGenreBonus +
        highlyRatedBonus,
    };
  });
}

export interface AntiLotteryTicketBreakdown extends LotteryTicketBreakdown {
  /** 0 or negative — see "recently added" in the module doc comment. */
  recentAdditionPenalty: number;
  /** 0 or negative — see "taste similarity" in the module doc comment. Always 0 when `tasteSimilarityPenaltyOmitted`. */
  tasteSimilarityPenalty: number;
  /** True when there wasn't enough rated watch history to compute a taste signal — the penalty was omitted, not guessed at. */
  tasteSimilarityPenaltyOmitted: boolean;
}

/**
 * "Established taste" genres: the genre(s) most frequent among the user's
 * own highly-rated watched films (see docs/product-spec.md, "The
 * Anti-Draft Lottery" — "Taste similarity must use real available history
 * and documented logic"). Requires at least
 * `config.minHighRatedWatchesForTasteSignal` qualifying watched films with
 * known genres; below that, returns `null` ("omit that penalty rather than
 * guessing") rather than drawing a conclusion from too little data.
 */
function getEstablishedTasteGenres(
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
  config: ChallengeEngineConfig,
): Set<string> | null {
  const highlyRated = watchedFilms.filter(
    (watched) =>
      watched.userRating !== null &&
      watched.userRating >= config.establishedTasteMinUserRating &&
      watched.genres !== null &&
      watched.genres.length > 0,
  );
  if (highlyRated.length < config.minHighRatedWatchesForTasteSignal) {
    return null;
  }

  const counts = countOccurrences(highlyRated, (watched) => watched.genres);
  const maxCount = Math.max(...counts.values());
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count === maxCount)
      .map(([genre]) => genre),
  );
}

/** The anti-lottery's ticket calculation: the same base framework, plus penalties, floored at 1 ticket. */
export function calculateAntiLotteryTickets(
  candidates: readonly ChallengeCandidateFilm[],
  now: Date,
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
  config: ChallengeEngineConfig,
): AntiLotteryTicketBreakdown[] {
  const baseBreakdowns = calculateLotteryTickets(candidates, now);
  const baseByEntryId = new Map(
    baseBreakdowns.map((breakdown) => [breakdown.watchlistEntryId, breakdown]),
  );
  const establishedTasteGenres = getEstablishedTasteGenres(
    watchedFilms,
    config,
  );

  return candidates.map((film) => {
    // Always present: calculateLotteryTickets produces exactly one breakdown per input film.
    const base = baseByEntryId.get(film.watchlistEntryId)!;

    const daysSinceAdded = differenceInCalendarDays(
      now,
      parseCalendarDate(film.dateAdded),
    );
    const recentAdditionPenalty =
      daysSinceAdded < config.antiLotteryRecentAdditionDays
        ? -config.antiLotteryRecentAdditionPenalty
        : 0;

    const tasteSimilarityPenaltyOmitted = establishedTasteGenres === null;
    const tasteSimilarityPenalty =
      establishedTasteGenres !== null &&
      (film.genres ?? []).some((genre) => establishedTasteGenres.has(genre))
        ? -config.antiLotteryTasteSimilarityPenalty
        : 0;

    const rawTotal =
      base.baseline +
      base.completeYearsOnWatchlistBonus +
      base.underwatchedBonus +
      base.underrepresentedGenreBonus +
      base.highlyRatedBonus +
      recentAdditionPenalty +
      tasteSimilarityPenalty;

    return {
      ...base,
      recentAdditionPenalty,
      tasteSimilarityPenalty,
      tasteSimilarityPenaltyOmitted,
      totalTickets: Math.max(1, rawTotal),
    };
  });
}
