import type { DataCapability } from "@/domain/shared/data-capability";
import {
  FilmMetadataAmbiguousError,
  FilmMetadataProviderError,
  type FilmMetadataCandidateDetail,
  type FilmMetadataLookupInput,
  type FilmMetadataProvider,
  type FilmMetadataResult,
} from "@/domain/import/film-metadata-provider";
import {
  pickBestMatch,
  rankCandidates,
  scoreCandidate,
  type FilmMetadataSearchCandidate,
  type ScoredFilmMetadataCandidate,
} from "@/domain/import/film-metadata-matching";
import {
  logMetadataResolution,
  type MetadataLogCandidate,
} from "@/domain/import/metadata-debug-log";

/**
 * A concrete, working FilmMetadataProvider backed by The Movie Database
 * (TMDB)'s public API — a legitimate, authorized data source (a free API
 * key + attribution, not scraping) that covers most of the fields
 * docs/product-spec.md asks for. It intentionally does NOT claim to
 * support Letterboxd-specific community metrics (watch/fan/list counts):
 * TMDB simply doesn't have those, and inventing them would violate "never
 * invent missing data".
 *
 * `averageRating` is TMDB's own community vote average (0-10), linearly
 * rescaled to this app's 0-5 star convention — a unit conversion of real
 * data, not a fabrication, but it is NOT Letterboxd's average rating and
 * should be understood as an approximation until an authorized Letterboxd
 * data source exists.
 *
 * MATCHING (see docs/product-spec.md's metadata-matching bugfix entry for
 * the full root-cause writeup): search deliberately does NOT pass TMDB's
 * own `year`/`primary_release_year` search parameter. That parameter
 * filters strictly against TMDB's own `primary_release_date` year and, in
 * real-world use, returns ZERO results for plenty of films whose
 * Letterboxd-reported year doesn't match TMDB's exactly — a film with a
 * festival premiere the year before its wide release, a home-video vs.
 * theatrical release date, or a plain disagreement between the two
 * catalogs. This was the actual cause of imports reporting "No match" for
 * films that genuinely exist on TMDB. The fix: search broadly, then rank
 * and filter the resulting candidates in `film-metadata-matching.ts`,
 * where "close enough" can actually be expressed with a tolerance instead
 * of an all-or-nothing filter.
 */

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const MAX_FETCH_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

export const TMDB_SUPPORTED_CAPABILITIES: readonly DataCapability[] = [
  "runtime",
  "genres",
  "directors",
  "countries",
  "languages",
  "collection",
  "average_rating",
  "popularity",
];

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  popularity?: number;
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

interface TmdbCrewMember {
  job: string;
  name: string;
}

interface TmdbMovieDetails {
  id: number;
  imdb_id: string | null;
  runtime: number | null;
  poster_path: string | null;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  spoken_languages: { iso_639_1: string; english_name: string }[];
  belongs_to_collection: { id: number; name: string } | null;
  vote_average: number;
  popularity: number;
  credits?: { crew: TmdbCrewMember[] };
}

export interface TmdbProviderOptions {
  apiKey: string;
  /** Injectable for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for testing retry/backoff without real delays. */
  sleepImpl?: (ms: number) => Promise<void>;
}

function emptyToNull<T>(values: T[]): T[] | null {
  return values.length > 0 ? values : null;
}

/** `"2017-04-26"` -> `2017`. `undefined`/empty (upcoming or unknown release) -> `null`, never invented. */
function parseReleaseYear(releaseDate: string | undefined): number | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

const MAX_LOGGED_CANDIDATES = 10;

/** Scores and sorts candidates purely for the dev-mode log trail — see docs/product-spec.md, "METADATA DEBUGGING". Capped so a wildly popular title's search doesn't dump hundreds of lines to the console. */
function toLogCandidates<TId>(
  candidates: FilmMetadataSearchCandidate<TId>[],
  input: { title: string; releaseYear: number | null },
): MetadataLogCandidate[] {
  const scored: ScoredFilmMetadataCandidate<TId>[] = candidates
    .map((candidate) => scoreCandidate(candidate, input))
    .sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, MAX_LOGGED_CANDIDATES).map((s) => ({
    title: s.candidate.title,
    year: s.candidate.releaseYear,
    score: Math.round(s.confidence * 100) / 100,
  }));
}

function retryAfterMsFromHeader(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export function createTmdbProvider({
  apiKey,
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: TmdbProviderOptions): FilmMetadataProvider {
  /**
   * Wraps one TMDB HTTP call with retry/backoff for exactly the two
   * transient cases worth retrying (see docs/product-spec.md's
   * "RATE LIMITING" bugfix section): a 429 (respecting `Retry-After` when
   * TMDB sends one, exponential backoff otherwise) and a 5xx (TMDB's own
   * outage, retried once — hammering a real outage helps no one). Every
   * other non-ok status (401 bad key, 404, ...) is permanent and fails on
   * the first attempt.
   */
  async function fetchWithRetry(url: string): Promise<Response> {
    let lastResponse: Response | undefined;
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      const response = await fetchImpl(url);
      if (response.ok) {
        return response;
      }
      lastResponse = response;
      const isRateLimited = response.status === 429;
      const isTransientServerError = response.status >= 500;
      if (!isRateLimited && !isTransientServerError) {
        break;
      }
      if (attempt === MAX_FETCH_ATTEMPTS) {
        break;
      }
      const delay =
        retryAfterMsFromHeader(response) ??
        DEFAULT_RETRY_DELAY_MS * 2 ** (attempt - 1);
      await sleepImpl(delay);
    }
    // lastResponse is always assigned here: the loop only exits via
    // `return` (success) or after assigning it on a non-ok response.
    const response = lastResponse!;
    if (response.status === 429) {
      throw new FilmMetadataProviderError(
        "TMDB rate limit exceeded",
        "rate-limited",
        429,
        retryAfterMsFromHeader(response),
      );
    }
    throw new FilmMetadataProviderError(
      `TMDB request failed with status ${response.status}`,
      "provider-error",
      response.status,
    );
  }

  async function searchMovie(
    input: FilmMetadataLookupInput,
  ): Promise<TmdbSearchResult[]> {
    // Deliberately no `year`/`primary_release_year` param — see the module
    // doc comment above for why that filter is the actual root cause this
    // provider used to always report "no match".
    const params = new URLSearchParams({
      api_key: apiKey,
      query: input.title,
      include_adult: "false",
    });
    const response = await fetchWithRetry(
      `${TMDB_API_BASE}/search/movie?${params.toString()}`,
    );
    const data = (await response.json()) as TmdbSearchResponse;
    return data.results;
  }

  async function fetchDetails(tmdbId: number): Promise<TmdbMovieDetails> {
    const params = new URLSearchParams({
      api_key: apiKey,
      append_to_response: "credits",
    });
    const response = await fetchWithRetry(
      `${TMDB_API_BASE}/movie/${tmdbId}?${params.toString()}`,
    );
    return (await response.json()) as TmdbMovieDetails;
  }

  /** Shared by `lookup()` (automatic match) and `search()` (manual candidates) — identical mapping either way, since a manually-chosen candidate should persist exactly what an automatic match on the same film would have. */
  function mapDetailsToResult(details: TmdbMovieDetails): FilmMetadataResult {
    const directors = (details.credits?.crew ?? [])
      .filter((member) => member.job === "Director")
      .map((member) => member.name);

    return {
      posterUrl: details.poster_path
        ? `${TMDB_IMAGE_BASE}${details.poster_path}`
        : null,
      runtimeMinutes: details.runtime ?? null,
      genres: emptyToNull(details.genres.map((genre) => genre.name)),
      directors: emptyToNull(directors),
      countries: emptyToNull(
        details.production_countries.map((country) => country.name),
      ),
      languages: emptyToNull(
        details.spoken_languages.map((language) => language.english_name),
      ),
      collectionId: details.belongs_to_collection
        ? String(details.belongs_to_collection.id)
        : null,
      collectionName: details.belongs_to_collection?.name ?? null,
      // TMDB's collection endpoint doesn't expose a canonical release-order
      // index on the movie details response itself.
      collectionOrder: null,
      averageRating:
        details.vote_average > 0
          ? Math.round((details.vote_average / 2) * 100) / 100
          : null,
      popularity: details.popularity,
      // Letterboxd-specific community metrics TMDB does not have — never invented.
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: {
        tmdb: String(details.id),
        ...(details.imdb_id ? { imdb: details.imdb_id } : {}),
      },
      raw: details,
    };
  }

  return {
    id: "tmdb",
    supportedCapabilities: TMDB_SUPPORTED_CAPABILITIES,
    async search(
      query: string,
      releaseYear: number | null,
    ): Promise<FilmMetadataCandidateDetail[]> {
      if (!query || query.trim().length === 0) {
        logMetadataResolution({
          importedTitle: query,
          decision: "failed",
          reason: "missing_import_title",
        });
        throw new FilmMetadataProviderError(
          "A film title is required to search TMDB",
          "invalid-import-data",
        );
      }

      const searchResults = await searchMovie({ title: query, releaseYear });
      const candidates: FilmMetadataSearchCandidate<number>[] =
        searchResults.map((result) => ({
          id: result.id,
          title: result.title,
          originalTitle: result.original_title,
          releaseYear: parseReleaseYear(result.release_date),
          popularity: result.popularity ?? null,
        }));

      const matchInput = { title: query, releaseYear };
      logMetadataResolution({
        importedTitle: query,
        importedYear: releaseYear,
        candidates: toLogCandidates(candidates, matchInput),
        decision: "manual-search",
        providerId: "tmdb",
      });

      const ranked = rankCandidates(candidates, matchInput);
      if (ranked.length === 0) {
        return [];
      }

      // Bounded (at most 5) and sequential rather than Promise.all — this
      // is a manual, human-initiated action, not the bulk queue, so there's
      // no throughput pressure, and sequential calls are simpler to reason
      // about under TMDB's per-second rate limit than a burst of 5 at once.
      const details: FilmMetadataCandidateDetail[] = [];
      for (const scored of ranked) {
        const movie = await fetchDetails(scored.candidate.id);
        details.push({
          providerId: "tmdb",
          externalId: String(scored.candidate.id),
          title: scored.candidate.title,
          releaseYear: scored.candidate.releaseYear,
          confidence: scored.confidence,
          result: mapDetailsToResult(movie),
        });
      }
      return details;
    },
    async lookup(input): Promise<FilmMetadataResult | null> {
      if (!input.title || input.title.trim().length === 0) {
        logMetadataResolution({
          importedTitle: input.title ?? "",
          importedYear: input.releaseYear,
          decision: "failed",
          reason: "missing_import_title",
        });
        throw new FilmMetadataProviderError(
          "A film title is required to search TMDB",
          "invalid-import-data",
        );
      }

      const searchResults = await searchMovie(input);
      const candidates: FilmMetadataSearchCandidate<number>[] =
        searchResults.map((result) => ({
          id: result.id,
          title: result.title,
          originalTitle: result.original_title,
          releaseYear: parseReleaseYear(result.release_date),
          popularity: result.popularity ?? null,
        }));

      const matchInput = {
        title: input.title,
        releaseYear: input.releaseYear ?? null,
      };
      const matchResult = pickBestMatch(candidates, matchInput);
      const logCandidates = toLogCandidates(candidates, matchInput);

      if (matchResult.status === "not-found") {
        logMetadataResolution({
          importedTitle: input.title,
          importedYear: input.releaseYear,
          candidates: logCandidates,
          decision: "unresolved",
          providerId: "tmdb",
          reason: matchResult.reason,
        });
        return null;
      }

      if (matchResult.status === "ambiguous") {
        logMetadataResolution({
          importedTitle: input.title,
          importedYear: input.releaseYear,
          candidates: logCandidates,
          decision: "unresolved",
          providerId: "tmdb",
          reason: "multiple_high_confidence_candidates",
        });
        throw new FilmMetadataAmbiguousError(
          matchResult.candidates.map((scored) => ({
            title: scored.candidate.title,
            releaseYear: scored.candidate.releaseYear,
            confidence: scored.confidence,
          })),
        );
      }

      const { candidate } = matchResult;
      const details = await fetchDetails(candidate.id);

      logMetadataResolution({
        importedTitle: input.title,
        importedYear: input.releaseYear,
        candidates: logCandidates,
        decision: "matched",
        providerId: String(candidate.id),
      });

      return mapDetailsToResult(details);
    },
  };
}
