import { describe, expect, it } from "vitest";
import {
  canFinalizeOneAtATimeDraft,
  isFilmAlreadyStaged,
  removeStagedOneAtATimeItem,
  stageOneAtATimeItem,
  type OneAtATimeStagedItem,
} from "./one-at-a-time";

function item(
  overrides: Partial<OneAtATimeStagedItem> = {},
): OneAtATimeStagedItem {
  return {
    localId: "local-1",
    filmId: "film-1",
    watchlistEntryId: "entry-1",
    source: "random",
    challengeId: null,
    challengeDisplayValue: null,
    title: "Some Film",
    releaseYear: 2020,
    posterUrl: null,
    ...overrides,
  };
}

describe("isFilmAlreadyStaged", () => {
  it("is false against an empty list", () => {
    expect(isFilmAlreadyStaged([], "film-1")).toBe(false);
  });

  it("is true once a matching filmId is staged", () => {
    expect(isFilmAlreadyStaged([item()], "film-1")).toBe(true);
  });

  it("only compares filmId, never title", () => {
    const staged = [item({ filmId: "film-1", title: "Same Title" })];
    expect(isFilmAlreadyStaged(staged, "film-2")).toBe(false);
  });
});

describe("stageOneAtATimeItem", () => {
  it("appends to an empty list", () => {
    const result = stageOneAtATimeItem([], item());
    expect(result).toEqual({ ok: true, staged: [item()] });
  });

  it("appends to an existing list, preserving order", () => {
    const first = item({ localId: "a", filmId: "film-a" });
    const second = item({ localId: "b", filmId: "film-b" });
    const result = stageOneAtATimeItem([first], second);
    expect(result.ok).toBe(true);
    expect(result.ok && result.staged.map((i) => i.localId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("rejects a duplicate filmId, even from a different source", () => {
    const staged = [item({ filmId: "film-1", source: "random" })];
    const result = stageOneAtATimeItem(
      staged,
      item({ localId: "b", filmId: "film-1", source: "manual" }),
    );
    expect(result).toEqual({ ok: false, error: "duplicate_film" });
  });

  it("never mutates the input array", () => {
    const staged = [item()];
    stageOneAtATimeItem(staged, item({ localId: "b", filmId: "film-2" }));
    expect(staged).toHaveLength(1);
  });
});

describe("removeStagedOneAtATimeItem", () => {
  it("removes exactly the matching localId", () => {
    const staged = [
      item({ localId: "a", filmId: "film-a" }),
      item({ localId: "b", filmId: "film-b" }),
    ];
    const result = removeStagedOneAtATimeItem(staged, "a");
    expect(result.map((i) => i.localId)).toEqual(["b"]);
  });

  it("is a no-op for an unknown localId", () => {
    const staged = [item()];
    expect(removeStagedOneAtATimeItem(staged, "unknown")).toEqual(staged);
  });
});

describe("canFinalizeOneAtATimeDraft", () => {
  it("is false with nothing staged", () => {
    expect(canFinalizeOneAtATimeDraft([])).toBe(false);
  });

  it("is true with exactly one staged film", () => {
    expect(canFinalizeOneAtATimeDraft([item()])).toBe(true);
  });

  it("is true with many staged films", () => {
    const staged = Array.from({ length: 17 }, (_, index) =>
      item({ localId: `local-${index}`, filmId: `film-${index}` }),
    );
    expect(canFinalizeOneAtATimeDraft(staged)).toBe(true);
  });
});
