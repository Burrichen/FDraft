import { computeFilmKey } from "./film-key";
import type { ParsedWatchlistRow } from "./watchlist-csv";
import type { WatchlistRemovalReason } from "@/repositories/records";

/**
 * Pure diffing logic behind idempotent watchlist imports (see
 * docs/product-spec.md, "Letterboxd Import" — "An import should be
 * idempotent where possible" / "upsert films rather than duplicating them").
 * Takes plain snapshots of existing state so it's fully unit-testable
 * without a database; the orchestration layer (src/lib/import) is
 * responsible for loading those snapshots and applying the resulting plan.
 */

export interface ExistingFilmRef {
  filmId: string;
  /** Precomputed with the same computeFilmKey() logic used for parsed rows. */
  filmKey: string;
}

export interface ExistingWatchlistEntryRef {
  filmId: string;
  entryId: string;
  isActive: boolean;
  position: number | null;
  dateAdded: string;
  /**
   * Why this entry is currently inactive — `null` for an active entry. A
   * re-import must not silently put a film back on the active watchlist
   * just because the user's external export still lists it (see
   * docs/updates, v1.1.1, "Centralise DIY recommendation eligibility" —
   * this was the root cause of an already-watched film reappearing in
   * DIY recommendations): see `determineAction`'s `"watched"` guard below.
   */
  removedReason: WatchlistRemovalReason | null;
}

export type WatchlistImportRowAction =
  | "create_film_and_entry"
  | "create_entry_for_existing_film"
  | "reactivate_entry"
  | "skip_already_watched"
  | "update_entry"
  | "no_change";

export interface WatchlistImportPlanRow {
  row: ParsedWatchlistRow;
  filmKey: string;
  /** 0-based ordinal among this import's deduplicated rows, in file order. */
  position: number;
  action: WatchlistImportRowAction;
  existingFilmId: string | null;
  existingEntryId: string | null;
}

export interface WatchlistImportPlan {
  rows: WatchlistImportPlanRow[];
  /** Rows skipped because an earlier row in the same file already resolved to the same film. */
  duplicateRowCount: number;
}

export interface PlanWatchlistImportInput {
  parsedRows: ParsedWatchlistRow[];
  /** The full global film catalog matching any of this import's film keys. */
  existingFilms: ExistingFilmRef[];
  /** This user's current watchlist entries (active AND inactive) for those films. */
  existingEntries: ExistingWatchlistEntryRef[];
}

export function planWatchlistImport({
  parsedRows,
  existingFilms,
  existingEntries,
}: PlanWatchlistImportInput): WatchlistImportPlan {
  const filmsByKey = new Map(existingFilms.map((film) => [film.filmKey, film]));
  const entriesByFilmId = new Map(
    existingEntries.map((entry) => [entry.filmId, entry]),
  );

  const seenKeys = new Set<string>();
  const rows: WatchlistImportPlanRow[] = [];
  let duplicateRowCount = 0;
  let position = 0;

  for (const row of parsedRows) {
    const filmKey = computeFilmKey(row);
    if (seenKeys.has(filmKey)) {
      duplicateRowCount++;
      continue;
    }
    seenKeys.add(filmKey);

    const existingFilm = filmsByKey.get(filmKey) ?? null;
    const existingEntry = existingFilm
      ? (entriesByFilmId.get(existingFilm.filmId) ?? null)
      : null;

    rows.push({
      row,
      filmKey,
      position,
      action: determineAction({
        row,
        existingEntry,
        position,
        hasExistingFilm: existingFilm !== null,
      }),
      existingFilmId: existingFilm?.filmId ?? null,
      existingEntryId: existingEntry?.entryId ?? null,
    });
    position++;
  }

  return { rows, duplicateRowCount };
}

function determineAction({
  row,
  existingEntry,
  position,
  hasExistingFilm,
}: {
  row: ParsedWatchlistRow;
  existingEntry: ExistingWatchlistEntryRef | null;
  position: number;
  hasExistingFilm: boolean;
}): WatchlistImportRowAction {
  if (!hasExistingFilm) {
    return "create_film_and_entry";
  }
  if (!existingEntry) {
    return "create_entry_for_existing_film";
  }
  if (!existingEntry.isActive) {
    // A film already marked watched inside FDraft must stay watched — an
    // external export still listing it (stale, or never removed there)
    // must not silently undo that. `"manual"`/`"postmortem_not_interested"`
    // removals are a deliberate FDraft-side decision the user may well
    // want undone by a fresh import, so only `"watched"` is guarded here.
    if (existingEntry.removedReason === "watched") {
      return "skip_already_watched";
    }
    return "reactivate_entry";
  }
  const unchanged =
    existingEntry.position === position &&
    existingEntry.dateAdded === row.dateAdded;
  return unchanged ? "no_change" : "update_entry";
}
