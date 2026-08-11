import { afterEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { migrateFromSupabaseExport } from "./migrate-from-supabase-export";
import type { SupabaseExportData } from "./supabase-export-types";

function minimalExport(
  overrides: Partial<SupabaseExportData> = {},
): SupabaseExportData {
  return {
    exportedAt: "2026-06-01T00:00:00.000Z",
    profile: {
      id: "user-123",
      display_name: "Alex",
      timezone: "Europe/London",
      created_at: "2025-01-01T00:00:00.000Z",
    },
    films: [],
    film_metadata: [],
    watchlist_entries: [],
    watched_history: [],
    user_ratings: [],
    drafts: [],
    draft_items: [],
    draft_postmortem_responses: [],
    selection_weight_adjustments: [],
    ...overrides,
  };
}

describe("migrateFromSupabaseExport", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("creates a local profile using the original Supabase user id, preserving stable IDs", async () => {
    db = new FDraftLocalDatabase(`migrate-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await migrateFromSupabaseExport(repos, minimalExport(), {
      currentSchemaVersion: 1,
    });
    expect(result.profileId).toBe("user-123");

    const profile = await repos.profiles.getById("user-123");
    expect(profile).toMatchObject({
      id: "user-123",
      displayName: "Alex",
      timezone: "Europe/London",
      dataVersion: 1,
    });
  });

  it("migrates films, watchlist entries, watched history, drafts, and postmortem responses with relationships intact", async () => {
    db = new FDraftLocalDatabase(`migrate-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const exportData = minimalExport({
      films: [
        {
          id: "film-1",
          title: "Paddington 2",
          release_year: 2017,
          letterboxd_slug: "paddington-2",
          letterboxd_uri: "https://letterboxd.com/film/paddington-2/",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      watchlist_entries: [
        {
          id: "entry-1",
          film_id: "film-1",
          date_added: "2025-01-02",
          position: 0,
          is_active: false,
          selection_weight: 1,
          import_source: "csv",
          import_id: null,
          removed_at: "2025-06-01T00:00:00.000Z",
          removed_reason: "watched",
          created_at: "2025-01-02T00:00:00.000Z",
          updated_at: "2025-06-01T00:00:00.000Z",
        },
      ],
      watched_history: [
        {
          id: "history-1",
          film_id: "film-1",
          watchlist_entry_id: "entry-1",
          source: "app_watchlist_action",
          watched_date: "2025-06-01",
          created_at: "2025-06-01T00:00:00.000Z",
        },
      ],
      drafts: [
        {
          id: "draft-1",
          difficulty: "baby",
          time_mode: "timer",
          status: "archived",
          total_films: 1,
          random_film_count: 1,
          challenge_film_count: 0,
          challenge_mode: null,
          started_at: "2025-05-01T00:00:00.000Z",
          deadline_at: "2025-05-31T00:00:00.000Z",
          timezone: "UTC",
          completed_at: "2025-06-01T00:00:00.000Z",
          freeform_achieved_rank: null,
          created_at: "2025-05-01T00:00:00.000Z",
          updated_at: "2025-06-01T00:00:00.000Z",
        },
      ],
      draft_items: [
        {
          id: "item-1",
          draft_id: "draft-1",
          film_id: "film-1",
          watchlist_entry_id: "entry-1",
          source: "random",
          challenge_id: null,
          challenge_display_value: null,
          order_index: 0,
          is_completed: true,
          completed_at: "2025-06-01T00:00:00.000Z",
          watched_history_id: "history-1",
          created_at: "2025-05-01T00:00:00.000Z",
        },
      ],
    });

    const result = await migrateFromSupabaseExport(repos, exportData, {
      currentSchemaVersion: 1,
    });
    expect(result).toEqual({
      profileId: "user-123",
      filmsImported: 1,
      watchlistEntriesImported: 1,
      draftsImported: 1,
    });

    const film = await repos.films.getById("film-1");
    expect(film?.title).toBe("Paddington 2");

    const entry = await repos.watchlist.getEntryById("user-123", "entry-1");
    expect(entry?.isActive).toBe(false);
    expect(entry?.removedReason).toBe("watched");

    const history = await repos.history.listWatchedHistory("user-123");
    expect(history).toHaveLength(1);
    expect(history[0].watchlistEntryId).toBe("entry-1");

    const archived = await repos.drafts.listArchived("user-123");
    expect(archived).toHaveLength(1);
    const items = await repos.drafts.listItemsForDraft("draft-1");
    expect(items[0]).toMatchObject({
      isCompleted: true,
      watchedHistoryId: "history-1",
    });
  });

  it("migrated data is fully isolated under its new profile id — no leakage to an unrelated profile", async () => {
    db = new FDraftLocalDatabase(`migrate-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await migrateFromSupabaseExport(repos, minimalExport(), {
      currentSchemaVersion: 1,
    });

    expect(
      await repos.watchlist.listAllEntries("some-other-profile"),
    ).toHaveLength(0);
    expect(await repos.profiles.getById("some-other-profile")).toBeNull();
  });
});
