import { describe, expect, it } from "vitest";
import {
  CREATABLE_DIFFICULTY_ORDER,
  DIFFICULTIES,
  FREEFORM_BATCH_SIZE,
  getFilmCount,
  isCreatableDraftDifficulty,
  isDraftDifficulty,
  isFreeform,
} from "./difficulty";

describe("DIFFICULTIES", () => {
  it("matches the film counts defined in the product spec", () => {
    expect(getFilmCount("baby")).toBe(5);
    expect(getFilmCount("easy")).toBe(8);
    expect(getFilmCount("medium")).toBe(10);
    expect(getFilmCount("hard")).toBe(12);
    expect(getFilmCount("hardcore")).toBe(20);
  });

  // Freeform is retired as a creation mode (see product-spec.md, "FREEFORM
  // MODE") but kept as a legacy value so historical Freeform drafts still
  // load and render in History — these fields/helpers must keep working.
  it("marks freeform as having no fixed film count", () => {
    expect(DIFFICULTIES.freeform.filmCount).toBeNull();
    expect(isFreeform("freeform")).toBe(true);
    expect(isFreeform("medium")).toBe(false);
  });

  it("throws when asking for freeform's fixed film count", () => {
    expect(() => getFilmCount("freeform")).toThrow();
  });

  it("generates films in batches of five for freeform", () => {
    expect(FREEFORM_BATCH_SIZE).toBe(5);
  });
});

describe("isDraftDifficulty vs isCreatableDraftDifficulty", () => {
  it("isDraftDifficulty accepts legacy 'freeform'", () => {
    expect(isDraftDifficulty("freeform")).toBe(true);
  });

  it("isCreatableDraftDifficulty rejects 'freeform' — cannot start a new one", () => {
    expect(isCreatableDraftDifficulty("freeform")).toBe(false);
    expect(CREATABLE_DIFFICULTY_ORDER).not.toContain("freeform");
  });

  it("isCreatableDraftDifficulty accepts every fixed difficulty and one-at-a-time", () => {
    expect(isCreatableDraftDifficulty("baby")).toBe(true);
    expect(isCreatableDraftDifficulty("easy")).toBe(true);
    expect(isCreatableDraftDifficulty("medium")).toBe(true);
    expect(isCreatableDraftDifficulty("hard")).toBe(true);
    expect(isCreatableDraftDifficulty("hardcore")).toBe(true);
    expect(isCreatableDraftDifficulty("one-at-a-time")).toBe(true);
  });
});
