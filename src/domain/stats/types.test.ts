import { describe, expect, it } from "vitest";
import { allAvailable, availableStat, unavailableStat } from "./types";

describe("Stat<T> helpers", () => {
  it("wraps a value as available", () => {
    const stat = availableStat(42);
    expect(stat).toEqual({ available: true, value: 42 });
  });

  it("wraps a missing value with a reason", () => {
    const stat = unavailableStat("no runtime data from any provider");
    expect(stat.available).toBe(false);
    if (!stat.available) {
      expect(stat.reason).toBe("no runtime data from any provider");
    }
  });

  it("allAvailable is true only when every stat is available", () => {
    expect(allAvailable([availableStat(1), availableStat(2)])).toBe(true);
    expect(allAvailable([availableStat(1), unavailableStat("missing")])).toBe(
      false,
    );
    expect(allAvailable([])).toBe(true);
  });
});
