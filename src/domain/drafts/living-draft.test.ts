import { describe, expect, it } from "vitest";
import type {
  DraftItemRecord,
  DraftMutationRecord,
  DraftRecord,
} from "@/repositories/records";
import {
  MAX_DRAFT_FILMS,
  MAX_DRAFT_MUTATION_HISTORY,
  appendDraftMutation,
  dropNewestDraftMutation,
  hasDraftChangedSize,
  resolveCurrentDraftFilmCount,
  resolveDraftCapacity,
  resolveDraftItemEntrySource,
  resolveDraftUndoAvailability,
  resolveOriginalTargetFilms,
  resolveStagedEntrySource,
  resolveUndoableDraftMutation,
  snapshotDraftItem,
} from "./living-draft";

function item(overrides: Partial<DraftItemRecord> = {}): DraftItemRecord {
  return {
    id: "item-1",
    draftId: "draft-1",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "draft-1",
    profileId: "alex",
    difficulty: "medium",
    timeMode: "timer",
    status: "active",
    totalFilms: 10,
    randomFilmCount: 10,
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
  };
}

function mutation(id: string): DraftMutationRecord {
  return {
    id,
    kind: "add",
    at: "2026-01-02T00:00:00.000Z",
    draftItemId: `item-${id}`,
    previousItem: null,
  };
}

/**
 * Covers docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §1/§3/§5's pure
 * domain rules. The persistence and mutation halves live in
 * `local-draft-service.test.ts` and `living-draft-mutations.test.ts`.
 */
describe("draft capacity (§3)", () => {
  it("caps a Draft at 30 films", () => {
    expect(MAX_DRAFT_FILMS).toBe(30);
    expect(resolveDraftCapacity(29)).toMatchObject({
      canAddFilm: true,
      remaining: 1,
      refusal: null,
    });
    expect(resolveDraftCapacity(30)).toMatchObject({
      canAddFilm: false,
      remaining: 0,
      refusal: "at_capacity",
    });
  });

  it("never reports negative headroom, even for a Draft already over the cap", () => {
    expect(resolveDraftCapacity(35)).toMatchObject({
      canAddFilm: false,
      remaining: 0,
    });
  });

  it("counts current size from the items, not the draft's denormalised total", () => {
    expect(
      resolveCurrentDraftFilmCount([item({ id: "a" }), item({ id: "b" })]),
    ).toBe(2);
  });
});

describe("original target vs current size (§3)", () => {
  it("keeps the original target when a Draft grows", () => {
    const grown = draft({ originalTargetFilms: 10, totalFilms: 14 });
    expect(resolveOriginalTargetFilms(grown)).toBe(10);
    expect(grown.difficulty).toBe("medium");
  });

  it("derives a legacy Draft's target from its difficulty, not its current size", () => {
    // A pre-v1.2.1 Medium draft that has since been added to: 10, never 14.
    const legacy = draft({ originalTargetFilms: null, totalFilms: 14 });
    expect(resolveOriginalTargetFilms(legacy)).toBe(10);
  });

  it("falls back to the recorded size only for difficulties with no fixed count", () => {
    expect(
      resolveOriginalTargetFilms(
        draft({
          difficulty: "one-at-a-time",
          originalTargetFilms: null,
          totalFilms: 7,
        }),
      ),
    ).toBe(7);
    expect(
      resolveOriginalTargetFilms(
        draft({
          difficulty: "freeform",
          originalTargetFilms: null,
          totalFilms: 15,
        }),
      ),
    ).toBe(15);
  });

  it("reports whether a Draft has changed size", () => {
    const base = draft({ originalTargetFilms: 2 });
    expect(
      hasDraftChangedSize(base, [item({ id: "a" }), item({ id: "b" })]),
    ).toBe(false);
    expect(
      hasDraftChangedSize(base, [
        item({ id: "a" }),
        item({ id: "b" }),
        item({ id: "c" }),
      ]),
    ).toBe(true);
  });
});

describe("mutation history (§5)", () => {
  it("retains only the five most recent entries, discarding the oldest", () => {
    expect(MAX_DRAFT_MUTATION_HISTORY).toBe(5);
    let history: DraftMutationRecord[] = [];
    for (const id of ["1", "2", "3", "4", "5", "6", "7"]) {
      history = appendDraftMutation(history, mutation(id));
    }
    expect(history).toHaveLength(5);
    expect(history.map((entry) => entry.id)).toEqual(["3", "4", "5", "6", "7"]);
  });

  it("undo targets the newest entry, and dropping it exposes the one before", () => {
    const history = [mutation("1"), mutation("2")];
    expect(
      resolveUndoableDraftMutation(draft({ mutationHistory: history }))?.id,
    ).toBe("2");
    const remaining = dropNewestDraftMutation(history);
    expect(remaining.map((entry) => entry.id)).toEqual(["1"]);
    expect(dropNewestDraftMutation([])).toEqual([]);
  });

  it("treats a legacy Draft with no history as having nothing to undo", () => {
    expect(
      resolveUndoableDraftMutation(draft({ mutationHistory: null })),
    ).toBeNull();
    expect(
      resolveUndoableDraftMutation(draft({ mutationHistory: undefined })),
    ).toBeNull();
  });

  it("snapshots the reversible fields, and deliberately no watched state", () => {
    const snapshot = snapshotDraftItem(
      item({
        isCompleted: true,
        completedAt: "2026-01-05T00:00:00.000Z",
        watchedHistoryId: "history-1",
        challengeId: "runtime-under-90",
        entrySource: "challenge",
        enteredAt: "2026-01-03T00:00:00.000Z",
      }),
    );
    expect(snapshot).toEqual({
      filmId: "film-1",
      watchlistEntryId: "entry-1",
      source: "random",
      entrySource: "challenge",
      enteredAt: "2026-01-03T00:00:00.000Z",
      challengeId: "runtime-under-90",
      challengeAttemptId: null,
      challengeDisplayValue: null,
      originFilmId: null,
      substitutionReason: null,
      eventCategoryKey: null,
      orderIndex: 0,
    });
    expect(snapshot).not.toHaveProperty("isCompleted");
    expect(snapshot).not.toHaveProperty("watchedHistoryId");
  });
});

describe("undo availability — shared by the service and the UI (§5)", () => {
  it("offers the newest mutation on an active Draft", () => {
    const history = [mutation("1"), mutation("2")];
    expect(
      resolveDraftUndoAvailability(
        draft({ status: "active", mutationHistory: history }),
      ),
    ).toEqual({ canUndo: true, mutation: history[1], refusal: null });
  });

  it("still offers it on a completed Draft, which is what §6 is written for", () => {
    // Watching the last outstanding film is what archives a Draft, so
    // refusing archived Drafts would make "I added that by mistake"
    // unfixable in exactly the case that needs undoing.
    expect(
      resolveDraftUndoAvailability(
        draft({ status: "archived", mutationHistory: [mutation("1")] }),
      ).canUndo,
    ).toBe(true);
  });

  it("refuses a Draft whose membership nobody is editing any more", () => {
    for (const status of ["expired", "discarded"] as const) {
      expect(
        resolveDraftUndoAvailability(
          draft({ status, mutationHistory: [mutation("1")] }),
        ),
      ).toEqual({
        canUndo: false,
        mutation: null,
        refusal: "draft_not_undoable",
      });
    }
  });

  it("distinguishes 'nothing to undo' from 'not undoable', so the UI can word it", () => {
    expect(
      resolveDraftUndoAvailability(
        draft({ status: "active", mutationHistory: [] }),
      ),
    ).toEqual({ canUndo: false, mutation: null, refusal: "nothing_to_undo" });
  });
});

describe("entry source derivation — legacy backfill (§1)", () => {
  it("prefers a stored entrySource over any inference", () => {
    expect(
      resolveDraftItemEntrySource(
        item({ entrySource: "manual_add", source: "random" }),
      ),
    ).toBe("manual_add");
  });

  it("recovers manual replacement and reroll from the substitution reason", () => {
    expect(
      resolveDraftItemEntrySource(
        item({ substitutionReason: "manual_replace" }),
      ),
    ).toBe("manual_replace");
    expect(
      resolveDraftItemEntrySource(item({ substitutionReason: "user_reroll" })),
    ).toBe("reroll");
    expect(
      resolveDraftItemEntrySource(
        item({ substitutionReason: "missing_metadata" }),
      ),
    ).toBe("reroll");
  });

  it("treats an engine franchise-order correction as still-random, not a reroll", () => {
    expect(
      resolveDraftItemEntrySource(
        item({ substitutionReason: "franchise_order", originFilmId: "film-0" }),
      ),
    ).toBe("random");
  });

  it("recognises Halloween's pool sources, and any curated category, as Event films", () => {
    for (const source of ["halloween-adjacent", "horror", "kitsch"] as const) {
      expect(resolveDraftItemEntrySource(item({ source }))).toBe("event");
    }
    expect(
      resolveDraftItemEntrySource(
        item({ source: "random", eventCategoryKey: "classic" }),
      ),
    ).toBe("event");
  });

  it("recognises an Event draft's own plain-random picks as Event films, given the draft", () => {
    // January/Christmas write `source: "random"` with no category for
    // their own curated picks — only the owning draft reveals them.
    expect(
      resolveDraftItemEntrySource(item({ source: "random" }), {
        sourceEventId: "f-you-its-january",
      }),
    ).toBe("event");
    expect(
      resolveDraftItemEntrySource(item({ source: "random" }), {
        sourceEventId: null,
      }),
    ).toBe("random");
  });

  it("maps challenge across, and defaults the ambiguous legacy 'manual' to diy", () => {
    expect(resolveDraftItemEntrySource(item({ source: "challenge" }))).toBe(
      "challenge",
    );
    // DIY selection and post-creation manual adds both wrote `"manual"`;
    // `"diy"` is the documented safe default rather than a guess that
    // could overstate manual adds.
    expect(resolveDraftItemEntrySource(item({ source: "manual" }))).toBe("diy");
  });
});

describe("staged (One At A Time) entry sources (§1)", () => {
  it("never invents a one_at_a_time source — each staged film keeps a real one", () => {
    expect(resolveStagedEntrySource("random", { forEvent: false })).toBe(
      "random",
    );
    expect(resolveStagedEntrySource("manual", { forEvent: false })).toBe("diy");
    expect(resolveStagedEntrySource("challenge", { forEvent: false })).toBe(
      "challenge",
    );
  });

  it("collapses every pick in an Event builder to event, however it was staged", () => {
    for (const source of ["random", "manual", "challenge"] as const) {
      expect(resolveStagedEntrySource(source, { forEvent: true })).toBe(
        "event",
      );
    }
  });
});
