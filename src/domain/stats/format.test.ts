import { describe, expect, it } from "vitest";
import { formatRuntimeMinutes } from "./format";

describe("formatRuntimeMinutes", () => {
  it.each([
    [0, "0m"],
    [45, "45m"],
    [60, "1h"],
    [90, "1h 30m"],
    [125, "2h 5m"],
    [600, "10h"],
  ] as const)("%i minutes -> %s", (minutes, expected) => {
    expect(formatRuntimeMinutes(minutes)).toBe(expected);
  });
});
