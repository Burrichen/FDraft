import { describe, expect, it } from "vitest";
import { compareNullsLast } from "./sort";

const numericAsc = (a: number, b: number) => a - b;

describe("compareNullsLast", () => {
  it("orders known values ascending when asked", () => {
    expect(compareNullsLast(1, 2, "asc", numericAsc)).toBeLessThan(0);
    expect(compareNullsLast(2, 1, "asc", numericAsc)).toBeGreaterThan(0);
  });

  it("orders known values descending when asked", () => {
    expect(compareNullsLast(1, 2, "desc", numericAsc)).toBeGreaterThan(0);
    expect(compareNullsLast(2, 1, "desc", numericAsc)).toBeLessThan(0);
  });

  it("treats two equal known values as equal", () => {
    // `=== 0`, not `.toBe(0)` — negating a `0` comparator result for
    // "desc" legitimately produces `-0`, which is `=== 0` but fails
    // `Object.is`-based equality; both are a correct "equal" signal to
    // `Array.prototype.sort`.
    expect(compareNullsLast(5, 5, "asc", numericAsc) === 0).toBe(true);
    expect(compareNullsLast(5, 5, "desc", numericAsc) === 0).toBe(true);
  });

  it("pushes a single null to the end regardless of direction", () => {
    expect(compareNullsLast(null, 1, "asc", numericAsc)).toBeGreaterThan(0);
    expect(compareNullsLast(1, null, "asc", numericAsc)).toBeLessThan(0);
    expect(compareNullsLast(null, 1, "desc", numericAsc)).toBeGreaterThan(0);
    expect(compareNullsLast(1, null, "desc", numericAsc)).toBeLessThan(0);
  });

  it("treats two nulls as equal", () => {
    expect(compareNullsLast(null, null, "asc", numericAsc)).toBe(0);
    expect(compareNullsLast(null, null, "desc", numericAsc)).toBe(0);
  });

  it("works with a string comparator too", () => {
    const stringAsc = (a: string, b: string) => a.localeCompare(b);
    expect(compareNullsLast("a", "b", "asc", stringAsc)).toBeLessThan(0);
    expect(compareNullsLast(null, "a", "asc", stringAsc)).toBeGreaterThan(0);
  });
});
