import { afterEach, describe, expect, it } from "vitest";
import {
  addManualFilmToLocalDraft,
  archiveLocalDraftIfResolved,
  createLocalDraft,
  replaceDraftSlot,
} from "@/application/drafts/local-draft-service";
import { undoLastDraftMutation } from "@/application/drafts/living-draft-mutations";
import { markLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
import { DIFFICULTIES } from "@/domain/drafts/difficulty";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { MAX_DRAFT_MUTATION_HISTORY } from "@/domain/drafts/living-draft";
import { createSeededRng } from "@/domain/shared/rng";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
const CLOCK = new FixedClock(new Date("2026-01-10T00:00:00.000Z"));

async function seedActiveFilms(repos: Repositories, count: number) {
  for (let i = 0; i < count; i++) {
    const filmId = `film-${i}`;
    await repos.films.create({
      id: filmId,
      title: `Film ${i}`,
      releaseYear: 2000 + i,
      letterboxdSlug: filmId,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.watchlist.createEntry({
      id: `entry-${i}`,
      profileId: PROFILE_ID,
      filmId,
      dateAdded: "2026-01-01",
      position: i,
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
}

/**
 * Creates a full-size Baby draft (5 random films), leaving the rest of the
 * seeded watchlist free to add from. Full-size deliberately: `totalFilms`
 * and `originalTargetFilms` come from the DIFFICULTY, so a draft created
 * with fewer random picks than its difficulty declares would start out with
 * a total that disagrees with its items — not a state the app can reach.
 */
const BABY_FILM_COUNT = DIFFICULTIES.baby.filmCount!;

async function createDraft(repos: Repositories) {
  const created = await createLocalDraft(
    repos,
    {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: BABY_FILM_COUNT,
        challengeCount: 0,
      },
    },
    { rng: createSeededRng(7), clock: CLOCK },
  );
  if (!created.ok) throw new Error(`draft creation failed: ${created.error}`);
  return created.draftId;
}

/** An active, eligible watchlist entry that isn't already in the draft. */
async function spareEntryId(repos: Repositories, draftId: string) {
  const items = await repos.drafts.listItemsForDraft(draftId);
  const used = new Set(items.map((item) => item.filmId));
  const entries = await repos.watchlist.listActiveEntries(PROFILE_ID);
  const spare = entries.find((entry) => !used.has(entry.filmId));
  if (!spare) throw new Error("no spare watchlist entry");
  return spare.id;
}

/**
 * Covers docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §5/§6 — the Undo
 * that the mutation history exists to power.
 */
describe("undoLastDraftMutation — reversing an add (§5)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("removes the added film again and restores the Draft's previous size", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);

    const added = await addManualFilmToLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: await spareEntryId(repos, draftId),
      },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error(`add failed: ${added.error}`);
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(
      BABY_FILM_COUNT + 1,
    );

    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    expect(outcome).toEqual({
      ok: true,
      kind: "add",
      draftItemId: added.draftItemId,
      // Handed back so the caller can clear the session watch-undo record
      // this Undo invalidates — see the field's own doc comment.
      watchlistEntryId: expect.any(String),
      clearedWatchedState: false,
    });

    const itemsAfter = await repos.drafts.listItemsForDraft(draftId);
    expect(itemsAfter).toHaveLength(BABY_FILM_COUNT);
    expect(itemsAfter.some((item) => item.id === added.draftItemId)).toBe(
      false,
    );
    const draftAfter = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draftAfter?.totalFilms).toBe(BABY_FILM_COUNT);
    // The mutation is spent — undoing twice is not an option.
    expect(draftAfter?.mutationHistory).toEqual([]);
    // The original difficulty target is untouched throughout (§3).
    expect(draftAfter?.originalTargetFilms).toBe(BABY_FILM_COUNT);
    expect(draftAfter?.difficulty).toBe("baby");
  });

  it("costs nothing — no points are spent or awarded for undoing", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);
    await addManualFilmToLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: await spareEntryId(repos, draftId),
      },
      { clock: CLOCK },
    );

    const before = await repos.points.getBalance(PROFILE_ID, "lifetime");
    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    expect(outcome.ok).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(before);
  });

  it("undoes at most the five most recent mutations, oldest already discarded (§5)", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 14);
    const draftId = await createDraft(repos);

    // Seven adds — only the last five remain reversible.
    for (let i = 0; i < 7; i++) {
      const added = await addManualFilmToLocalDraft(
        repos,
        {
          profileId: PROFILE_ID,
          draftId,
          watchlistEntryId: await spareEntryId(repos, draftId),
        },
        { clock: CLOCK },
      );
      if (!added.ok) throw new Error(`add ${i} failed: ${added.error}`);
    }
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(
      BABY_FILM_COUNT + 7,
    );
    const draftMid = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draftMid?.mutationHistory).toHaveLength(MAX_DRAFT_MUTATION_HISTORY);

    for (let i = 0; i < MAX_DRAFT_MUTATION_HISTORY; i++) {
      const outcome = await undoLastDraftMutation(
        repos,
        { profileId: PROFILE_ID, draftId },
        { clock: CLOCK },
      );
      expect(outcome.ok).toBe(true);
    }

    // The two earliest adds are permanently part of the Draft — history
    // was discarded, not the films.
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(
      BABY_FILM_COUNT + 2,
    );
    expect(
      await undoLastDraftMutation(
        repos,
        { profileId: PROFILE_ID, draftId },
        { clock: CLOCK },
      ),
    ).toEqual({
      ok: false,
      error: "nothing_to_undo",
      message: expect.any(String),
    });
  });

  it("refuses on a Draft with no recorded mutations, and on a resolved Draft", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 7);
    const draftId = await createDraft(repos);

    expect(
      await undoLastDraftMutation(
        repos,
        { profileId: PROFILE_ID, draftId },
        { clock: CLOCK },
      ),
    ).toMatchObject({ ok: false, error: "nothing_to_undo" });

    expect(
      await undoLastDraftMutation(
        repos,
        { profileId: PROFILE_ID, draftId: "no-such-draft" },
        { clock: CLOCK },
      ),
    ).toMatchObject({ ok: false, error: "draft_not_found" });

    // An expired Draft's items belong to its postmortem flow now, and a
    // discarded one is gone — neither is still-editable membership.
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    for (const status of ["expired", "discarded"] as const) {
      await repos.drafts.updateDraft({ ...draft!, status });
      expect(
        await undoLastDraftMutation(
          repos,
          { profileId: PROFILE_ID, draftId },
          { clock: CLOCK },
        ),
      ).toMatchObject({ ok: false, error: "draft_not_active" });
    }
  });

  it("drops a stale mutation whose item no longer exists rather than getting stuck", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);
    const added = await addManualFilmToLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: await spareEntryId(repos, draftId),
      },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error("unreachable");

    // Simulates the item having gone by another route (a partially
    // restored backup, an older build).
    await repos.drafts.deleteItem(added.draftItemId);

    expect(
      await undoLastDraftMutation(
        repos,
        { profileId: PROFILE_ID, draftId },
        { clock: CLOCK },
      ),
    ).toMatchObject({ ok: false, error: "item_missing" });
    const draftAfter = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draftAfter?.mutationHistory).toEqual([]);
  });
});

describe("undoLastDraftMutation — reversing a replacement (§5)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("puts the previous film back in the same slot, with its own source intact", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);
    const items = await repos.drafts.listItemsForDraft(draftId);
    const target = items[0];
    expect(target.entrySource).toBe("random");

    const replacementEntryId = await spareEntryId(repos, draftId);
    const replaced = await replaceDraftSlot(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        draftItemId: target.id,
        adminModeEnabled: false,
        mode: { kind: "manual", watchlistEntryId: replacementEntryId },
      },
      { clock: CLOCK },
    );
    expect(replaced.ok).toBe(true);
    const afterReplace = await repos.drafts.getItemById(target.id);
    expect(afterReplace?.filmId).not.toBe(target.filmId);
    expect(afterReplace?.entrySource).toBe("manual_replace");

    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    expect(outcome).toEqual({
      ok: true,
      kind: "replace",
      draftItemId: target.id,
      watchlistEntryId: expect.any(String),
      clearedWatchedState: false,
    });

    const restored = await repos.drafts.getItemById(target.id);
    expect(restored?.filmId).toBe(target.filmId);
    expect(restored?.watchlistEntryId).toBe(target.watchlistEntryId);
    expect(restored?.source).toBe(target.source);
    expect(restored?.entrySource).toBe("random");
    expect(restored?.orderIndex).toBe(target.orderIndex);
    expect(restored?.substitutionReason).toBeNull();
    // A replacement never changes the Draft's size, so neither does its undo.
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(
      BABY_FILM_COUNT,
    );
  });

  it("carries the replaced slot's full context in the recorded snapshot", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);
    const target = (await repos.drafts.listItemsForDraft(draftId))[0];

    const replaced = await replaceDraftSlot(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        draftItemId: target.id,
        adminModeEnabled: false,
        mode: {
          kind: "manual",
          watchlistEntryId: await spareEntryId(repos, draftId),
        },
      },
      { clock: CLOCK },
    );
    expect(replaced.ok).toBe(true);

    // The snapshot is what makes the undo possible, and it persists WITH
    // the draft, so it survives a reload rather than living in a session.
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.mutationHistory).toHaveLength(1);
    const recorded = draft!.mutationHistory![0];
    expect(recorded.kind).toBe("replace");
    expect(recorded.draftItemId).toBe(target.id);
    expect(recorded.previousItem).toMatchObject({
      filmId: target.filmId,
      watchlistEntryId: target.watchlistEntryId,
      source: target.source,
      entrySource: "random",
      orderIndex: target.orderIndex,
      challengeId: null,
    });
  });
});

describe("undoLastDraftMutation — watched state (§6)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("removes the watched status of a film it takes back out of the Draft", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);
    const addedEntryId = await spareEntryId(repos, draftId);
    const added = await addManualFilmToLocalDraft(
      repos,
      { profileId: PROFILE_ID, draftId, watchlistEntryId: addedEntryId },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error("unreachable");

    const watched = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: addedEntryId,
        profileTimezone: "UTC",
      },
      { clock: CLOCK, archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(watched.ok).toBe(true);
    const watchedItem = await repos.drafts.getItemById(added.draftItemId);
    expect(watchedItem?.isCompleted).toBe(true);
    const watchedHistoryId = watchedItem!.watchedHistoryId!;

    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    expect(outcome).toMatchObject({
      ok: true,
      clearedWatchedState: true,
      // The entry whose session watch-undo record must now be cleared.
      watchlistEntryId: addedEntryId,
    });

    // The watch is gone entirely: no history row, no deactivated entry, no
    // orphaned item.
    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(history.some((entry) => entry.id === watchedHistoryId)).toBe(false);
    const entry = await repos.watchlist.getEntryById(PROFILE_ID, addedEntryId);
    expect(entry?.isActive).toBe(true);
    expect(entry?.removedReason).toBeNull();
    expect(await repos.drafts.getItemById(added.draftItemId)).toBeNull();
  });

  it("reverses the completion reward and re-judges completion on what's left (§4/§6)", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);

    // §4 — the added film makes completion require six films, not the
    // five the Baby difficulty originally asked for.
    const addedEntryId = await spareEntryId(repos, draftId);
    const added = await addManualFilmToLocalDraft(
      repos,
      { profileId: PROFILE_ID, draftId, watchlistEntryId: addedEntryId },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(draftId);
    for (const item of items) {
      const watched = await markLocalFilmWatched(
        repos,
        {
          profileId: PROFILE_ID,
          watchlistEntryId: item.watchlistEntryId!,
          profileTimezone: "UTC",
        },
        { clock: CLOCK, archiveIfResolved: archiveLocalDraftIfResolved },
      );
      expect(watched.ok).toBe(true);
    }
    const archived = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(archived?.status).toBe("archived");
    expect(archived?.rewardsGrantedAt).not.toBeNull();
    const pointsWhenComplete = await repos.points.getBalance(
      PROFILE_ID,
      "lifetime",
    );
    expect(pointsWhenComplete).toBeGreaterThan(0);

    // A completed Draft is still undoable — the whole point of §6 is that
    // the film being taken back out may since have been watched, and
    // watching the last outstanding film is exactly what completed this.
    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    expect(outcome).toMatchObject({ ok: true, clearedWatchedState: true });

    // The added film's watch is fully reversed: item gone, history row
    // gone, watchlist entry back.
    expect(await repos.drafts.getItemById(added.draftItemId)).toBeNull();
    const entry = await repos.watchlist.getEntryById(PROFILE_ID, addedEntryId);
    expect(entry?.isActive).toBe(true);

    // And completion is then re-judged on the five films that remain (§4)
    // — all of them watched, so the Draft is still legitimately complete,
    // with its reward reversed and re-granted exactly once, never twice.
    const after = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(after?.status).toBe("archived");
    expect(after?.completedAt).not.toBeNull();
    expect(after?.rewardsGrantedAt).not.toBeNull();
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(
      pointsWhenComplete,
    );
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(
      BABY_FILM_COUNT,
    );
  });

  it("completes a Draft that undoing an unwatched addition leaves fully watched (§4)", async () => {
    db = new FDraftLocalDatabase(`undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await createDraft(repos);
    const originalItems = await repos.drafts.listItemsForDraft(draftId);

    const added = await addManualFilmToLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: await spareEntryId(repos, draftId),
      },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error("unreachable");

    // Every ORIGINAL film watched, the added one not — six films, five
    // watched, so the Draft is deliberately NOT complete (§4).
    for (const item of originalItems) {
      await markLocalFilmWatched(
        repos,
        {
          profileId: PROFILE_ID,
          watchlistEntryId: item.watchlistEntryId!,
          profileTimezone: "UTC",
        },
        { clock: CLOCK, archiveIfResolved: archiveLocalDraftIfResolved },
      );
    }
    expect((await repos.drafts.getById(PROFILE_ID, draftId))?.status).toBe(
      "active",
    );

    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    // Nothing to un-watch here — the film removed was never watched.
    expect(outcome).toMatchObject({ ok: true, clearedWatchedState: false });

    // Taking the sixth film back out completes the Draft, because
    // completion counts what is in it NOW.
    const after = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(after?.status).toBe("archived");
    expect(after?.completedAt).not.toBeNull();
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
  });
});

/**
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §11: an Event
 * addition uses the SAME Undo as every other mutation — there is no
 * separate Event undo system.
 */
describe("undoLastDraftMutation — an Event Draft's addition (Part 3 §11)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function halloweenDraft(repos: Repositories) {
    const draftId = await createDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    // Re-tagged rather than generated through Halloween's own service:
    // what is under test is the generic Undo path over an Event-owned
    // draft, not how that draft was built.
    await repos.drafts.updateDraft({
      ...draft!,
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    return draftId;
  }

  it("removes the film, reverses its watch, and re-judges Event Draft completion", async () => {
    db = new FDraftLocalDatabase(`event-undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await halloweenDraft(repos);

    const addedEntryId = await spareEntryId(repos, draftId);
    const added = await addManualFilmToLocalDraft(
      repos,
      { profileId: PROFILE_ID, draftId, watchlistEntryId: addedEntryId },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error(`add failed: ${added.error}`);
    expect(
      (await repos.drafts.getItemById(added.draftItemId))?.entrySource,
    ).toBe("event");

    // Watched after being added — the case §6 exists for.
    const watched = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: addedEntryId,
        profileTimezone: "UTC",
      },
      { clock: CLOCK, archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(watched.ok).toBe(true);
    const watchedHistoryId = (await repos.drafts.getItemById(
      added.draftItemId,
    ))!.watchedHistoryId!;

    const outcome = await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );
    expect(outcome).toMatchObject({
      ok: true,
      kind: "add",
      clearedWatchedState: true,
      watchlistEntryId: addedEntryId,
    });

    // Same guarantees as a normal draft's Undo: film gone, watch gone,
    // entry back, progress counted on what remains.
    expect(await repos.drafts.getItemById(added.draftItemId)).toBeNull();
    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(history.some((entry) => entry.id === watchedHistoryId)).toBe(false);
    expect(
      (await repos.watchlist.getEntryById(PROFILE_ID, addedEntryId))?.isActive,
    ).toBe(true);
    const items = await repos.drafts.listItemsForDraft(draftId);
    expect(items).toHaveLength(BABY_FILM_COUNT);
    expect(items.every((item) => !item.isCompleted)).toBe(true);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.status).toBe("active");
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    expect(draft?.mutationHistory).toEqual([]);
  });

  it("reverses the Event's own per-film currency along with the watch", async () => {
    db = new FDraftLocalDatabase(`event-undo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 8);
    const draftId = await halloweenDraft(repos);
    const addedEntryId = await spareEntryId(repos, draftId);
    const added = await addManualFilmToLocalDraft(
      repos,
      { profileId: PROFILE_ID, draftId, watchlistEntryId: addedEntryId },
      { clock: CLOCK },
    );
    if (!added.ok) throw new Error("unreachable");

    await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: addedEntryId,
        profileTimezone: "UTC",
      },
      { clock: CLOCK, archiveIfResolved: archiveLocalDraftIfResolved },
    );
    // Halloween pays a Haunted Point per film watched in its draft.
    const hauntedWhenWatched = await repos.points.getBalance(
      PROFILE_ID,
      "haunted",
    );
    expect(hauntedWhenWatched).toBeGreaterThan(0);

    await undoLastDraftMutation(
      repos,
      { profileId: PROFILE_ID, draftId },
      { clock: CLOCK },
    );

    // Undo is free, but the currency that watch earned goes back with it —
    // no points left awarded for a film no longer in the draft.
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(
      hauntedWhenWatched - 1,
    );
  });
});
