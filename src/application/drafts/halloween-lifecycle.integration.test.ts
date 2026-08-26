import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import {
  markLocalDraftItemWatchedWithoutEntry,
  markLocalFilmWatched,
  undoLocalFilmWatched,
  type WatchSessionUndoRecord,
} from "@/application/watchlist/local-watchlist-service";
import { createHalloweenLocalDraft } from "./halloween-draft-service";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { createSeededRng } from "@/domain/shared/rng";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedAdjacentFilm(
  repos: Repositories,
  params: { filmId: string; entryId: string },
) {
  await repos.films.create({
    id: params.filmId,
    title: params.filmId,
    releaseYear: 2000,
    letterboxdSlug: params.filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: params.entryId,
    profileId: PROFILE_ID,
    filmId: params.filmId,
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `${params.filmId}-meta`,
    filmId: params.filmId,
    provider: "tmdb",
    posterUrl: null,
    runtimeMinutes: null,
    genres: ["Horror"],
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
    releaseDate: null,
    releaseStatus: "Released",
    providerTitle: null,
    raw: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function seedOffWatchlistFilm(repos: Repositories, filmId: string) {
  await repos.films.create({
    id: filmId,
    title: filmId,
    releaseYear: 2000,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("Halloween Draft — full lifecycle (PROMPT 21)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  it("create → watched → undo → watched → complete → History/backup all work, including Event-only films", async () => {
    db = new FDraftLocalDatabase(`halloween-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedAdjacentFilm(repos, { filmId: "adj-1", entryId: "adj-entry-1" });
    await seedAdjacentFilm(repos, { filmId: "adj-2", entryId: "adj-entry-2" });
    await seedOffWatchlistFilm(repos, "horror-1");
    await seedOffWatchlistFilm(repos, "horror-2");
    await seedOffWatchlistFilm(repos, "kitsch-1");
    setHalloweenManifestFilmIds({
      horrorFilmIds: ["horror-1", "horror-2"],
      kitschFilmIds: ["kitsch-1"],
    });

    // 1. CREATE — baby (5 films): 2 adjacent, 2 horror, 1 kitsch.
    const created = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        split: { halloweenAdjacentCount: 2, horrorCount: 2, kitschCount: 1 },
        effectiveNow: new Date("2026-10-15T12:00:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draftId = created.draftId;

    // 2. ACTIVE — draft is active with all 5 items unwatched.
    let draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.status).toBe("active");
    let items = await repos.drafts.listItemsForDraft(draftId);
    expect(items).toHaveLength(5);
    expect(items.every((item) => !item.isCompleted)).toBe(true);

    // 3. SORT — original draft position is preserved (orderIndex is stable,
    // grouped adjacent-then-horror-then-kitsch per `createHalloweenLocalDraft`).
    const sortedByOrder = [...items].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    expect(sortedByOrder.map((item) => item.source)).toEqual([
      "halloween-adjacent",
      "halloween-adjacent",
      "horror",
      "horror",
      "kitsch",
    ]);

    const adjacentItem = items.find(
      (item) => item.source === "halloween-adjacent",
    )!;
    const horrorItem = items.find((item) => item.source === "horror")!;

    // 4. WATCHED — an Event-only (off-watchlist) Horror film is marked
    // watched via the dedicated no-entry path.
    const horrorWatched = await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: horrorItem.id,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(horrorWatched.ok).toBe(true);
    if (!horrorWatched.ok) return;
    expect(horrorWatched.watchlistEntryId).toBeNull();

    // 5. UNDO — reverses exactly that watch, no watchlist entry involved.
    const undoRecord: WatchSessionUndoRecord = {
      watchlistEntryId: horrorWatched.watchlistEntryId,
      filmId: horrorWatched.filmId,
      watchedHistoryId: horrorWatched.watchedHistoryId,
      draftItemId: horrorWatched.draftItemId,
      draftId: horrorWatched.draftId,
      draftArchivedByThisAction: horrorWatched.draftArchivedByThisAction,
      secondaryDraftCompletion: horrorWatched.secondaryDraftCompletion,
    };
    const undone = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: undoRecord,
    });
    expect(undone).toEqual({ ok: true });
    const afterUndo = await repos.drafts.getItemById(horrorItem.id);
    expect(afterUndo?.isCompleted).toBe(false);

    // 6. WATCHED again — re-mark the same Event-only film watched.
    const horrorRewatched = await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: horrorItem.id,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(horrorRewatched.ok).toBe(true);

    // Mark the normal (watchlist-backed) Halloween-adjacent film watched
    // through the ordinary path.
    const adjacentWatched = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: adjacentItem.watchlistEntryId!,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(adjacentWatched.ok).toBe(true);

    // 7. PROGRESS — 2/5 watched (1 adjacent + the re-watched horror film),
    // draft still active (3 remain).
    items = await repos.drafts.listItemsForDraft(draftId);
    expect(items.filter((item) => item.isCompleted)).toHaveLength(2);
    draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.status).toBe("active");

    // Mark the remaining three (one adjacent, one horror) via their natural
    // paths, and the one Kitsch item via the no-entry path.
    const remaining = items.filter((item) => !item.isCompleted);
    for (const item of remaining) {
      if (item.watchlistEntryId) {
        const outcome = await markLocalFilmWatched(
          repos,
          {
            profileId: PROFILE_ID,
            watchlistEntryId: item.watchlistEntryId,
            profileTimezone: "UTC",
          },
          { archiveIfResolved: archiveLocalDraftIfResolved },
        );
        expect(outcome.ok).toBe(true);
      } else {
        const outcome = await markLocalDraftItemWatchedWithoutEntry(
          repos,
          {
            profileId: PROFILE_ID,
            draftItemId: item.id,
            profileTimezone: "UTC",
          },
          { archiveIfResolved: archiveLocalDraftIfResolved },
        );
        expect(outcome.ok).toBe(true);
      }
    }

    // 8. COMPLETE — every item watched, draft auto-archived, reward granted.
    draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.status).toBe("archived");
    expect(draft?.rewardsGrantedAt).not.toBeNull();
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);

    // Draft completion always banks the generic Lifetime currency now
    // (Halloween's own `haunted` currency is earned per-film instead, via
    // `awardEventDraftItemReward` — see the Haunted assertion below).
    const lifetimeBalance = await repos.points.getBalance(
      PROFILE_ID,
      "lifetime",
    );
    expect(lifetimeBalance).toBeGreaterThan(0);

    // Every one of the 5 items earned exactly 1 Haunted Point each, with no
    // distinction between halloween-adjacent/horror/kitsch pools — the
    // undone-then-rewatched horror item earned exactly once, not twice.
    const hauntedBalance = await repos.points.getBalance(PROFILE_ID, "haunted");
    const completedItems = await repos.drafts.listItemsForDraft(draftId);
    expect(hauntedBalance).toBe(5);
    expect(completedItems.every((item) => item.eventRewardGrantedAt)).toBe(
      true,
    );

    // 9. POST-DRAFT / HISTORY — the archived draft and every watch
    // (including the Event-only films) are visible exactly like any other
    // finalised draft.
    const archivedDrafts = await repos.drafts.listArchived(PROFILE_ID);
    expect(archivedDrafts.map((d) => d.id)).toContain(draftId);

    const finalItems = await repos.drafts.listItemsForDraft(draftId);
    expect(finalItems.every((item) => item.isCompleted)).toBe(true);
    const bySource = Object.fromEntries(
      finalItems.map((item) => [item.id, item.source]),
    );
    expect(Object.values(bySource).sort()).toEqual(
      [
        "halloween-adjacent",
        "halloween-adjacent",
        "horror",
        "horror",
        "kitsch",
      ].sort(),
    );

    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    // 5 completions total, plus the one undone-then-redone horror watch's
    // FIRST attempt was deleted by undo — so exactly 5 history rows remain,
    // one per item, never a stray extra from the undone attempt.
    expect(history).toHaveLength(5);
    const entryLessHistory = history.filter((h) => h.watchlistEntryId === null);
    expect(entryLessHistory).toHaveLength(3); // 2 horror + 1 kitsch
  });
});

describe("Watched-history timestamps are real, independent of the Admin Event Clock override (PROMPT 21)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    vi.useRealTimers();
  });

  it("markLocalFilmWatched's watchedDate reflects the REAL clock, not an active Halloween date override", async () => {
    db = new FDraftLocalDatabase(`halloween-real-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    // Freeze the REAL system clock at a date far outside Halloween's window.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    // Arm an Admin Event Date override simulating a date deep inside
    // Halloween's window — this must never leak into a real watched
    // timestamp.
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-31T23:00:00.000Z",
    });

    await repos.films.create({
      id: "film-1",
      title: "Film 1",
      releaseYear: 2020,
      letterboxdSlug: "film-1",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.watchlist.createEntry({
      id: "entry-1",
      profileId: PROFILE_ID,
      filmId: "film-1",
      dateAdded: "2026-01-01",
      position: 0,
      isActive: true,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    // No `clock` dep passed — production callers (WatchToggle,
    // HalloweenFilmWatchToggle) never pass one either, so this always
    // falls through to `new SystemClock()`.
    const outcome = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: "entry-1",
      profileTimezone: "UTC",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    const record = history.find((h) => h.id === outcome.watchedHistoryId);
    // The REAL (frozen) date, March 2026 — never the Halloween-window
    // simulated override date.
    expect(record?.watchedDate).toBe("2026-03-15");
  });
});
