import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { importLocalWatchlistCsv } from "@/application/import/local-import-service";
import { getImportMetadataStatus } from "@/application/metadata/local-metadata-service";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

const PROFILE_ID = "alex";

function csv(rows: string[]): string {
  return ["Date,Name,Year,Letterboxd URI", ...rows].join("\n");
}

describe("importLocalWatchlistCsv", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("imports a fresh watchlist: creates films and active entries", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "watchlist.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
        "2026-01-02,Inception,2010,https://letterboxd.com/film/inception/",
      ]),
    });

    expect(outcome).toEqual({
      ok: true,
      importId: expect.any(String),
      filmsImported: 2,
      filmsUpdated: 0,
      duplicatesSkipped: 0,
      alreadyWatchedSkipped: 0,
      filmsRemoved: 0,
      unresolvedCount: 0,
      filmIds: expect.any(Array),
    });

    const entries = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(entries).toHaveLength(2);
    const titles = await Promise.all(
      entries.map(async (e) => (await repos.films.getById(e.filmId))?.title),
    );
    expect(titles.sort()).toEqual(["Inception", "Paddington 2"]);
  });

  it("is idempotent-ish: re-importing the same CSV updates rather than duplicates", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const content = csv([
      "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
    ]);

    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: content,
    });
    const second = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      watchlistCsv: content,
    });

    // Same position/date -> "no_change", so the second import reports zero net changes.
    expect(second).toEqual({
      ok: true,
      importId: expect.any(String),
      filmsImported: 0,
      filmsUpdated: 0,
      duplicatesSkipped: 0,
      alreadyWatchedSkipped: 0,
      filmsRemoved: 0,
      unresolvedCount: 0,
      filmIds: expect.any(Array),
    });

    const films = await repos.watchlist.listAllEntries(PROFILE_ID);
    expect(films).toHaveLength(1); // never duplicated
  });

  it("reactivates a manually-removed entry instead of creating a duplicate", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const content = csv([
      "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
    ]);

    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: content,
    });
    const [entry] = await repos.watchlist.listActiveEntries(PROFILE_ID);
    await repos.watchlist.updateEntry({
      ...entry,
      isActive: false,
      removedAt: "2026-01-05T00:00:00.000Z",
      removedReason: "manual",
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      watchlistCsv: content,
    });
    expect(outcome.ok && outcome.filmsUpdated).toBe(1);

    const active = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(entry.id); // same entry, reactivated — not a new row
  });

  it("does NOT reactivate a film already marked watched — re-importing a stale export must not put it back on the watchlist", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const content = csv([
      "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
    ]);

    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: content,
    });
    const [entry] = await repos.watchlist.listActiveEntries(PROFILE_ID);
    await repos.watchlist.updateEntry({
      ...entry,
      isActive: false,
      removedAt: "2026-01-05T00:00:00.000Z",
      removedReason: "watched",
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      watchlistCsv: content,
    });
    expect(outcome.ok && outcome.filmsUpdated).toBe(0);
    expect(outcome.ok && outcome.alreadyWatchedSkipped).toBe(1);

    const active = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(active).toHaveLength(0); // still watched, not silently re-added
  });

  it("skips duplicate rows within the same file (same film twice)", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
        "2026-01-02,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
    });
    expect(outcome).toEqual({
      ok: true,
      importId: expect.any(String),
      filmsImported: 1,
      filmsUpdated: 0,
      duplicatesSkipped: 1,
      alreadyWatchedSkipped: 0,
      filmsRemoved: 0,
      unresolvedCount: 0,
      filmIds: expect.any(Array),
    });
  });

  it("returns a parse error for CSV missing required headers, without touching the repositories", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "bad.csv",
      watchlistCsv: "not,a,valid,header",
    });
    expect(outcome.ok).toBe(false);
    expect(await repos.watchlist.listAllEntries(PROFILE_ID)).toHaveLength(0);
  });

  it("keeps two profiles' imports of the same film catalog fully separate", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const content = csv([
      "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
    ]);

    await importLocalWatchlistCsv(repos, {
      profileId: "alex",
      rawFilename: "a.csv",
      watchlistCsv: content,
    });
    await importLocalWatchlistCsv(repos, {
      profileId: "sam",
      rawFilename: "a.csv",
      watchlistCsv: content,
    });

    // Same film record reused across profiles (it's a shared catalog)...
    const alexEntries = await repos.watchlist.listActiveEntries("alex");
    const samEntries = await repos.watchlist.listActiveEntries("sam");
    expect(alexEntries[0].filmId).toBe(samEntries[0].filmId);
    // ...but each profile's watchlist ENTRY is its own row.
    expect(alexEntries[0].id).not.toBe(samEntries[0].id);
    expect(alexEntries[0].profileId).toBe("alex");
    expect(samEntries[0].profileId).toBe("sam");
  });

  it("a full export ZIP's ratings/watched/diary files also import personal history, entirely offline", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "letterboxd-export.zip",
      source: "zip",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
      ratingsCsv: [
        "Date,Name,Year,Letterboxd URI,Rating",
        "2025-12-01,Inception,2010,https://letterboxd.com/film/inception/,4.5",
      ].join("\n"),
      watchedCsv: [
        "Date,Name,Year,Letterboxd URI",
        "2025-11-01,Inception,2010,https://letterboxd.com/film/inception/",
      ].join("\n"),
      diaryCsv: [
        "Date,Name,Year,Letterboxd URI,Rewatch,Watched Date",
        "2025-11-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/,No,2025-11-01",
      ].join("\n"),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.filmIds).toHaveLength(2); // Paddington 2 + Inception, deduped across all four files

    const ratings = await repos.history.listRatings(PROFILE_ID);
    expect(ratings).toHaveLength(1);
    expect(ratings[0].rating).toBe(4.5);

    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(history).toHaveLength(2); // one from watched.csv, one from diary.csv
    expect(history.map((h) => h.source).sort()).toEqual([
      "import_diary",
      "import_watched",
    ]);
  });

  it("reports which imported films are already cached vs awaiting metadata download", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    // Pre-existing film with cached metadata from an earlier import.
    await repos.films.create({
      id: "film-cached",
      title: "Cached Film",
      releaseYear: 2015,
      letterboxdSlug: "cached-film",
      letterboxdUri: "https://letterboxd.com/film/cached-film/",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.films.upsertMetadata({
      id: "meta-1",
      filmId: "film-cached",
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: 100,
      genres: null,
      directors: null,
      countries: null,
      languages: null,
      collectionId: null,
      collectionName: null,
      collectionOrder: null,
      averageRating: null,
      popularity: null,
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: null,
      raw: null,
      releaseDate: null,
      releaseStatus: null,
      providerTitle: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "watchlist.csv",
      watchlistCsv: csv([
        "2026-01-01,Cached Film,2015,https://letterboxd.com/film/cached-film/",
        "2026-01-02,Brand New Film,2020,https://letterboxd.com/film/brand-new-film/",
      ]),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const status = await getImportMetadataStatus(repos, outcome.filmIds);
    expect(status).toEqual({ cached: 1, awaitingDownload: 1 });
  });
});

describe("importLocalWatchlistCsv — mode: 'replace' (see docs/updates, v1.1.2, 'Re-import Letterboxd Watchlist')", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("deactivates an active entry whose film is absent from the new watchlist.csv", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
        "2026-01-02,Inception,2010,https://letterboxd.com/film/inception/",
      ]),
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      mode: "replace",
      // "Inception" removed from Letterboxd since the last export.
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
    });
    expect(outcome.ok && outcome.filmsRemoved).toBe(1);

    const active = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(active).toHaveLength(1);
    const remainingTitle = await repos.films.getById(active[0].filmId);
    expect(remainingTitle?.title).toBe("Paddington 2");
  });

  it("never deactivates anything in the default 'merge' mode", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
        "2026-01-02,Inception,2010,https://letterboxd.com/film/inception/",
      ]),
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      // No `mode` — defaults to "merge".
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
    });
    expect(outcome.ok && outcome.filmsRemoved).toBe(0);

    const active = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(active).toHaveLength(2); // Inception stays, untouched
  });

  it("a replace-deactivated entry is removed using 'manual' (not 'watched'), so it's freely reactivatable by a later normal import", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Inception,2010,https://letterboxd.com/film/inception/",
      ]),
    });
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      mode: "replace",
      watchlistCsv: csv([]),
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "c.csv",
      watchlistCsv: csv([
        "2026-01-01,Inception,2010,https://letterboxd.com/film/inception/",
      ]),
    });
    expect(outcome.ok && outcome.filmsUpdated).toBe(1); // reactivated, not skipped

    const active = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(active).toHaveLength(1);
  });

  it("preserves watched history and ratings untouched by a replace that drops a film from the active watchlist", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
      ratingsCsv: [
        "Date,Name,Year,Letterboxd URI,Rating",
        "2025-12-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/,4.5",
      ].join("\n"),
    });
    const ratingsBefore = await repos.history.listRatings(PROFILE_ID);
    expect(ratingsBefore).toHaveLength(1);

    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      mode: "replace",
      watchlistCsv: csv([]),
    });

    // The film dropped off the active watchlist entirely...
    expect(await repos.watchlist.listActiveEntries(PROFILE_ID)).toHaveLength(0);
    // ...but its rating (unrelated historical data) survives untouched.
    const ratingsAfter = await repos.history.listRatings(PROFILE_ID);
    expect(ratingsAfter).toEqual(ratingsBefore);
  });

  it("does not touch an entry that's already inactive for an unrelated reason (e.g. already watched)", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
    });
    const [entry] = await repos.watchlist.listActiveEntries(PROFILE_ID);
    await repos.watchlist.updateEntry({
      ...entry,
      isActive: false,
      removedAt: "2026-01-05T00:00:00.000Z",
      removedReason: "watched",
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      mode: "replace",
      watchlistCsv: csv([]),
    });
    expect(outcome.ok && outcome.filmsRemoved).toBe(0);
  });

  it("a failed (unparseable) replace import leaves the previous watchlist completely untouched", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
      ]),
    });

    const outcome = await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "bad.csv",
      mode: "replace",
      watchlistCsv: "not,a,valid,header",
    });
    expect(outcome.ok).toBe(false);

    const active = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(active).toHaveLength(1); // completely unaffected by the failed attempt
  });

  it("a draft's items survive a replace that removes their films from the active watchlist", async () => {
    db = new FDraftLocalDatabase(`import-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "a.csv",
      watchlistCsv: csv([
        "2026-01-01,Paddington 2,2017,https://letterboxd.com/film/paddington-2/",
        "2026-01-02,Inception,2010,https://letterboxd.com/film/inception/",
      ]),
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: { difficulty: "freeform", timeMode: "timer" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const itemsBefore = await repos.drafts.listItemsForDraft(created.draftId);
    expect(itemsBefore).toHaveLength(2);

    await importLocalWatchlistCsv(repos, {
      profileId: PROFILE_ID,
      rawFilename: "b.csv",
      mode: "replace",
      watchlistCsv: csv([]), // both films dropped from the active watchlist
    });

    const draftAfter = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draftAfter).not.toBeNull();
    const itemsAfter = await repos.drafts.listItemsForDraft(created.draftId);
    expect(itemsAfter).toEqual(itemsBefore); // untouched — draft history is unrelated to watchlist membership
  });
});
