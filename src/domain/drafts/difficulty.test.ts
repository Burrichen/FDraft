import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES,
  FREEFORM_BATCH_SIZE,
  getFilmCount,
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
