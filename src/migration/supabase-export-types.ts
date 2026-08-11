/**
 * The shape of a one-time export of one user's data out of a Supabase
 * project running this app's pre-9.5B schema — see docs/product-spec.md,
 * "MIGRATION OF EXISTING DATA" (Prompt 9.5A). The Supabase backend itself
 * was removed from this repository in Prompt 9.5B (see "REMOVE
 * UNNECESSARY REMOTE INFRASTRUCTURE"); this type and
 * `scripts/export-supabase-data.ts` remain because anyone who ran an
 * earlier version of this app against a real Supabase project still needs
 * a way to bring that data into their new local profile. Produced by
 * `scripts/export-supabase-data.ts`, consumed by `migrateFromSupabaseExport`.
 *
 * Deliberately snake_case, matching that old schema's Postgres row shapes
 * exactly — this file's only job is to describe what comes out of the
 * export script, not to be a clean domain type.
 * `migrateFromSupabaseExport` is where the translation into local
 * `Repositories` records happens.
 *
 * `draft_challenge_attempts` and `draft_challenge_interactions` are
 * deliberately NOT part of this export: attempts are an append-only debug
 * log with no bearing on a profile's actual state, and an in-progress
 * interactive challenge (Battle Royale/Three Doors) has no meaningful way
 * to resume after a storage-engine migration — the affected draft would
 * simply have that one challenge slot come through unfilled, which is
 * already a state the app understands (see docs/product-spec.md,
 * "CHALLENGE ARCHITECTURE" — a challenge slot can go unfulfilled).
 */
export interface SupabaseExportData {
  exportedAt: string;
  profile: {
    id: string;
    display_name: string | null;
    timezone: string;
    created_at: string;
  };
  films: {
    id: string;
    title: string;
    release_year: number | null;
    letterboxd_slug: string | null;
    letterboxd_uri: string | null;
    created_at: string;
    updated_at: string;
  }[];
  film_metadata: {
    id: string;
    film_id: string;
    provider: string;
    poster_url: string | null;
    runtime_minutes: number | null;
    genres: string[] | null;
    directors: string[] | null;
    countries: string[] | null;
    languages: string[] | null;
    collection_id: string | null;
    collection_name: string | null;
    collection_order: number | null;
    average_rating: number | null;
    popularity: number | null;
    watch_count: number | null;
    fans_count: number | null;
    list_appearances: number | null;
    external_ids: Record<string, unknown> | null;
    raw: Record<string, unknown> | null;
    last_enriched_at: string;
    created_at: string;
    updated_at: string;
  }[];
  watchlist_entries: {
    id: string;
    film_id: string;
    date_added: string;
    position: number | null;
    is_active: boolean;
    selection_weight: number;
    import_source: string | null;
    import_id: string | null;
    removed_at: string | null;
    removed_reason: string | null;
    created_at: string;
    updated_at: string;
  }[];
  watched_history: {
    id: string;
    film_id: string;
    watchlist_entry_id: string | null;
    source: string;
    watched_date: string | null;
    created_at: string;
  }[];
  user_ratings: {
    id: string;
    film_id: string;
    rating: number;
    source: string;
    rated_at: string | null;
    created_at: string;
    updated_at: string;
  }[];
  drafts: {
    id: string;
    difficulty: string;
    time_mode: string;
    status: string;
    total_films: number;
    random_film_count: number;
    challenge_film_count: number;
    challenge_mode: string | null;
    started_at: string;
    deadline_at: string;
    timezone: string;
    completed_at: string | null;
    freeform_achieved_rank: string | null;
    created_at: string;
    updated_at: string;
  }[];
  draft_items: {
    id: string;
    draft_id: string;
    film_id: string;
    watchlist_entry_id: string | null;
    source: string;
    challenge_id: string | null;
    challenge_display_value: Record<string, unknown> | null;
    order_index: number;
    is_completed: boolean;
    completed_at: string | null;
    watched_history_id: string | null;
    created_at: string;
  }[];
  draft_postmortem_responses: {
    id: string;
    draft_id: string;
    draft_item_id: string;
    response: string;
    applied_at: string;
    created_at: string;
  }[];
  selection_weight_adjustments: {
    id: string;
    watchlist_entry_id: string;
    draft_postmortem_response_id: string | null;
    delta: number;
    reason: string;
    created_at: string;
  }[];
}
