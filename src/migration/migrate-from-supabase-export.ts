import type { Clock } from "@/domain/time/clock";
import { SystemClock } from "@/domain/time/clock";
import type { Repositories } from "@/repositories";
import type {
  DraftItemRecord,
  DraftPostmortemResponseRecord,
  DraftRecord,
  FilmMetadataRecord,
  FilmRecord,
  SelectionWeightAdjustmentRecord,
  UserRatingRecord,
  WatchedHistoryRecord,
  WatchlistEntryRecord,
} from "@/repositories/records";
import type { SupabaseExportData } from "./supabase-export-types";

export interface MigrateFromSupabaseExportResult {
  profileId: string;
  filmsImported: number;
  watchlistEntriesImported: number;
  draftsImported: number;
}

/**
 * One-time migration of a Supabase export (see `supabase-export-types.ts`
 * and `scripts/export-supabase-data.ts`) into the local database (see
 * docs/product-spec.md, "MIGRATION OF EXISTING DATA", Prompt 9.5A).
 *
 * The exported Supabase `user_id` becomes the new local profile's id
 * directly, rather than generating a fresh one and remapping every foreign
 * key — see docs/product-spec.md, "LOCAL PROFILES REPLACE REMOTE ACCOUNTS":
 * "Keep IDs stable because they will be required for backup/export." Every
 * other exported id (films, entries, drafts, ...) is preserved unchanged
 * for the same reason, so the relationships in the export data remain
 * valid without a separate id-remapping pass.
 *
 * Intended to run once, into a brand-new profile. Calling it twice for the
 * same export would raise on the second call — `ProfileRepository.create`
 * and the other repositories' `add`-style writes are not upserts — which is
 * the correct behaviour for a one-time migration (silently double-importing
 * would be worse than failing loudly).
 */
export async function migrateFromSupabaseExport(
  repos: Repositories,
  exportData: SupabaseExportData,
  deps: { clock?: Clock; currentSchemaVersion: number },
): Promise<MigrateFromSupabaseExportResult> {
  const clock = deps.clock ?? new SystemClock();
  const profileId = exportData.profile.id;

  await repos.profiles.create({
    id: profileId,
    displayName: exportData.profile.display_name ?? "Imported profile",
    createdAt: exportData.profile.created_at,
    lastOpenedAt: clock.now().toISOString(),
    timezone: exportData.profile.timezone,
    settings: { reducedMotion: false },
    dataVersion: deps.currentSchemaVersion,
  });

  for (const film of exportData.films) {
    const record: FilmRecord = {
      id: film.id,
      title: film.title,
      releaseYear: film.release_year,
      letterboxdSlug: film.letterboxd_slug,
      letterboxdUri: film.letterboxd_uri,
      createdAt: film.created_at,
      updatedAt: film.updated_at,
    };
    await repos.films.create(record);
  }

  for (const metadata of exportData.film_metadata) {
    const record: FilmMetadataRecord = {
      id: metadata.id,
      filmId: metadata.film_id,
      provider: metadata.provider,
      posterUrl: metadata.poster_url,
      runtimeMinutes: metadata.runtime_minutes,
      genres: metadata.genres,
      directors: metadata.directors,
      countries: metadata.countries,
      languages: metadata.languages,
      collectionId: metadata.collection_id,
      collectionName: metadata.collection_name,
      collectionOrder: metadata.collection_order,
      averageRating: metadata.average_rating,
      popularity: metadata.popularity,
      watchCount: metadata.watch_count,
      fansCount: metadata.fans_count,
      listAppearances: metadata.list_appearances,
      externalIds: metadata.external_ids,
      raw: metadata.raw,
      lastEnrichedAt: metadata.last_enriched_at,
      createdAt: metadata.created_at,
      updatedAt: metadata.updated_at,
    };
    await repos.films.upsertMetadata(record);
  }

  for (const entry of exportData.watchlist_entries) {
    const record: WatchlistEntryRecord = {
      id: entry.id,
      profileId,
      filmId: entry.film_id,
      dateAdded: entry.date_added,
      position: entry.position,
      isActive: entry.is_active,
      selectionWeight: entry.selection_weight,
      importSource: entry.import_source as WatchlistEntryRecord["importSource"],
      importId: entry.import_id,
      removedAt: entry.removed_at,
      removedReason:
        entry.removed_reason as WatchlistEntryRecord["removedReason"],
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    };
    await repos.watchlist.createEntry(record);
  }

  for (const history of exportData.watched_history) {
    const record: WatchedHistoryRecord = {
      id: history.id,
      profileId,
      filmId: history.film_id,
      watchlistEntryId: history.watchlist_entry_id,
      source: history.source as WatchedHistoryRecord["source"],
      watchedDate: history.watched_date,
      createdAt: history.created_at,
    };
    await repos.history.addWatchedHistory(record);
  }

  for (const rating of exportData.user_ratings) {
    const record: UserRatingRecord = {
      id: rating.id,
      profileId,
      filmId: rating.film_id,
      rating: rating.rating,
      source: rating.source,
      ratedAt: rating.rated_at,
      createdAt: rating.created_at,
      updatedAt: rating.updated_at,
    };
    await repos.history.upsertRating(record);
  }

  for (const draft of exportData.drafts) {
    const record: DraftRecord = {
      id: draft.id,
      profileId,
      difficulty: draft.difficulty as DraftRecord["difficulty"],
      timeMode: draft.time_mode as DraftRecord["timeMode"],
      status: draft.status as DraftRecord["status"],
      totalFilms: draft.total_films,
      randomFilmCount: draft.random_film_count,
      challengeFilmCount: draft.challenge_film_count,
      challengeMode: draft.challenge_mode as DraftRecord["challengeMode"],
      startedAt: draft.started_at,
      deadlineAt: draft.deadline_at,
      timezone: draft.timezone,
      completedAt: draft.completed_at,
      freeformAchievedRank:
        draft.freeform_achieved_rank as DraftRecord["freeformAchievedRank"],
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
    };
    await repos.drafts.createDraft(record);
  }

  for (const item of exportData.draft_items) {
    const record: DraftItemRecord = {
      id: item.id,
      draftId: item.draft_id,
      filmId: item.film_id,
      watchlistEntryId: item.watchlist_entry_id,
      source: item.source as DraftItemRecord["source"],
      challengeId: item.challenge_id,
      challengeAttemptId: null,
      challengeDisplayValue: item.challenge_display_value,
      orderIndex: item.order_index,
      isCompleted: item.is_completed,
      completedAt: item.completed_at,
      watchedHistoryId: item.watched_history_id,
      createdAt: item.created_at,
    };
    await repos.drafts.createItems([record]);
  }

  for (const response of exportData.draft_postmortem_responses) {
    const record: DraftPostmortemResponseRecord = {
      id: response.id,
      draftId: response.draft_id,
      draftItemId: response.draft_item_id,
      response: response.response as DraftPostmortemResponseRecord["response"],
      appliedAt: response.applied_at,
      createdAt: response.created_at,
    };
    await repos.history.addPostmortemResponse(record);
  }

  for (const adjustment of exportData.selection_weight_adjustments) {
    const record: SelectionWeightAdjustmentRecord = {
      id: adjustment.id,
      watchlistEntryId: adjustment.watchlist_entry_id,
      draftPostmortemResponseId: adjustment.draft_postmortem_response_id,
      delta: adjustment.delta,
      reason: adjustment.reason,
      createdAt: adjustment.created_at,
    };
    await repos.history.addSelectionWeightAdjustment(record);
  }

  return {
    profileId,
    filmsImported: exportData.films.length,
    watchlistEntriesImported: exportData.watchlist_entries.length,
    draftsImported: exportData.drafts.length,
  };
}
