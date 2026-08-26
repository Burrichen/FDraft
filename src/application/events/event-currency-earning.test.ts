import { afterEach, describe, expect, it } from "vitest";
import { buildProfileBackup } from "@/application/backup/export-backup";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  markLocalFilmWatched,
  undoLocalFilmWatched,
  type WatchSessionUndoRecord,
} from "@/application/watchlist/local-watchlist-service";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import type { Repositories } from "@/repositories";

const CLOCK = new FixedClock(new Date("2026-08-11T00:00:00.000Z"));

function sequentialIdGenerator(prefix: string) {
  let counter = 0;
  return { generate: () => `${prefix}-${++counter}` };
}

async function seedProfile(repos: Repositories) {
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
}

/**
 * Covers docs/updates, "EVENT SYSTEM — UNIVERSAL EVENT CURRENCY EARNING"
 * §12's test list for the generic per-film earning mechanism
 * (`awardEventDraftItemReward`/`reverseEventDraftItemReward`), using
 * direct `createDraft`/`createItems` construction (same pattern as
 * `dual-draft-architecture.integration.test.ts`) rather than the full
 * Halloween/January creation flows, since the mechanism itself is
 * event-agnostic and only needs a `DraftRecord.sourceEventId` +
 * `EventDefinition.currency` to exercise. The Halloween-adjacent/
 * Horror/Kitsch "no pool distinction" case, and a full realistic
 * multi-pool lifecycle, are already covered end-to-end by
 * `halloween-lifecycle.integration.test.ts`.
 */
const PROFILE_ID = "alex";

async function seedFilm(
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
}

function baseDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "draft-1",
    profileId: PROFILE_ID,
    difficulty: "baby",
    timeMode: "timer",
    status: "active",
    totalFilms: 1,
    randomFilmCount: 1,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    customName: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseItem(
  overrides: Partial<DraftItemRecord> & {
    id: string;
    draftId: string;
    filmId: string;
    watchlistEntryId: string | null;
  },
): DraftItemRecord {
  return {
    source: "random" as const,
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

async function watchAndArchiveIfResolved(
  repos: Repositories,
  watchlistEntryId: string,
) {
  return markLocalFilmWatched(
    repos,
    { profileId: PROFILE_ID, watchlistEntryId, profileTimezone: "UTC" },
    { archiveIfResolved: archiveLocalDraftIfResolved },
  );
}

describe("Universal Event Currency Earning — per-film award/reverse (PROMPT: EVENT SYSTEM — UNIVERSAL EVENT CURRENCY EARNING)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("watching a Halloween Draft film earns +1 Lifetime AND +1 Haunted", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);

    const outcome = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(outcome.ok).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
  });

  it("two Halloween Draft films watched → +2 Haunted (one per film, not per draft)", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await seedFilm(repos, { filmId: "film-2", entryId: "entry-2" });
    await repos.drafts.createDraft(
      baseDraft({
        totalFilms: 2,
        randomFilmCount: 2,
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
        orderIndex: 0,
      }),
      baseItem({
        id: "item-2",
        draftId: "draft-1",
        filmId: "film-2",
        watchlistEntryId: "entry-2",
        source: "halloween-adjacent",
        orderIndex: 1,
      }),
    ]);

    await watchAndArchiveIfResolved(repos, "entry-1");
    await watchAndArchiveIfResolved(repos, "entry-2");

    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(2);
    // Draft completion still banks exactly one Lifetime Point (the
    // per-draft completion reward), not one per film.
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
  });

  it("one film from each of the three Halloween pools (adjacent/horror/kitsch), watched -> +3 Haunted and correct Lifetime progression (EVENT SYSTEM — CURRENCY & EVENT-ENDING HARDENING §1)", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, {
      filmId: "adjacent-film",
      entryId: "entry-adjacent",
    });
    await seedFilm(repos, { filmId: "horror-film", entryId: "entry-horror" });
    await seedFilm(repos, { filmId: "kitsch-film", entryId: "entry-kitsch" });
    await repos.drafts.createDraft(
      baseDraft({
        totalFilms: 3,
        randomFilmCount: 3,
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-adjacent",
        draftId: "draft-1",
        filmId: "adjacent-film",
        watchlistEntryId: "entry-adjacent",
        source: "halloween-adjacent",
        orderIndex: 0,
      }),
      baseItem({
        id: "item-horror",
        draftId: "draft-1",
        filmId: "horror-film",
        watchlistEntryId: "entry-horror",
        source: "horror",
        orderIndex: 1,
      }),
      baseItem({
        id: "item-kitsch",
        draftId: "draft-1",
        filmId: "kitsch-film",
        watchlistEntryId: "entry-kitsch",
        source: "kitsch",
        orderIndex: 2,
      }),
    ]);

    await watchAndArchiveIfResolved(repos, "entry-adjacent");
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
    await watchAndArchiveIfResolved(repos, "entry-horror");
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(2);
    await watchAndArchiveIfResolved(repos, "entry-kitsch");

    // Every pool independently earned exactly 1 Haunted Point — no pool
    // distinction in the award mechanism itself.
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(3);
    // Normal progression is untouched: the draft completed (all 3 items
    // resolved) and banked exactly one Lifetime Point for that completion.
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("archived");
  });

  it("repeatedly clicking Watched on an already-completed item does not repeatedly award Haunted Points", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);

    const first = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(first.ok).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);

    // The item is already completed (and the draft archived) — a second
    // "mark watched" attempt on the same watchlist entry is rejected (the
    // entry was already marked watched/removed by the first action), and
    // regardless of that outcome, no repeat award can occur.
    const second = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(second.ok).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);

    // Calling the award function directly a second time with the
    // already-granted item is the more direct idempotency guarantee —
    // the item's own `eventRewardGrantedAt` guard blocks it regardless of
    // how the caller reached this point.
    const item = await repos.drafts.getItemById("item-1");
    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(item?.eventRewardGrantedAt).toBeTruthy();
    const { awardEventDraftItemReward } =
      await import("@/application/events/draft-completion-reward");
    const rewarded = await awardEventDraftItemReward(repos, {
      profileId: PROFILE_ID,
      draft: draft!,
      item: item!,
    });
    expect(rewarded).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
  });

  it("Undo reverses the Haunted Point award, and watching again afterward awards it exactly once more", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);

    const watched = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(watched.ok).toBe(true);
    if (!watched.ok) return;
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);

    const undoRecord: WatchSessionUndoRecord = {
      watchlistEntryId: watched.watchlistEntryId,
      filmId: watched.filmId,
      watchedHistoryId: watched.watchedHistoryId,
      draftItemId: watched.draftItemId,
      draftId: watched.draftId,
      draftArchivedByThisAction: watched.draftArchivedByThisAction,
      secondaryDraftCompletion: watched.secondaryDraftCompletion,
    };
    const undone = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: undoRecord,
    });
    expect(undone).toEqual({ ok: true });
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    const afterUndo = await repos.drafts.getItemById("item-1");
    expect(afterUndo?.eventRewardGrantedAt).toBeNull();
    expect(afterUndo?.isCompleted).toBe(false);

    const rewatched = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(rewatched.ok).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
  });

  it("watching a January Draft film earns +1 Lifetime AND +1 Misery", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "manual",
      }),
    ]);

    const outcome = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(outcome.ok).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(0);
  });

  it("Undo reverses the Misery Point award, and watching again afterward awards it exactly once more (EVENT SYSTEM — CURRENCY & EVENT-ENDING HARDENING §3)", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "manual",
      }),
    ]);

    const watched = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(watched.ok).toBe(true);
    if (!watched.ok) return;
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);

    const undoRecord: WatchSessionUndoRecord = {
      watchlistEntryId: watched.watchlistEntryId,
      filmId: watched.filmId,
      watchedHistoryId: watched.watchedHistoryId,
      draftItemId: watched.draftItemId,
      draftId: watched.draftId,
      draftArchivedByThisAction: watched.draftArchivedByThisAction,
      secondaryDraftCompletion: watched.secondaryDraftCompletion,
    };
    const undone = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: undoRecord,
    });
    expect(undone).toEqual({ ok: true });
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    const afterUndo = await repos.drafts.getItemById("item-1");
    expect(afterUndo?.eventRewardGrantedAt).toBeNull();
    expect(afterUndo?.isCompleted).toBe(false);

    const rewatched = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(rewatched.ok).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
  });

  it("watching a plain (non-Event) Draft film earns Lifetime only — no event currency of any kind", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
      }),
    ]);

    const outcome = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(outcome.ok).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(0);
    const item = await repos.drafts.getItemById("item-1");
    expect(item?.eventRewardGrantedAt).toBeNull();
  });

  it("a manually-enabled Halloween Draft never earns Haunted Points (only the completion's Lifetime Point)", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: true,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);

    const outcome = await watchAndArchiveIfResolved(repos, "entry-1");
    expect(outcome.ok).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(0);
  });

  it("Haunted Points and per-item award state survive a restart (fresh db handle against the same name)", async () => {
    const databaseName = `currency-${crypto.randomUUID()}`;
    db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);
    await watchAndArchiveIfResolved(repos, "entry-1");
    await db.close();

    const reopened = new FDraftLocalDatabase(databaseName);
    const reopenedRepos = createLocalRepositories(reopened) as Repositories;
    expect(await reopenedRepos.points.getBalance(PROFILE_ID, "haunted")).toBe(
      1,
    );
    const item = await reopenedRepos.drafts.getItemById("item-1");
    expect(item?.eventRewardGrantedAt).toBeTruthy();
    db = reopened;
  });

  it("Haunted Points are isolated per profile", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);
    await watchAndArchiveIfResolved(repos, "entry-1");

    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
    expect(await repos.points.getBalance("someone-else", "haunted")).toBe(0);
  });

  it("Haunted Points accumulate cumulatively across separate Halloween occurrences (never reset per year)", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    // "2026" occurrence — a completed, archived Halloween Draft.
    await seedFilm(repos, { filmId: "film-2026", entryId: "entry-2026" });
    await repos.drafts.createDraft(
      baseDraft({
        id: "draft-2026",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
        startedAt: "2026-10-01T00:00:00.000Z",
        deadlineAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-2026",
        draftId: "draft-2026",
        filmId: "film-2026",
        watchlistEntryId: "entry-2026",
        source: "halloween-adjacent",
      }),
    ]);
    await watchAndArchiveIfResolved(repos, "entry-2026");
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);

    // "2027" occurrence — a second, later Halloween Draft for the same
    // profile. Nothing about the currency mechanism is scoped to a
    // specific year, so its award simply adds onto the existing total.
    await seedFilm(repos, { filmId: "film-2027", entryId: "entry-2027" });
    await repos.drafts.createDraft(
      baseDraft({
        id: "draft-2027",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
        startedAt: "2027-10-01T00:00:00.000Z",
        deadlineAt: "2027-11-01T00:00:00.000Z",
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-2027",
        draftId: "draft-2027",
        filmId: "film-2027",
        watchlistEntryId: "entry-2027",
        source: "halloween-adjacent",
      }),
    ]);
    await watchAndArchiveIfResolved(repos, "entry-2027");

    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(2);
  });

  it("an archived Halloween Draft's completed items cannot farm Haunted Points a second time, including via backup restore", async () => {
    db = new FDraftLocalDatabase(`currency-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedProfile(repos);
    await seedFilm(repos, { filmId: "film-1", entryId: "entry-1" });
    await repos.drafts.createDraft(
      baseDraft({
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "halloween-adjacent",
      }),
    ]);
    await watchAndArchiveIfResolved(repos, "entry-1");
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("archived");

    // Restoring a backup of this exact state into a fresh profile must
    // preserve both the balance and the per-item award guard — never let
    // the restored item re-earn its currency.
    const backup = await buildProfileBackup(repos, PROFILE_ID, {
      clock: CLOCK,
    });
    const result = await repos.backupRestore.importAsNewProfile(backup, {
      idGenerator: sequentialIdGenerator("restored"),
      clock: CLOCK,
      currentSchemaVersion: 1,
    });
    expect(result.profileId).toBeTruthy();
    expect(await repos.points.getBalance(result.profileId, "haunted")).toBe(1);

    const restoredDraft = (
      await repos.drafts.listArchived(result.profileId)
    )[0]!;
    const restoredItem = (
      await repos.drafts.listItemsForDraft(restoredDraft.id)
    )[0];
    expect(restoredItem?.eventRewardGrantedAt).toBeTruthy();
    expect(restoredItem?.isCompleted).toBe(true);

    // Directly attempting to re-award the already-granted restored item is
    // a no-op — the guard is per-item state, not per-database.
    const { awardEventDraftItemReward } =
      await import("@/application/events/draft-completion-reward");
    const rewarded = await awardEventDraftItemReward(repos, {
      profileId: result.profileId,
      draft: restoredDraft,
      item: restoredItem!,
    });
    expect(rewarded).toBe(false);
    expect(await repos.points.getBalance(result.profileId, "haunted")).toBe(1);
  });
});
