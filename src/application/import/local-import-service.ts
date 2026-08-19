import { parseDiaryCsv } from "@/domain/import/diary-csv";
import {
  computeFilmKey,
  extractLetterboxdSlug,
  type FilmIdentity,
} from "@/domain/import/film-key";
import {
  planWatchlistImport,
  type ExistingFilmRef,
  type ExistingWatchlistEntryRef,
} from "@/domain/import/plan";
import { parseRatingsCsv } from "@/domain/import/ratings-csv";
import { parseWatchedCsv } from "@/domain/import/watched-csv";
import { parseWatchlistCsv } from "@/domain/import/watchlist-csv";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type {
  FilmRecord,
  UserRatingRecord,
  WatchedHistoryRecord,
  WatchlistEntryRecord,
} from "@/repositories/records";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

export interface ImportLocalWatchlistFiles {
  watchlistCsv: string;
  ratingsCsv?: string | null;
  watchedCsv?: string | null;
  diaryCsv?: string | null;
}

export type ImportLocalWatchlistOutcome =
  | {
      ok: true;
      importId: string;
      filmsImported: number;
      filmsUpdated: number;
      duplicatesSkipped: number;
      /** Rows whose film was already marked watched in FDraft and so were deliberately NOT reactivated — see `determineAction`'s `"skip_already_watched"` guard in `domain/import/plan.ts`. */
      alreadyWatchedSkipped: number;
      unresolvedCount: number;
      /** Every film this import touched (watchlist + ratings + watched + diary), for the immediate post-import metadata status ("1,050 cached, 154 awaiting download" — see `getImportMetadataStatus`). */
      filmIds: string[];
    }
  | { ok: false; error: string };

function toIdentity(row: {
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
}): FilmIdentity {
  return {
    title: row.title,
    releaseYear: row.releaseYear,
    letterboxdUri: row.letterboxdUri,
  };
}

/**
 * Local, fully offline port of `src/lib/import/run-watchlist-import.ts` (see
 * docs/product-spec.md, "LETTERBOXD IMPORT", "FULL OFFLINE CORE
 * FUNCTIONALITY" — Prompt 9.5B). Parsing (`parseWatchlistCsv`,
 * `parseRatingsCsv`, `parseWatchedCsv`, `parseDiaryCsv`, `planWatchlistImport`)
 * is the exact same pure domain code the old Supabase path used — none of
 * it ever assumed a server, so none of it needed to change. What's
 * different from that old path, deliberately:
 *
 *  - No metadata enrichment happens here at all (see docs/product-spec.md,
 *    "METADATA BEHAVIOUR" — "Do NOT block the watchlist import"). Films
 *    are stored immediately, unenriched; `getImportMetadataStatus` reports
 *    how many already happen to be cached from a previous import versus
 *    awaiting a deliberate "Download Missing Metadata" — see
 *    `local-metadata-service.ts`.
 *  - Runs entirely against local repositories — no network request of any
 *    kind, so this genuinely cannot "upload the user's import to a remote
 *    server" (see docs/product-spec.md, "FULL OFFLINE CORE
 *    FUNCTIONALITY").
 */
export async function importLocalWatchlistCsv(
  repos: {
    films: FilmRepository;
    watchlist: WatchlistRepository;
    history: HistoryRepository;
  },
  params: {
    profileId: string;
    rawFilename: string | null;
    source?: "csv" | "zip";
  } & ImportLocalWatchlistFiles,
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<ImportLocalWatchlistOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const now = clock.now().toISOString();
  const source = params.source ?? "csv";

  const watchlistParse = parseWatchlistCsv(
    params.watchlistCsv,
    now.slice(0, 10),
  );
  if (!watchlistParse.ok) {
    return { ok: false, error: watchlistParse.reason };
  }
  const ratingsParse = params.ratingsCsv
    ? parseRatingsCsv(params.ratingsCsv)
    : null;
  const watchedParse = params.watchedCsv
    ? parseWatchedCsv(params.watchedCsv)
    : null;
  const diaryParse = params.diaryCsv ? parseDiaryCsv(params.diaryCsv) : null;

  // Resolve (or create) every film ANY of the provided files touches, in
  // one pass — a film can appear in ratings.csv without being on the
  // current watchlist at all (e.g. already watched and removed).
  const identities: FilmIdentity[] = watchlistParse.rows.map(toIdentity);
  if (ratingsParse?.ok) identities.push(...ratingsParse.rows.map(toIdentity));
  if (watchedParse?.ok) identities.push(...watchedParse.rows.map(toIdentity));
  if (diaryParse?.ok) identities.push(...diaryParse.rows.map(toIdentity));

  const filmKeyToId = new Map<string, string>();
  const existingFilms: ExistingFilmRef[] = [];
  const seenKeys = new Set<string>();
  for (const identity of identities) {
    const filmKey = computeFilmKey(identity);
    if (seenKeys.has(filmKey)) continue;
    seenKeys.add(filmKey);
    const existing = await findExistingFilm(repos.films, identity);
    if (existing) {
      filmKeyToId.set(filmKey, existing.id);
      existingFilms.push({ filmId: existing.id, filmKey });
    }
  }

  async function resolveFilmId(identity: FilmIdentity): Promise<string> {
    const filmKey = computeFilmKey(identity);
    const existingId = filmKeyToId.get(filmKey);
    if (existingId) return existingId;
    const film: FilmRecord = {
      id: idGenerator.generate(),
      title: identity.title,
      releaseYear: identity.releaseYear,
      letterboxdSlug: extractLetterboxdSlug(identity.letterboxdUri),
      letterboxdUri: identity.letterboxdUri,
      createdAt: now,
      updatedAt: now,
    };
    await repos.films.create(film);
    filmKeyToId.set(filmKey, film.id);
    return film.id;
  }

  const allEntries = await repos.watchlist.listAllEntries(params.profileId);
  const existingEntries: ExistingWatchlistEntryRef[] = allEntries.map(
    (entry) => ({
      filmId: entry.filmId,
      entryId: entry.id,
      isActive: entry.isActive,
      position: entry.position,
      dateAdded: entry.dateAdded,
      removedReason: entry.removedReason,
    }),
  );

  const plan = planWatchlistImport({
    parsedRows: watchlistParse.rows,
    existingFilms,
    existingEntries,
  });

  const importId = idGenerator.generate();
  let filmsImported = 0;
  let filmsUpdated = 0;
  let alreadyWatchedSkipped = 0;
  const touchedFilmIds = new Set<string>();

  for (const planRow of plan.rows) {
    if (
      planRow.action === "no_change" ||
      planRow.action === "skip_already_watched"
    ) {
      const filmId = filmKeyToId.get(planRow.filmKey) ?? planRow.existingFilmId;
      if (filmId) touchedFilmIds.add(filmId);
      if (planRow.action === "skip_already_watched") alreadyWatchedSkipped++;
      continue;
    }

    const filmId = await resolveFilmId(toIdentity(planRow.row));
    touchedFilmIds.add(filmId);

    if (
      planRow.action === "create_film_and_entry" ||
      planRow.action === "create_entry_for_existing_film"
    ) {
      const entry: WatchlistEntryRecord = {
        id: idGenerator.generate(),
        profileId: params.profileId,
        filmId,
        dateAdded: planRow.row.dateAdded,
        position: planRow.position,
        isActive: true,
        selectionWeight: 1,
        importSource: source,
        importId,
        removedAt: null,
        removedReason: null,
        createdAt: now,
        updatedAt: now,
      };
      await repos.watchlist.createEntry(entry);
      filmsImported++;
    } else if (
      planRow.action === "update_entry" ||
      planRow.action === "reactivate_entry"
    ) {
      const existingEntryId = planRow.existingEntryId;
      if (!existingEntryId) continue;
      const existingEntry = allEntries.find(
        (entry) => entry.id === existingEntryId,
      );
      if (!existingEntry) continue;
      await repos.watchlist.updateEntry({
        ...existingEntry,
        dateAdded: planRow.row.dateAdded,
        position: planRow.position,
        isActive: true,
        removedAt: null,
        removedReason: null,
        importSource: source,
        importId,
        updatedAt: now,
      });
      filmsUpdated++;
    }
  }

  if (ratingsParse?.ok) {
    for (const row of ratingsParse.rows) {
      const filmId = await resolveFilmId(toIdentity(row));
      touchedFilmIds.add(filmId);
      const rating: UserRatingRecord = {
        id: idGenerator.generate(),
        profileId: params.profileId,
        filmId,
        rating: row.rating,
        source: "letterboxd_ratings_csv",
        ratedAt: row.ratedAt,
        createdAt: now,
        updatedAt: now,
      };
      await repos.history.upsertRating(rating);
    }
  }

  async function importHistoryRows(
    rows: {
      title: string;
      releaseYear: number | null;
      letterboxdUri: string | null;
      watchedDate: string | null;
    }[],
    historySource: WatchedHistoryRecord["source"],
  ): Promise<void> {
    for (const row of rows) {
      const filmId = await resolveFilmId(toIdentity(row));
      touchedFilmIds.add(filmId);
      const record: WatchedHistoryRecord = {
        id: idGenerator.generate(),
        profileId: params.profileId,
        filmId,
        watchlistEntryId: null,
        source: historySource,
        watchedDate: row.watchedDate,
        createdAt: now,
      };
      await repos.history.addWatchedHistory(record);
    }
  }

  if (watchedParse?.ok) {
    await importHistoryRows(watchedParse.rows, "import_watched");
  }
  if (diaryParse?.ok) {
    await importHistoryRows(diaryParse.rows, "import_diary");
  }

  const unresolvedCount =
    watchlistParse.unresolvedRows.length +
    (ratingsParse?.ok ? ratingsParse.unresolvedRows.length : 0) +
    (watchedParse?.ok ? watchedParse.unresolvedRows.length : 0) +
    (diaryParse?.ok ? diaryParse.unresolvedRows.length : 0);

  await repos.watchlist.createImport({
    id: importId,
    profileId: params.profileId,
    source,
    status: "completed",
    rawFilename: params.rawFilename,
    filmsImported,
    filmsUpdated,
    duplicatesSkipped: plan.duplicateRowCount,
    enrichmentFailures: 0,
    unresolvedCount,
    errorMessage: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
  });

  return {
    ok: true,
    importId,
    filmsImported,
    filmsUpdated,
    duplicatesSkipped: plan.duplicateRowCount,
    alreadyWatchedSkipped,
    unresolvedCount,
    filmIds: [...touchedFilmIds],
  };
}

async function findExistingFilm(
  films: FilmRepository,
  identity: {
    title: string;
    releaseYear: number | null;
    letterboxdUri: string | null;
  },
): Promise<FilmRecord | null> {
  const slug = extractLetterboxdSlug(identity.letterboxdUri);
  if (slug) {
    return films.findByLetterboxdSlug(slug);
  }
  return films.findByTitleAndYear(identity.title, identity.releaseYear);
}
