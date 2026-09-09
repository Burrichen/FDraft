import { afterEach, describe, expect, it } from "vitest";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import { createLocalRepositories } from "./create-local-repositories";
import { FDraftLocalDatabase } from "./database";

const PROFILE_ID = "alex";

/**
 * A row exactly as a pre-v1.2.1 build wrote it, cast at the boundary
 * because the current types no longer describe it — which is the point:
 * these fields did not exist when it was written.
 */
function legacyDraftRow(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "legacy-draft",
    profileId: PROFILE_ID,
    difficulty: "hard",
    timeMode: "timer",
    status: "active",
    totalFilms: 12,
    randomFilmCount: 12,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    deadlineAt: "2026-02-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    customName: null,
    eventOccurrenceYear: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as DraftRecord;
}

function legacyItemRow(
  overrides: Partial<DraftItemRecord> = {},
): DraftItemRecord {
  return {
    id: "legacy-item",
    draftId: "legacy-draft",
    filmId: "film-1",
    watchlistEntryId: "entry-1",
    source: "random",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    createdAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  } as DraftItemRecord;
}

/**
 * The read-boundary net behind the v6 schema migration (see
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §1). The migration handles
 * every row an existing install already had; this handles rows that arrive
 * afterwards without those fields — a restored backup, a partially-migrated
 * import — so `undefined` never leaks into the app.
 */
describe("LocalDraftRepository — Living Drafts normalization", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("fills in a legacy Draft's original target and empty mutation history on read", async () => {
    db = new FDraftLocalDatabase(`draft-repo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // Written straight to the table, bypassing the repository — the only
    // way to produce a row the migration never saw.
    await db.drafts.add(legacyDraftRow());

    const draft = await repos.drafts.getById(PROFILE_ID, "legacy-draft");
    expect(draft?.originalTargetFilms).toBeNull();
    expect(draft?.mutationHistory).toEqual([]);
    // Read-time normalization deliberately does NOT guess a target from
    // the difficulty — that is the migration's job, and
    // `resolveOriginalTargetFilms` derives it on demand. What matters here
    // is that the field is never `undefined`.
    expect(draft).toHaveProperty("originalTargetFilms");
  });

  it("derives a legacy item's entry source and entry time on read", async () => {
    db = new FDraftLocalDatabase(`draft-repo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await db.drafts.add(legacyDraftRow());
    await db.draftItems.bulkAdd([
      legacyItemRow({ id: "a", source: "random" }),
      legacyItemRow({ id: "b", source: "manual" }),
      legacyItemRow({
        id: "c",
        source: "challenge",
        challengeId: "no-homework",
      }),
      legacyItemRow({
        id: "d",
        source: "random",
        substitutionReason: "user_reroll",
      }),
    ]);

    const items = await repos.drafts.listItemsForDraft("legacy-draft");
    expect(
      Object.fromEntries(items.map((item) => [item.id, item.entrySource])),
    ).toEqual({
      a: "random",
      b: "diy",
      c: "challenge",
      d: "reroll",
    });
    // `enteredAt` falls back to the row's creation time.
    expect(
      items.every((item) => item.enteredAt === "2026-01-05T00:00:00.000Z"),
    ).toBe(true);

    // Single-item reads normalize identically — no surface returns a raw row.
    const single = await repos.drafts.getItemById("b");
    expect(single?.entrySource).toBe("diy");
    expect(single?.enteredAt).toBe("2026-01-05T00:00:00.000Z");
  });
});

describe("LocalDraftRepository.deleteItem", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("removes the item and cascades its postmortem response, leaving other items alone", async () => {
    db = new FDraftLocalDatabase(`draft-repo-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await db.drafts.add(legacyDraftRow());
    await db.draftItems.bulkAdd([
      legacyItemRow({ id: "doomed" }),
      legacyItemRow({ id: "kept", filmId: "film-2", orderIndex: 1 }),
    ]);
    // The postmortem row is uniquely keyed by item, so an orphan would
    // block a later response for a reused slot.
    await repos.history.addPostmortemResponse({
      id: "pm-1",
      draftId: "legacy-draft",
      draftItemId: "doomed",
      response: "not_interested",
      appliedAt: "2026-01-06T00:00:00.000Z",
      createdAt: "2026-01-06T00:00:00.000Z",
    });
    expect(
      await repos.history.getPostmortemResponseForItem("doomed"),
    ).not.toBeNull();

    await repos.drafts.deleteItem("doomed");

    expect(await repos.drafts.getItemById("doomed")).toBeNull();
    expect(
      await repos.history.getPostmortemResponseForItem("doomed"),
    ).toBeNull();
    expect(await repos.drafts.getItemById("kept")).not.toBeNull();
    // Only the item is removed — the Draft itself is untouched.
    expect(
      await repos.drafts.getById(PROFILE_ID, "legacy-draft"),
    ).not.toBeNull();
  });
});
