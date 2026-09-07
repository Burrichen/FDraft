import { afterEach, describe, expect, it } from "vitest";
import { finalizeExpiredEventDraftIfNeeded } from "./event-draft-finalization";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

function baseDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "halloween-draft-1",
    profileId: PROFILE_ID,
    difficulty: "baby",
    timeMode: "timer",
    status: "active",
    totalFilms: 2,
    randomFilmCount: 2,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    // Mirrors `createHalloweenLocalDraft`'s own `deadlineAt` — the event's
    // own occurrence end, per docs/updates "PROMPT B2.2".
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: HALLOWEEN_EVENT_ID,
    sourceEventManuallyEnabled: false,
    rewardsGrantedAt: null,
    eventOccurrenceYear: null,
    customName: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseItem(
  overrides: Partial<DraftItemRecord> & { id: string; filmId: string },
): DraftItemRecord {
  return {
    draftId: "halloween-draft-1",
    watchlistEntryId: null,
    source: "halloween-adjacent",
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

describe("finalizeExpiredEventDraftIfNeeded — Event Draft finalisation at the Event's own boundary", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("transitions an active Draft to expired once the clock is past the Event's occurrence end, preserving watched and unwatched items", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({ id: "item-1", filmId: "film-1", isCompleted: true }),
      baseItem({ id: "item-2", filmId: "film-2", isCompleted: false }),
    ]);

    const finalized = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: HALLOWEEN_EVENT_ID },
      { clock: new FixedClock(new Date("2026-11-01T00:00:01.000Z")) },
    );

    expect(finalized).toBe(true);
    const draft = await repos.drafts.getById(PROFILE_ID, "halloween-draft-1");
    expect(draft?.status).toBe("expired");

    const items = await repos.drafts.listItemsForDraft("halloween-draft-1");
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === "item-1")?.isCompleted).toBe(true);
    expect(items.find((i) => i.id === "item-2")?.isCompleted).toBe(false);
    expect(items.find((i) => i.id === "item-2")?.source).toBe(
      "halloween-adjacent",
    );
  });

  it("does nothing before the Event's occurrence end (not yet expired)", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({ id: "item-1", filmId: "film-1" }),
    ]);

    const finalized = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: HALLOWEEN_EVENT_ID },
      { clock: new FixedClock(new Date("2026-10-31T23:59:00.000Z")) },
    );

    expect(finalized).toBe(false);
    const draft = await repos.drafts.getById(PROFILE_ID, "halloween-draft-1");
    expect(draft?.status).toBe("active");
  });

  it("is a safe no-op when there's no Draft for that event at all", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    const finalized = await finalizeExpiredEventDraftIfNeeded(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
    });

    expect(finalized).toBe(false);
  });

  it("is idempotent — calling it again after the Draft already finalised does nothing further", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({ id: "item-1", filmId: "film-1" }),
    ]);
    const clock = new FixedClock(new Date("2026-11-01T00:00:01.000Z"));

    await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );
    const secondCall = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );

    expect(secondCall).toBe(false);
  });

  it("never deletes the Draft or its items — a finalised Draft is still fully readable", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({ id: "item-1", filmId: "film-1", isCompleted: true }),
    ]);

    await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: HALLOWEEN_EVENT_ID },
      { clock: new FixedClock(new Date("2026-11-01T00:00:01.000Z")) },
    );

    const draft = await repos.drafts.getById(PROFILE_ID, "halloween-draft-1");
    expect(draft).not.toBeNull();
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    const items = await repos.drafts.listItemsForDraft("halloween-draft-1");
    expect(items).toHaveLength(1);
  });
});

/**
 * January (see docs/updates, "FDRAFT UPDATE 1 — JANUARY EVENT-OVER
 * EXPERIENCE" §7) is the first `fixedEventDeadline` event whose Draft is
 * NOT created through a bespoke, occurrence-pinned service — it goes
 * through the fully generic `createLocalDraft`, which still sets a normal
 * profile-chosen Calendar/Timer `deadlineAt` unrelated to the event's own
 * window. These tests specifically exercise the case Halloween's own
 * tests above can't: a Draft whose OWN persisted `deadlineAt` does NOT
 * coincide with the event's real occurrence end.
 */
describe("finalizeExpiredEventDraftIfNeeded — January (fixedEventDeadline via recomputed occurrence bounds, not the Draft's own deadlineAt)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  function januaryDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
    return baseDraft({
      id: "january-draft-1",
      sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
      sourceEventManuallyEnabled: false,
      startedAt: "2026-01-26T00:00:00.000Z",
      // Deliberately a normal, profile-chosen deadline that extends WELL
      // past the January event's own 1 February 00:00 window close — this
      // is the exact case Halloween's bespoke draft-creation service never
      // produces (its own Draft's `deadlineAt` is always pinned to the
      // occurrence's end at creation time), but which is completely normal
      // for a January Draft created through the generic `createLocalDraft`.
      deadlineAt: "2026-03-01T00:00:00.000Z",
      ...overrides,
    });
  }

  function januaryItem(
    overrides: Partial<DraftItemRecord> & { id: string; filmId: string },
  ): DraftItemRecord {
    return {
      draftId: "january-draft-1",
      watchlistEntryId: null,
      source: "manual",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: 0,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      originFilmId: null,
      substitutionReason: null,
      createdAt: "2026-01-26T00:00:00.000Z",
      ...overrides,
    };
  }

  it("finalises an active January Draft once the EVENT's own occurrence has closed, even though the Draft's own deadlineAt is still far in the future", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(januaryDraft());
    await repos.drafts.createItems([
      januaryItem({ id: "item-1", filmId: "film-1", isCompleted: true }),
      januaryItem({ id: "item-2", filmId: "film-2", isCompleted: false }),
    ]);

    const finalized = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock: new FixedClock(new Date("2026-02-01T00:00:01.000Z")) },
    );

    expect(finalized).toBe(true);
    const draft = await repos.drafts.getById(PROFILE_ID, "january-draft-1");
    expect(draft?.status).toBe("expired");
    const items = await repos.drafts.listItemsForDraft("january-draft-1");
    expect(items.find((i) => i.id === "item-1")?.isCompleted).toBe(true);
    expect(items.find((i) => i.id === "item-2")?.isCompleted).toBe(false);
  });

  it("does nothing before January's own occurrence has closed, regardless of the Draft's own (much later) deadlineAt", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(januaryDraft());
    await repos.drafts.createItems([
      januaryItem({ id: "item-1", filmId: "film-1" }),
    ]);

    const finalized = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock: new FixedClock(new Date("2026-01-31T23:59:00.000Z")) },
    );

    expect(finalized).toBe(false);
    const draft = await repos.drafts.getById(PROFILE_ID, "january-draft-1");
    expect(draft?.status).toBe("active");
  });

  it("is idempotent for January the same way it is for Halloween", async () => {
    db = new FDraftLocalDatabase(`ending-lifecycle-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await repos.drafts.createDraft(januaryDraft());
    await repos.drafts.createItems([
      januaryItem({ id: "item-1", filmId: "film-1" }),
    ]);
    const clock = new FixedClock(new Date("2026-02-01T00:00:01.000Z"));

    await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock },
    );
    const secondCall = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock },
    );

    expect(secondCall).toBe(false);
  });
});
