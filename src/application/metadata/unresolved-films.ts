import type { FilmMetadataResult } from "@/domain/import/film-metadata-provider";
import { logMetadata } from "@/domain/import/metadata-debug-log";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { FilmRepository } from "@/repositories/film-repository";
import type {
  FilmMetadataRecord,
  MetadataResolutionStatus,
} from "@/repositories/records";
import type { UnresolvedMetadataRepository } from "@/repositories/unresolved-metadata-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

/**
 * One row on the Unresolved Metadata screen (see docs/product-spec.md,
 * "UNRESOLVED METADATA RESOLUTION"). Built entirely from persisted
 * records — `UnresolvedMetadataRecord` plus the shared `FilmRecord`
 * catalog row and (when the film is still on this profile's active
 * watchlist) its `dateAdded` — never inferred or guessed.
 */
export interface UnresolvedFilmView {
  filmId: string;
  provider: string;
  status: MetadataResolutionStatus;
  reason: string;
  message: string;
  lastAttemptedAt: string;
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  /** `null` when this film isn't (or is no longer) on this profile's active watchlist — "if useful" per the spec; simply omitted otherwise. */
  dateAdded: string | null;
}

export interface UnresolvedFilmsCount {
  unresolved: number;
  failed: number;
}

/** Lightweight persistent counts for the Settings page's "Metadata" card — see docs/product-spec.md, "UNRESOLVED METADATA RESOLUTION": clickable, and surviving reload, unlike the old run-scoped `lastOutcome` counts alone. */
export async function countUnresolvedFilms(repos: {
  unresolvedMetadata: UnresolvedMetadataRepository;
}): Promise<UnresolvedFilmsCount> {
  const records = await repos.unresolvedMetadata.listAll();
  let unresolved = 0;
  let failed = 0;
  for (const record of records) {
    if (record.status === "unresolved") unresolved++;
    else failed++;
  }
  return { unresolved, failed };
}

/**
 * Everything currently unresolved or failed, across the whole shared
 * catalog (see `UnresolvedMetadataRecord`'s own doc comment for why this
 * isn't profile-scoped), enriched with per-profile context
 * (`dateAdded`) where available. Newest attempt first, so the films most
 * recently touched by a download/refresh run surface at the top.
 */
export async function listUnresolvedFilms(
  repos: {
    unresolvedMetadata: UnresolvedMetadataRepository;
    films: FilmRepository;
    watchlist: WatchlistRepository;
  },
  profileId: string,
): Promise<UnresolvedFilmView[]> {
  const records = await repos.unresolvedMetadata.listAll();
  const sorted = [...records].sort((a, b) =>
    b.lastAttemptedAt.localeCompare(a.lastAttemptedAt),
  );

  return Promise.all(
    sorted.map(async (record) => {
      const [film, activeEntry] = await Promise.all([
        repos.films.getById(record.filmId),
        repos.watchlist.findActiveEntryByFilmId(profileId, record.filmId),
      ]);
      return {
        filmId: record.filmId,
        provider: record.provider,
        status: record.status,
        reason: record.reason,
        message: record.message,
        lastAttemptedAt: record.lastAttemptedAt,
        title: film?.title ?? "Untitled",
        releaseYear: film?.releaseYear ?? null,
        letterboxdUri: film?.letterboxdUri ?? null,
        dateAdded: activeEntry?.dateAdded ?? null,
      };
    }),
  );
}

/**
 * Thrown by `manuallyMatchFilm` when the chosen provider film is already
 * attached to a DIFFERENT local film — see docs/product-spec.md,
 * "METADATA MATCHER AUDIT": two imported films must never silently end
 * up mapped to the identical provider identity. The caller (the
 * Unresolved Metadata screen) surfaces this as an error rather than
 * proceeding, since guessing which of the two mappings is "correct"
 * isn't this function's call to make.
 */
export class ProviderIdentifierConflictError extends Error {
  constructor(readonly conflictingFilmId: string) {
    super(
      `This provider film is already matched to a different local film (${conflictingFilmId}).`,
    );
    this.name = "ProviderIdentifierConflictError";
  }
}

/**
 * "Use This Film" (see docs/product-spec.md, "UNRESOLVED METADATA
 * RESOLUTION", "MANUAL MATCH") — persists a user's deliberate choice from
 * the candidate list (or a manual search result), the same shape an
 * automatic match would have produced, EXCEPT `matchMethod: "manual"` so
 * a later routine refresh never silently overwrites it (see
 * `classifyActiveWatchlistFilms` in `local-metadata-service.ts`). Removes
 * the film from the Unresolved queue — never creates a duplicate
 * watchlist film, since this only ever writes `FilmMetadataRecord`
 * (keyed by the EXISTING `filmId`), never a new `FilmRecord`.
 *
 * Guards against `provider_identifier_conflict` (see
 * docs/product-spec.md, "METADATA MATCHER AUDIT") — refuses to attach a
 * provider film that's already the confirmed match for a DIFFERENT local
 * film, rather than silently creating two local films pointing at one
 * provider identity.
 */
export async function manuallyMatchFilm(
  repos: {
    films: FilmRepository;
    unresolvedMetadata: UnresolvedMetadataRepository;
  },
  params: {
    filmId: string;
    provider: string;
    title?: string;
    result: FilmMetadataResult;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<void> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const now = clock.now().toISOString();

  const externalId = params.result.externalIds?.[params.provider];
  if (externalId) {
    const conflicting = await repos.films.findMetadataByExternalId(
      params.provider,
      externalId,
    );
    if (conflicting && conflicting.filmId !== params.filmId) {
      logMetadata({
        film: params.title ?? params.filmId,
        selectedCandidate: externalId,
        status: "provider-error",
        reason: "provider_identifier_conflict",
      });
      throw new ProviderIdentifierConflictError(conflicting.filmId);
    }
  }

  const record: FilmMetadataRecord = {
    id: idGenerator.generate(),
    filmId: params.filmId,
    provider: params.provider,
    posterUrl: params.result.posterUrl ?? null,
    runtimeMinutes: params.result.runtimeMinutes ?? null,
    genres: params.result.genres ?? null,
    directors: params.result.directors ?? null,
    countries: params.result.countries ?? null,
    languages: params.result.languages ?? null,
    collectionId: params.result.collectionId ?? null,
    collectionName: params.result.collectionName ?? null,
    collectionOrder: params.result.collectionOrder ?? null,
    averageRating: params.result.averageRating ?? null,
    popularity: params.result.popularity ?? null,
    watchCount: params.result.watchCount ?? null,
    fansCount: params.result.fansCount ?? null,
    listAppearances: params.result.listAppearances ?? null,
    externalIds: params.result.externalIds ?? null,
    raw: (params.result.raw as Record<string, unknown> | undefined) ?? null,
    matchMethod: "manual",
    lastEnrichedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await repos.films.upsertMetadata(record);
  await repos.unresolvedMetadata.deleteByFilmId(params.filmId);
}
