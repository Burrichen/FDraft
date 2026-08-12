import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { FilmRepository } from "@/repositories/film-repository";
import type { FilmMetadataRecord, FilmRecord } from "@/repositories/records";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";
import {
  fetchFilmMetadataViaApi,
  MetadataNetworkError,
  type RemoteMetadataLookupResult,
} from "./remote-metadata-client";

/**
 * The local half of the architecture docs/product-spec.md draws out under
 * "METADATA BEHAVIOUR" (Prompt 9.5B):
 *
 *   Letterboxd Export -> Local Parser -> Local Watchlist -> Metadata Queue
 *   -> External Metadata Provider -> Local Metadata Cache
 *
 * Nothing here runs automatically. Import never calls this (see
 * `local-import-service.ts` — it stores films immediately and leaves them
 * unenriched); challenges and stats never call this either (they only ever
 * read whatever's already in `FilmRepository`, per
 * `local-fetch-context.ts`/`merge-local-film-metadata.ts`, both unchanged
 * by this phase). The only callers are the explicit "Download Missing
 * Metadata"/"Refresh Old Metadata"/"Retry Unresolved" actions on the
 * Settings page.
 */

export const DEFAULT_OLD_METADATA_THRESHOLD_DAYS = 90;

export interface MetadataStatusSummary {
  totalFilms: number;
  filmsCached: number;
  missingMetadata: number;
  oldMetadata: number;
}

interface FilmClassification {
  missing: FilmRecord[];
  old: FilmRecord[];
  cachedCount: number;
}

async function classifyActiveWatchlistFilms(
  repos: { watchlist: WatchlistRepository; films: FilmRepository },
  profileId: string,
  deps: { clock: Clock; oldThresholdDays: number },
): Promise<FilmClassification> {
  const entries = await repos.watchlist.listActiveEntries(profileId);
  const filmIds = [...new Set(entries.map((entry) => entry.filmId))];
  const metadataByFilm = await repos.films.getMetadataForFilms(filmIds);
  const now = deps.clock.now().getTime();
  const thresholdMs = deps.oldThresholdDays * 24 * 60 * 60 * 1000;

  const missing: FilmRecord[] = [];
  const old: FilmRecord[] = [];
  let cachedCount = 0;

  for (const filmId of filmIds) {
    const records = metadataByFilm.get(filmId) ?? [];
    if (records.length === 0) {
      const film = await repos.films.getById(filmId);
      if (film) missing.push(film);
      continue;
    }
    cachedCount++;
    const newestEnrichedAt = Math.max(
      ...records.map((r) => new Date(r.lastEnrichedAt).getTime()),
    );
    if (now - newestEnrichedAt > thresholdMs) {
      const film = await repos.films.getById(filmId);
      if (film) old.push(film);
    }
  }

  return { missing, old, cachedCount };
}

/** Powers the Settings page's "METADATA" section (cached/missing/old counts) — see docs/product-spec.md, "METADATA REFRESH". */
export async function getMetadataStatusSummary(
  repos: { watchlist: WatchlistRepository; films: FilmRepository },
  profileId: string,
  deps: { clock?: Clock; oldThresholdDays?: number } = {},
): Promise<MetadataStatusSummary> {
  const clock = deps.clock ?? new SystemClock();
  const oldThresholdDays =
    deps.oldThresholdDays ?? DEFAULT_OLD_METADATA_THRESHOLD_DAYS;
  const entries = await repos.watchlist.listActiveEntries(profileId);
  const totalFilms = new Set(entries.map((entry) => entry.filmId)).size;
  const { missing, old, cachedCount } = await classifyActiveWatchlistFilms(
    repos,
    profileId,
    {
      clock,
      oldThresholdDays,
    },
  );
  return {
    totalFilms,
    filmsCached: cachedCount,
    missingMetadata: missing.length,
    oldMetadata: old.length,
  };
}

/**
 * Right after an import completes — "Imported: 1,204 films / Metadata:
 * 1,050 cached, 154 awaiting download" (see docs/product-spec.md,
 * "METADATA BEHAVIOUR"). Only considers the given films (this import's
 * films), not the whole watchlist, and never distinguishes "old" here —
 * a film that already had metadata from a previous import is simply
 * "cached", staleness is a Settings-page concern.
 */
export async function getImportMetadataStatus(
  repos: { films: FilmRepository },
  filmIds: string[],
): Promise<{ cached: number; awaitingDownload: number }> {
  const uniqueIds = [...new Set(filmIds)];
  const metadataByFilm = await repos.films.getMetadataForFilms(uniqueIds);
  let cached = 0;
  for (const filmId of uniqueIds) {
    if ((metadataByFilm.get(filmId) ?? []).length > 0) cached++;
  }
  return { cached, awaitingDownload: uniqueIds.length - cached };
}

/**
 * The per-film outcome tally for one download/refresh/retry run (see
 * docs/product-spec.md's metadata-matching bugfix, "METADATA DOWNLOAD UX":
 * "Metadata update complete / Matched: 1,188 / Already cached: 6 /
 * Unresolved: 7 / Failed: 3"). "Already cached" isn't tracked here — it's
 * simply never in `targets` to begin with (see `classifyActiveWatchlistFilms`);
 * the UI reads it from `getMetadataStatusSummary` instead.
 */
export interface MetadataDownloadOutcome {
  attempted: number;
  /** A confident match, persisted. */
  matched: number;
  /** The provider found several equally-plausible candidates and declined to guess — see `FilmMetadataAmbiguousError`. Retryable. */
  ambiguous: number;
  /** The provider genuinely has nothing for this film. Retryable (a later provider update might resolve it), but never retried automatically forever. */
  notFound: number;
  /** A transport/provider-side failure (rate-limited, provider outage, or an unexpected network error). Retryable. */
  failed: number;
  /** How many of `failed` were specifically a 429 from the provider — surfaced separately since "wait and retry" is the right advice, not "something is broken". */
  rateLimited: number;
  /** True when every attempted lookup failed with a network error — the "you're probably offline" signal the UI uses for its message. */
  likelyOffline: boolean;
  /** True when the run stopped immediately because no metadata provider is configured at all (see docs/product-spec.md's "not-configured" status) — `attempted` stays 0 in that case, since nothing was actually tried. */
  providerNotConfigured: boolean;
  /** Film ids from `ambiguous`, `notFound`, and `failed` — exactly what a "Retry Unresolved" action should target. */
  retryableFilmIds: string[];
}

/** Reported as each film's lookup resolves — lets the UI show live progress ("147 / 1,204 · Matched: 141 · Unresolved: 3 · Failed: 3") without polling. Called synchronously from within the same in-flight download call, so it survives ordinary component re-renders as long as the caller's state setter identity does (a plain `useState` setter always does). */
export interface MetadataDownloadProgress {
  completed: number;
  total: number;
  matched: number;
  /** `ambiguous + notFound` so far — the UI's single "Unresolved" bucket, per docs/product-spec.md's "METADATA DOWNLOAD UX" example summary. */
  unresolved: number;
  failed: number;
}
export type MetadataDownloadProgressListener = (
  progress: MetadataDownloadProgress,
) => void;

const DOWNLOAD_CONCURRENCY = 4;

function emptyOutcome(): MetadataDownloadOutcome {
  return {
    attempted: 0,
    matched: 0,
    ambiguous: 0,
    notFound: 0,
    failed: 0,
    rateLimited: 0,
    likelyOffline: false,
    providerNotConfigured: false,
    retryableFilmIds: [],
  };
}

<<<<<<< Updated upstream
=======
/** Human-readable, per-reason explanation shown on the Unresolved Metadata screen (see docs/product-spec.md, "UNRESOLVED METADATA RESOLUTION"). */
const UNRESOLVED_REASON_MESSAGES: Record<string, string> = {
  ambiguous: "Could not confidently choose between multiple results.",
  "not-found": "No confident match was found for this title.",
  "rate-limited": "The metadata provider rate-limited this request.",
  "provider-error": "The metadata provider returned an unexpected error.",
  "invalid-api-key":
    "The metadata provider rejected the configured API key (401) — check TMDB_API_KEY in your environment configuration.",
  "invalid-import-data":
    "This film's imported data could not be sent to the metadata provider.",
  "network-error": "Could not reach the metadata provider.",
  "unexpected-error":
    "An unexpected error occurred while saving this film's metadata.",
};

function buildUnresolvedRecord(
  film: FilmRecord,
  providerId: string,
  status: UnresolvedMetadataRecord["status"],
  reason: string,
  now: string,
  idGenerator: IdGenerator,
): UnresolvedMetadataRecord {
  return {
    // `LocalUnresolvedMetadataRepository.upsert` preserves an existing
    // row's real id when one already exists for this filmId — this one
    // is only ever actually used the first time.
    id: idGenerator.generate(),
    filmId: film.id,
    provider: providerId,
    status,
    reason,
    message: UNRESOLVED_REASON_MESSAGES[reason] ?? "This film needs review.",
    lastAttemptedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

>>>>>>> Stashed changes
async function downloadForFilms(
  repos: { films: FilmRepository },
  targets: FilmRecord[],
  deps: {
    fetchMetadata: (input: {
      letterboxdSlug?: string | null;
      letterboxdUri?: string | null;
      title: string;
      releaseYear?: number | null;
    }) => Promise<RemoteMetadataLookupResult>;
    idGenerator: IdGenerator;
    clock: Clock;
    onProgress?: MetadataDownloadProgressListener;
  },
): Promise<MetadataDownloadOutcome> {
  if (targets.length === 0) {
    return emptyOutcome();
  }

  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;
  let failed = 0;
  let rateLimited = 0;
  let networkFailures = 0;
  let providerNotConfigured = false;
  let stopped = false;
  let completed = 0;
  const retryableFilmIds: string[] = [];
  const total = targets.length;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length && !stopped) {
      const film = targets[cursor++];
      try {
        const outcome = await deps.fetchMetadata({
          letterboxdSlug: film.letterboxdSlug,
          letterboxdUri: film.letterboxdUri,
          title: film.title,
          releaseYear: film.releaseYear,
        });

        switch (outcome.status) {
          case "not-configured": {
            providerNotConfigured = true;
            stopped = true;
            break;
          }
          case "matched": {
            const now = deps.clock.now().toISOString();
            const record: FilmMetadataRecord = {
              id: deps.idGenerator.generate(),
              filmId: film.id,
              provider: outcome.providerId,
              posterUrl: outcome.result.posterUrl ?? null,
              runtimeMinutes: outcome.result.runtimeMinutes ?? null,
              genres: outcome.result.genres ?? null,
              directors: outcome.result.directors ?? null,
              countries: outcome.result.countries ?? null,
              languages: outcome.result.languages ?? null,
              collectionId: outcome.result.collectionId ?? null,
              collectionName: outcome.result.collectionName ?? null,
              collectionOrder: outcome.result.collectionOrder ?? null,
              averageRating: outcome.result.averageRating ?? null,
              popularity: outcome.result.popularity ?? null,
              watchCount: outcome.result.watchCount ?? null,
              fansCount: outcome.result.fansCount ?? null,
              listAppearances: outcome.result.listAppearances ?? null,
              externalIds: outcome.result.externalIds ?? null,
              raw:
                (outcome.result.raw as Record<string, unknown> | undefined) ??
                null,
              lastEnrichedAt: now,
              createdAt: now,
              updatedAt: now,
            };
            await repos.films.upsertMetadata(record);
<<<<<<< Updated upstream
=======
            // No longer unresolved/failed, if it ever was — e.g. a retry
            // that finally succeeded. Keyed by filmId alone (see
            // schema.ts version 3) so this clears the film's row
            // regardless of which provider label an earlier failed
            // attempt happened to record it under.
            await repos.unresolvedMetadata.deleteByFilmId(film.id);
>>>>>>> Stashed changes
            matched++;
            completed++;
            break;
          }
          case "not-found": {
            notFound++;
            completed++;
            retryableFilmIds.push(film.id);
            break;
          }
          case "ambiguous": {
            ambiguous++;
            completed++;
            retryableFilmIds.push(film.id);
            break;
          }
          case "rate-limited": {
            rateLimited++;
            failed++;
            completed++;
            retryableFilmIds.push(film.id);
            break;
          }
          case "provider-error":
          case "invalid-import-data": {
<<<<<<< Updated upstream
=======
            const now = deps.clock.now().toISOString();
            // A 401 means the configured API key itself was rejected — a
            // fundamentally different, actionable problem from a generic
            // provider error, and worth its own message rather than
            // collapsing every provider failure into one indistinguishable
            // "unexpected error" (see docs/product-spec.md, "COMPLETE
            // PRODUCT AUDIT").
            const reason =
              outcome.status === "provider-error" && outcome.httpStatus === 401
                ? "invalid-api-key"
                : outcome.status;
            await repos.unresolvedMetadata.upsert(
              buildUnresolvedRecord(
                film,
                "providerId" in outcome ? outcome.providerId : "unknown",
                "failed",
                reason,
                now,
                deps.idGenerator,
              ),
            );
>>>>>>> Stashed changes
            failed++;
            completed++;
            retryableFilmIds.push(film.id);
            break;
          }
        }
      } catch (cause) {
        failed++;
        completed++;
        retryableFilmIds.push(film.id);
        const isNetworkError = cause instanceof MetadataNetworkError;
        if (isNetworkError) {
          networkFailures++;
        }
<<<<<<< Updated upstream
=======
        // A genuine "can't reach the provider" is honestly labeled as
        // such; anything else (e.g. an IndexedDB write failing inside
        // the try block above) is NOT mislabeled as a network problem —
        // see docs/product-spec.md, "COMPLETE PRODUCT AUDIT".
        const reason = isNetworkError ? "network-error" : "unexpected-error";
        try {
          const now = deps.clock.now().toISOString();
          await repos.unresolvedMetadata.upsert(
            buildUnresolvedRecord(
              film,
              "unknown",
              "failed",
              reason,
              now,
              deps.idGenerator,
            ),
          );
        } catch {
          // Storage itself is failing — there's nothing left to record
          // this failure INTO. Swallow rather than let a secondary
          // failure here escape as an unhandled rejection from the
          // whole worker/Promise.all chain; the film is still counted
          // above and will simply be retried on the next run.
        }
>>>>>>> Stashed changes
      }
      deps.onProgress?.({
        completed,
        total,
        matched,
        unresolved: ambiguous + notFound,
        failed,
      });
    }
  }

  const workerCount = Math.min(DOWNLOAD_CONCURRENCY, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    attempted: matched + ambiguous + notFound + failed,
    matched,
    ambiguous,
    notFound,
    failed,
    rateLimited,
    // "Probably offline" only when NOTHING got through at all — a single
    // success alongside other failures means the network clearly works and
    // those other failures are something else (a per-film provider issue).
    likelyOffline:
      networkFailures > 0 &&
      matched === 0 &&
      notFound === 0 &&
      ambiguous === 0 &&
      networkFailures === failed,
    providerNotConfigured,
    retryableFilmIds,
  };
}

interface DownloadDeps {
  fetchMetadata?: typeof fetchFilmMetadataViaApi;
  idGenerator?: IdGenerator;
  clock?: Clock;
  oldThresholdDays?: number;
  onProgress?: MetadataDownloadProgressListener;
}

/** "Download Missing Metadata" — targets films with zero cached metadata. Never blocks on, or is blocked by, the watchlist import itself. */
export async function downloadMissingMetadata(
  repos: { watchlist: WatchlistRepository; films: FilmRepository },
  profileId: string,
  deps: DownloadDeps = {},
): Promise<MetadataDownloadOutcome> {
  const clock = deps.clock ?? new SystemClock();
  const { missing } = await classifyActiveWatchlistFilms(repos, profileId, {
    clock,
    oldThresholdDays:
      deps.oldThresholdDays ?? DEFAULT_OLD_METADATA_THRESHOLD_DAYS,
  });
  return downloadForFilms(repos, missing, {
    fetchMetadata: deps.fetchMetadata ?? fetchFilmMetadataViaApi,
    idGenerator: deps.idGenerator ?? defaultIdGenerator,
    clock,
    onProgress: deps.onProgress,
  });
}

/** "Refresh Old Metadata" — targets films whose cached metadata is older than the threshold. Never fires automatically on startup (see docs/product-spec.md: "Do not aggressively refresh every film on application startup"). */
export async function refreshOldMetadata(
  repos: { watchlist: WatchlistRepository; films: FilmRepository },
  profileId: string,
  deps: DownloadDeps = {},
): Promise<MetadataDownloadOutcome> {
  const clock = deps.clock ?? new SystemClock();
  const { old } = await classifyActiveWatchlistFilms(repos, profileId, {
    clock,
    oldThresholdDays:
      deps.oldThresholdDays ?? DEFAULT_OLD_METADATA_THRESHOLD_DAYS,
  });
  return downloadForFilms(repos, old, {
    fetchMetadata: deps.fetchMetadata ?? fetchFilmMetadataViaApi,
    idGenerator: deps.idGenerator ?? defaultIdGenerator,
    clock,
    onProgress: deps.onProgress,
  });
}

/** "Retry Unresolved" — re-attempts exactly the films a previous run couldn't resolve (see `MetadataDownloadOutcome.retryableFilmIds`), rather than re-scanning the whole watchlist. Films no longer in the local catalog (e.g. removed since) are silently skipped. */
export async function retryMetadataForFilms(
  repos: { films: FilmRepository },
  filmIds: string[],
  deps: {
    fetchMetadata?: typeof fetchFilmMetadataViaApi;
    idGenerator?: IdGenerator;
    clock?: Clock;
    onProgress?: MetadataDownloadProgressListener;
  } = {},
): Promise<MetadataDownloadOutcome> {
  const films = await Promise.all(filmIds.map((id) => repos.films.getById(id)));
  const targets = films.filter((film): film is FilmRecord => film !== null);
  return downloadForFilms(repos, targets, {
    fetchMetadata: deps.fetchMetadata ?? fetchFilmMetadataViaApi,
    idGenerator: deps.idGenerator ?? defaultIdGenerator,
    clock: deps.clock ?? new SystemClock(),
    onProgress: deps.onProgress,
  });
}
