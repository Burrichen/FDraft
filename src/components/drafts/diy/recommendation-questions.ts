import { sortWatchlistFilms } from "@/domain/watchlist/sort-filter";
import type { DiySelectableFilmView } from "./diy-film-card";

/**
 * The DIY Draft selection screen's recommendation sidebar (see
 * docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT",
 * "RECOMMENDATION/QUESTION SIDEBAR") — a small, deliberately extensible
 * list of "questions" the user can expand for help deciding what to
 * pick. Each one is pure: it only ever reads the same eligible film pool
 * the main selection grid already has and returns a short list to show —
 * never mutates anything, never selects a film on its own. Adding a new
 * question later is just appending another entry here; the sidebar
 * component itself has no per-question logic to change.
 */
export interface RecommendationQuestion {
  id: string;
  label: string;
  /** Computes this question's recommended films from the full eligible pool — pure, no side effects. */
  recommend: (
    films: readonly DiySelectableFilmView[],
  ) => DiySelectableFilmView[];
}

export const RECOMMENDATION_QUESTIONS: RecommendationQuestion[] = [
  {
    id: "highest-rated",
    label: "What are my highest rated movies?",
    // Same rating source (provider `averageRating`) and comparator the
    // Watchlist's own "Average Rating — Highest First" sort already
    // uses — see `domain/watchlist/sort-filter.ts`.
    recommend: (films) => sortWatchlistFilms(films, "rating_desc").slice(0, 10),
  },
  {
    id: "longest-on-watchlist",
    label: "What movies have been on my watchlist the longest?",
    // Same comparator the Watchlist's own "Date Added — Oldest First"
    // sort already uses.
    recommend: (films) =>
      sortWatchlistFilms(films, "date_added_asc").slice(0, 5),
  },
];
