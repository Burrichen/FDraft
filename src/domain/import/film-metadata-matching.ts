import { titleSimilarity } from "./title-normalization";

/**
 * Provider-agnostic candidate scoring and selection — the piece that was
 * genuinely missing from the metadata pipeline before this fix (see
 * docs/product-spec.md's metadata-matching bugfix entry). Any provider
 * that can produce a list of candidate films (title, original title,
 * release year) can hand them to `pickBestMatch` instead of blindly
 * trusting its own search engine's first result, which is what
 * `tmdb-provider.ts` used to do — TMDB's `/search/movie?year=` parameter
 * is a strict filter against its own `primary_release_date` year and
 * empirically returns zero results for plenty of real films whose
 * Letterboxd-reported year doesn't match TMDB's exactly (festival vs.
 * theatrical vs. home-video release dates, or plain data disagreements
 * between the two catalogs) — so the fix is to search broadly (no year
 * filter) and rank/filter candidates here instead, where "close enough"
 * can actually be expressed.
 *
 * MATCHING RULE (see docs/product-spec.md, "YEAR MATCHING" section of the
 * bugfix prompt this module answers):
 *   - exact normalized-title match + exact year match -> confidence 1.0
 *   - title similarity and year both factor into a single 0..1 confidence
 *     score; an exact year match contributes fully, one year off
 *     contributes partially (festival/regional/theatrical release date
 *     drift is common and should not reject an otherwise-excellent title
 *     match), two years off contributes very little, and anything larger
 *     contributes nothing — the title match alone has to carry the full
 *     `MATCH_CONFIDENCE_THRESHOLD` bar at that point, which only an
 *     exact or near-exact title clears.
 *   - when the import itself has no usable year at all, the decision rests
 *     on title similarity alone, not stretched by a fabricated "neutral"
 *     year score in either direction.
 *   - when the import HAS a year but a specific candidate simply doesn't
 *     report one, that candidate is discounted more heavily than the
 *     no-import-year case — an unverifiable candidate must never outrank
 *     one whose year is actually known to be close (discovered against
 *     real TMDB data, where duplicate/obscure entries with no release date
 *     were otherwise beating the correct one-year-off match).
 *   - two or more candidates landing within `AMBIGUOUS_CONFIDENCE_MARGIN`
 *     of each other at or above the threshold is reported as `ambiguous`
 *     rather than silently picking whichever came first — the thing the
 *     old TMDB provider did (`results[0]`) that this module replaces.
 */

export interface FilmMetadataSearchCandidate<TId = string> {
  id: TId;
  title: string;
  originalTitle?: string | null;
  releaseYear: number | null;
  /** Used only to break near-ties among candidates that are otherwise indistinguishable by title/year evidence — never allowed to outweigh title/year evidence itself. */
  popularity?: number | null;
}

export interface ScoredFilmMetadataCandidate<TId = string> {
  candidate: FilmMetadataSearchCandidate<TId>;
  titleSimilarity: number;
  yearConfidence: number;
  confidence: number;
}

export type FilmMetadataMatchResult<TId = string> =
  | {
      status: "matched";
      candidate: FilmMetadataSearchCandidate<TId>;
      confidence: number;
    }
  | { status: "ambiguous"; candidates: ScoredFilmMetadataCandidate<TId>[] }
  | { status: "not-found" };

/** Below this combined confidence, a candidate is not considered a real match at all — see the module doc comment for how title/year combine into it. */
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;

/** Two viable candidates within this much of each other's confidence are "equally plausible" rather than one being clearly better. */
export const AMBIGUOUS_CONFIDENCE_MARGIN = 0.08;

/**
 * `1` for an exact year match; a graduated partial score for a small gap
 * (allowing for festival/regional/theatrical/database-inconsistency
 * drift, per docs/product-spec.md's "YEAR MATCHING" rule); `0` once the
 * gap is large enough that only strong title evidence should carry a
 * match. `null` on either side (year genuinely unknown) is deliberately
 * NOT scored as a guessed middle value here — callers combine this with
 * title similarity only when both years are actually known; see
 * `scoreCandidate`.
 */
export function yearConfidence(
  candidateYear: number | null,
  importYear: number | null,
): number {
  if (importYear === null || candidateYear === null) {
    return 0;
  }
  const diff = Math.abs(candidateYear - importYear);
  if (diff === 0) return 1;
  if (diff === 1) return 0.7;
  if (diff === 2) return 0.3;
  return 0;
}

function combinedConfidence(
  titleSim: number,
  yearConf: number,
  hasImportYear: boolean,
  hasCandidateYear: boolean,
): number {
  if (!hasImportYear) {
    // The import itself gives us no year to check against — rest entirely
    // on the title, with a small discount versus a year-confirmed match of
    // the same title similarity, since there's strictly less evidence.
    return titleSim * 0.9;
  }
  if (!hasCandidateYear) {
    // The import DOES have a year, but this particular candidate just
    // doesn't report one (e.g. an obscure/duplicate provider entry with no
    // release date). Discovered live against real TMDB data: "Parasite"
    // (import year 2018, actual 2019) returned two same-titled candidates
    // with no release date at confidence 0.9, which beat the real film's
    // correctly-penalized one-year-off score of 0.865 — a spurious,
    // unverifiable candidate must never outrank a candidate whose year is
    // actually close, so this gets a bigger discount than the
    // no-import-year case, not the same generous one.
    return titleSim * 0.65;
  }
  // Weighted evenly enough that a *known*, badly-wrong year (yearConfidence
  // 0 — see its own doc comment) pulls even a perfect title match below
  // `MATCH_CONFIDENCE_THRESHOLD` ("It" the 1990 miniseries must not match
  // an import asking for "It" the 2017 film) — see docs/product-spec.md's
  // "YEAR MATCHING" rule: "larger discrepancy = require stronger evidence
  // / reject". A one-year gap (yearConfidence 0.7) still clears the bar
  // comfortably; only a *known*, larger gap rejects.
  return titleSim * 0.55 + yearConf * 0.45;
}

export function scoreCandidate<TId>(
  candidate: FilmMetadataSearchCandidate<TId>,
  input: { title: string; releaseYear: number | null },
): ScoredFilmMetadataCandidate<TId> {
  const titleSim = Math.max(
    titleSimilarity(input.title, candidate.title),
    candidate.originalTitle
      ? titleSimilarity(input.title, candidate.originalTitle)
      : 0,
  );
  const yConf = yearConfidence(candidate.releaseYear, input.releaseYear);
  return {
    candidate,
    titleSimilarity: titleSim,
    yearConfidence: yConf,
    confidence: combinedConfidence(
      titleSim,
      yConf,
      input.releaseYear !== null,
      candidate.releaseYear !== null,
    ),
  };
}

/**
 * Ranks every candidate a provider's search returned and decides whether
 * one of them is confidently THE film, several are plausible enough that
 * guessing would be irresponsible, or none of them really are it. Never
 * picks "whichever came first" — see the module doc comment.
 */
export function pickBestMatch<TId>(
  candidates: FilmMetadataSearchCandidate<TId>[],
  input: { title: string; releaseYear: number | null },
): FilmMetadataMatchResult<TId> {
  if (candidates.length === 0) {
    return { status: "not-found" };
  }

  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, input))
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        (b.candidate.popularity ?? 0) - (a.candidate.popularity ?? 0),
    );

  const viable = scored.filter(
    (s) => s.confidence >= MATCH_CONFIDENCE_THRESHOLD,
  );
  if (viable.length === 0) {
    return { status: "not-found" };
  }

  const [best, runnerUp] = viable;
  if (
    runnerUp &&
    best.confidence - runnerUp.confidence < AMBIGUOUS_CONFIDENCE_MARGIN
  ) {
    return { status: "ambiguous", candidates: viable.slice(0, 5) };
  }
  return {
    status: "matched",
    candidate: best.candidate,
    confidence: best.confidence,
  };
}
