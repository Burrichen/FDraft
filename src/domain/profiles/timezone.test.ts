import { describe, expect, it } from "vitest";
import { isValidTimezone, resolveProfileTimezone } from "./timezone";

describe("isValidTimezone", () => {
  it("accepts a real IANA zone", () => {
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("accepts UTC", () => {
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("rejects a well-formed but nonexistent zone — a regex-only check couldn't catch this", () => {
    expect(isValidTimezone("Europe/Nonexistent")).toBe(false);
  });

  it("rejects garbage, empty, and non-string values", () => {
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("not a timezone")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});

describe("resolveProfileTimezone", () => {
  it("passes a valid timezone through unchanged", () => {
    expect(resolveProfileTimezone("Europe/London")).toBe("Europe/London");
  });

  it("falls back to the device's own current timezone for an invalid/corrupted value — never crashes, never invents a fake zone", () => {
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveProfileTimezone("Not/AZone")).toBe(fallback);
    expect(resolveProfileTimezone("")).toBe(fallback);
    expect(resolveProfileTimezone(undefined)).toBe(fallback);
    expect(resolveProfileTimezone(null)).toBe(fallback);
  });
});
