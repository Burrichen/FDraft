import { describe, expect, it } from "vitest";
import { FixedClock, SystemClock } from "./clock";

describe("SystemClock", () => {
  it("returns a Date close to the real current time", () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe("FixedClock", () => {
  it("always returns the same instant until advanced", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("advance() moves the clock forward by the given number of milliseconds", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    clock.advance(24 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("advance() can move the clock backward with a negative delta", () => {
    const clock = new FixedClock(new Date("2026-01-02T00:00:00.000Z"));
    clock.advance(-24 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("set() replaces the instant outright", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    clock.set(new Date("2030-06-15T12:00:00.000Z"));
    expect(clock.now().toISOString()).toBe("2030-06-15T12:00:00.000Z");
  });

  it("returns a defensive copy — mutating the returned Date never affects the clock", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const first = clock.now();
    first.setFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
