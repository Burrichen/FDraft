import type { DataCapability } from "@/domain/shared/data-capability";
import type { Rng } from "@/domain/shared/rng";

/**
 * Foundational contracts for the challenge engine (see docs/product-spec.md,
 * "Challenge Architecture" and "Challenge Catalogue"). No challenges are
 * registered yet — this phase only establishes the shape everything else
 * will be built against: selection, execution, candidate filtering, and
 * presentation stay separate concerns instead of one growing switch
 * statement.
 */

export type ChallengeCategory =
  | "watchlist-age"
  | "runtime"
  | "ratings"
  | "popularity"
  | "genres"
  | "directors"
  | "country-language"
  | "collections"
  | "contextual"
  | "meta";

/**
 * A watchlist film as the challenge engine sees it: a flat, provider-neutral
 * shape, not a raw DB row. All enrichable fields are nullable because
 * different providers support different fields and missing data must never
 * be invented (see docs/product-spec.md, "Data Provider Rule").
 */
export interface ChallengeCandidateFilm {
  watchlistEntryId: string;
  filmId: string;
  title: string;
  releaseYear: number | null;
  /** ISO calendar date (YYYY-MM-DD) the film was added to the watchlist. */
  dateAdded: string;
  position: number | null;
  selectionWeight: number;
  runtimeMinutes: number | null;
  genres: string[] | null;
  directors: string[] | null;
  countries: string[] | null;
  languages: string[] | null;
  /**
   * The film's single canonical primary/original language (see
   * docs/product-spec.md, "No English Allowed" — "Define which provider
   * field is canonical"). Deliberately separate from `languages` (every
   * spoken language, unordered) rather than reading `languages[0]`: our
   * TMDB provider stores `spoken_languages` with no defined "primary"
   * ordering, so treating its first entry as "the" original language would
   * be exactly the kind of unrelated-metadata substitution this field
   * exists to avoid. No current provider populates this yet — same
   * situation as `watchCount`/`fansCount`/`listAppearances` after Phase 2
   * (see that phase's implementation log) — so it stays null, and any
   * challenge depending on it is honestly ineligible, until a future phase
   * maps a real "original language" field (e.g. TMDB's `original_language`).
   */
  primaryLanguage: string | null;
  collectionId: string | null;
  collectionOrder: number | null;
  averageRating: number | null;
  popularity: number | null;
  watchCount: number | null;
  fansCount: number | null;
  listAppearances: number | null;
}

export interface ChallengeEngineConfig {
  /** Minimum runtime (minutes) to count as "feature length". Default 40 — see "Plus Sized Short King". */
  featureLengthMinutesThreshold: number;
  /** Minimum user star rating counting as "rated highly". Default 4 — see "Old Friend". */
  oldFriendMinUserRating: number;
  /** Maximum user star rating counting as "rated poorly". Default 2 — see "Second Chance". */
  secondChanceMaxPoorRating: number;
  /** How many of the user's most recent watched films to treat as "recent watch history". Default 10 — see "Decade Detox". */
  recentWatchHistoryWindow: number;
  /** The user's own rating counting as a "5-star watch". Default 5 — see "Five-Star Echo". */
  fiveStarEchoMinUserRating: number;
  /** How many highly-rated watched films are needed before "established taste" is considered known. Default 5 — see "The Anti-Draft Lottery". */
  minHighRatedWatchesForTasteSignal: number;
  /** The user rating counting toward "established taste" for the anti-lottery's taste-similarity penalty. Default 4 — see "The Anti-Draft Lottery". */
  establishedTasteMinUserRating: number;
  /** A watchlist addition younger than this many days counts as "recently added". Default 30 — see "The Anti-Draft Lottery". */
  antiLotteryRecentAdditionDays: number;
  /** Ticket penalty for a recently-added film. Default 2 — see "The Anti-Draft Lottery". */
  antiLotteryRecentAdditionPenalty: number;
  /** Ticket penalty for a film matching established taste. Default 2 — see "The Anti-Draft Lottery". */
  antiLotteryTasteSimilarityPenalty: number;
}

export const DEFAULT_CHALLENGE_ENGINE_CONFIG: ChallengeEngineConfig = {
  featureLengthMinutesThreshold: 40,
  oldFriendMinUserRating: 4,
  secondChanceMaxPoorRating: 2,
  recentWatchHistoryWindow: 10,
  fiveStarEchoMinUserRating: 5,
  minHighRatedWatchesForTasteSignal: 5,
  establishedTasteMinUserRating: 4,
  antiLotteryRecentAdditionDays: 30,
  antiLotteryRecentAdditionPenalty: 2,
  antiLotteryTasteSimilarityPenalty: 2,
};

/**
 * A film the user has watched, as the challenge engine sees it — independent
 * of current watchlist membership (see docs/product-spec.md, "Finish the
 * Job", "New Blood", "Old Friend", "Second Chance", "Genre Collision",
 * "Finish What You Started", "Decade Detox", "Five-Star Echo"). Like
 * `ChallengeCandidateFilm`, every enrichable field is nullable rather than
 * invented when unavailable.
 */
export interface ChallengeWatchedFilmRecord {
  filmId: string;
  directors: string[] | null;
  genres: string[] | null;
  releaseYear: number | null;
  collectionId: string | null;
  /** The user's own star rating for this film (distinct from `averageRating`, the external/community rating). */
  userRating: number | null;
  /** ISO calendar date the film was watched, or null when only "watched at some point" is known. */
  watchedAt: string | null;
}

/** Challenge-specific choices from "Choose My Challenge" (see docs/product-spec.md, "Choose My Challenge" and "Genre Roulette"). Optional fields are extended as more challenges gain manual-selection support. */
export interface ChallengeManualSelections {
  /** A user-picked genre for Genre Roulette, overriding its normal random-genre step. */
  genre?: string;
  /**
   * Films the user has pre-picked for the "Pick Your Own" (DIY) challenge
   * (see docs/updates, v1.1.1, "DIY Challenge Film"), one
   * `watchlistEntryId` per potential DIY slot — consumed in order as DIY
   * slots are filled (whether chosen deliberately via "Choose My
   * Challenge", or drawn by chance under "Decide My Challenge For Me"),
   * so two slots never land on the same pre-picked film. An empty/absent
   * list simply means DIY is never eligible this draft — it never falls
   * back to picking a film on its own.
   */
  diyFilmEntryIds?: string[];
}

/**
 * Everything a challenge needs to evaluate eligibility and pick a film.
 * Randomness is always injected via `rng` (never Math.random() directly)
 * so challenge behaviour is deterministically testable.
 */
export interface ChallengeContext {
  rng: Rng;
  now: Date;
  /** Currently eligible pool: active watchlist films not yet used elsewhere in this draft. */
  candidates: ChallengeCandidateFilm[];
  /** Films already placed in this draft so far, oldest first. */
  previousPicks: ChallengeCandidateFilm[];
  /** The user's watch history, independent of current watchlist membership. Empty when unavailable, never fabricated. */
  watchedFilms: ChallengeWatchedFilmRecord[];
  config: ChallengeEngineConfig;
  manualSelections?: ChallengeManualSelections;
  /**
   * The full, franchise-ordering-UNRESTRICTED DIY-eligible candidate pool
   * (see docs/updates, v1.1.2, "Fix DIY Draft missing watchlist films") —
   * consulted ONLY by the "diy" challenge (`families/meta.ts`) when
   * resolving `manualSelections.diyFilmEntryIds`, instead of `candidates`.
   * `candidates` may have already excluded a later sequel the user
   * deliberately picked, since the franchise-ordering rule that governs it
   * is meant to constrain the engine's own automatic picks, never a film
   * the user chose by hand. Undefined when no "diy" selection is possible
   * this draft (e.g. tests, or a draft with no diy slots) — the "diy"
   * challenge falls back to `candidates` in that case.
   */
  diyEligibleCandidates?: ChallengeCandidateFilm[];
}

export type ChallengeResult =
  | {
      status: "success";
      film: ChallengeCandidateFilm;
      /** Structured, challenge-specific values to render, e.g. { targetMinutes: 137 } for Minute Match. */
      displayValue?: Record<string, unknown>;
    }
  | {
      status: "ineligible";
      /** Machine-readable reason code, e.g. "no_films_rating_gte_4". */
      reason: string;
    }
  | {
      status: "requires_user_choice";
      /** Identifies which interactive flow the UI should resume (e.g. "battle-royale"). */
      interactionId: string;
      payload: unknown;
    }
  | {
      status: "failure";
      reason: string;
    };

export interface ChallengeDefinition {
  id: string;
  name: string;
  description: string;
  category: ChallengeCategory;
  requiredCapabilities: DataCapability[];
  interactive: boolean;
  /**
   * Cheap, side-effect-free pre-check: does this challenge have any chance of
   * producing a result given the current pool/context? Used to gray out
   * "Choose My Challenge" options and to filter the pool for "Decide For Me"
   * before spending an rng draw. Must not consume `context.rng`.
   */
  isEligible(context: ChallengeContext): boolean;
  /**
   * Attempts to produce a film. May still return `ineligible`/`failure` even
   * when `isEligible` returned true (e.g. a candidate pool that looked
   * promising in aggregate but fails a more specific check) — callers must
   * handle rerolling to another challenge, not assume success.
   */
  attempt(context: ChallengeContext): ChallengeResult;
}
