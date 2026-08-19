import { formatWatchlistDuration } from "@/domain/time/watchlist-duration";
import { isTrustworthyRuntime } from "@/domain/watchlist/runtime";
import { sortWatchlistFilms } from "@/domain/watchlist/sort-filter";
import type { DiySelectableFilmView } from "./diy-film-card";

/**
 * The DIY Draft selection screen's recommendation sidebar (see
 * docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT",
 * "RECOMMENDATION/QUESTION SIDEBAR"; v1.1.1, "Need Ideas copy" /
 * "Recommendation questions") — a small, deliberately extensible list of
 * "questions" the user can expand for help deciding what to pick. Each one
 * is pure: it only ever reads the SAME canonical eligible film pool the
 * main selection grid already has (see
 * `application/drafts/local-diy-candidates.ts`) and returns a short list
 * to show — never mutates anything, never selects a film on its own.
 * `now` is always an explicit parameter (never read internally — see
 * `domain/time/clock.ts`'s `Clock` convention), needed for the
 * "longest on watchlist" qualifier's relative-duration text.
 *
 * Every question that depends on a piece of provider-enriched data (a
 * rating, a runtime) or Letterboxd-catalog data (a release year) must
 * REQUIRE that field to be non-null before a film can qualify — never
 * silently pad out a list with an untrustworthy/missing value (see
 * docs/updates, v1.1.1, "Metadata integrity": "If a field is required for
 * a recommendation criterion, exclude candidates lacking trustworthy data
 * for that criterion"). `requireTrustworthy` centralizes that filter so a
 * future question gets it for free by construction, the same way the
 * canonical eligible set gives every question the same base eligibility
 * for free.
 */
export interface RecommendationQuestion {
  id: string;
  label: string;
  /** Computes this question's recommended films from the full eligible pool — pure, no side effects. */
  recommend: (
    films: readonly DiySelectableFilmView[],
    now: Date,
  ) => DiySelectableFilmView[];
  /**
   * A short "why this qualified" string shown alongside each recommended
   * film (e.g. "★ 4.5", "92 min", "On your watchlist for 8 months").
   * Omitted entirely (not just blank) when the qualifying detail is
   * already visible elsewhere — see docs/updates, v1.1.2, "'I want
   * something recent' cleanup": its release year is already shown next to
   * the title, so a second "Released in <year>" line was pure redundancy.
   */
  qualifier?: (film: DiySelectableFilmView, now: Date) => string;
}

function requireTrustworthy(
  films: readonly DiySelectableFilmView[],
  getField: (film: DiySelectableFilmView) => number | null,
): DiySelectableFilmView[] {
  return films.filter((film) => getField(film) !== null);
}

const SOMETHING_SHORT_MAX_RUNTIME_MINUTES = 120;
const DEFAULT_RECOMMENDATION_LIMIT = 10;

export const RECOMMENDATION_QUESTIONS: RecommendationQuestion[] = [
  {
    id: "highest-rated",
    label: "What are my highest rated movies?",
    recommend: (films) =>
      sortWatchlistFilms(
        // Same rating source (provider `averageRating`) and comparator the
        // Watchlist's own "Average Rating — Highest First" sort already
        // uses — see `domain/watchlist/sort-filter.ts`.
        requireTrustworthy(films, (f) => f.averageRating),
        "rating_desc",
      ).slice(0, DEFAULT_RECOMMENDATION_LIMIT),
    qualifier: (film) => `★ ${film.averageRating!.toFixed(1)}`,
  },
  {
    id: "longest-on-watchlist",
    label: "What movies have been on my watchlist the longest?",
    recommend: (films) =>
      // `dateAdded` is a required, always-present field (see
      // `WatchlistEntryRecord.dateAdded`) — no trustworthiness filter
      // needed, unlike the provider-enriched fields above.
      sortWatchlistFilms(films, "date_added_asc").slice(0, 5),
    qualifier: (film, now) =>
      `On your watchlist for ${formatWatchlistDuration(film.dateAdded, now)}`,
  },
  {
    id: "something-short",
    label: "I want something short",
    recommend: (films) =>
      sortWatchlistFilms(
        films
          .filter((f) => isTrustworthyRuntime(f.runtimeMinutes))
          .filter(
            (f) => f.runtimeMinutes! < SOMETHING_SHORT_MAX_RUNTIME_MINUTES,
          ),
        "runtime_asc",
      ).slice(0, DEFAULT_RECOMMENDATION_LIMIT),
    qualifier: (film) => `${film.runtimeMinutes} min`,
  },
  {
    id: "something-recent",
    label: "I want something recent",
    recommend: (films) =>
      sortWatchlistFilms(
        requireTrustworthy(films, (f) => f.releaseYear),
        "release_year_desc",
      ).slice(0, DEFAULT_RECOMMENDATION_LIMIT),
    // No qualifier — the release year is already shown next to the title.
  },
  {
    id: "take-me-back",
    label: "Take me back",
    recommend: (films) =>
      sortWatchlistFilms(
        requireTrustworthy(films, (f) => f.releaseYear),
        "release_year_asc",
      ).slice(0, DEFAULT_RECOMMENDATION_LIMIT),
    qualifier: (film) => `Released in ${film.releaseYear}`,
  },
];
