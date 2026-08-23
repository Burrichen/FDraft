import { describe, expect, it } from "vitest";
import { FixedClock } from "@/domain/time/clock";
import {
  createProfile,
  DEFAULT_PROFILE_SETTINGS,
  InvalidProfileNameError,
  nextHalloweenPumpkinState,
  resolveHalloweenPumpkinState,
  touchLastOpened,
} from "./profile";

function fakeIdGenerator(id: string) {
  return { generate: () => id };
}

describe("createProfile", () => {
  it("builds a profile with a stable id, trimmed name, and default settings", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const profile = createProfile(
      {
        displayName: "  Alex  ",
        timezone: "Europe/London",
        currentSchemaVersion: 1,
      },
      { idGenerator: fakeIdGenerator("profile-1"), clock },
    );

    expect(profile).toEqual({
      id: "profile-1",
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: "Europe/London",
      settings: DEFAULT_PROFILE_SETTINGS,
      dataVersion: 1,
    });
  });

  it("stamps dataVersion from the caller-supplied schema version, never a hardcoded constant", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const profile = createProfile(
      { displayName: "Sam", timezone: "UTC", currentSchemaVersion: 7 },
      { idGenerator: fakeIdGenerator("profile-2"), clock },
    );
    expect(profile.dataVersion).toBe(7);
  });

  it("rejects an empty display name", () => {
    const clock = new FixedClock(new Date());
    expect(() =>
      createProfile(
        { displayName: "   ", timezone: "UTC", currentSchemaVersion: 1 },
        { idGenerator: fakeIdGenerator("x"), clock },
      ),
    ).toThrow(InvalidProfileNameError);
  });

  it("gives each call whatever id the generator produces — never reuses ids across calls", () => {
    const clock = new FixedClock(new Date());
    let counter = 0;
    const idGenerator = { generate: () => `profile-${++counter}` };
    const first = createProfile(
      { displayName: "Alex", timezone: "UTC", currentSchemaVersion: 1 },
      { idGenerator, clock },
    );
    const second = createProfile(
      { displayName: "Sam", timezone: "UTC", currentSchemaVersion: 1 },
      { idGenerator, clock },
    );
    expect(first.id).not.toBe(second.id);
  });
});

describe("touchLastOpened", () => {
  it("bumps lastOpenedAt to the clock's current time without touching other fields", () => {
    const createdClock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const profile = createProfile(
      { displayName: "Alex", timezone: "UTC", currentSchemaVersion: 1 },
      { idGenerator: fakeIdGenerator("profile-1"), clock: createdClock },
    );

    const laterClock = new FixedClock(new Date("2026-03-15T09:30:00.000Z"));
    const touched = touchLastOpened(profile, laterClock);

    expect(touched.lastOpenedAt).toBe("2026-03-15T09:30:00.000Z");
    expect(touched.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(touched.id).toBe(profile.id);
  });

  it("does not mutate the original profile object", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const profile = createProfile(
      { displayName: "Alex", timezone: "UTC", currentSchemaVersion: 1 },
      { idGenerator: fakeIdGenerator("profile-1"), clock },
    );
    touchLastOpened(
      profile,
      new FixedClock(new Date("2026-06-01T00:00:00.000Z")),
    );
    expect(profile.lastOpenedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("resolveHalloweenPumpkinState", () => {
  it("passes through a valid value", () => {
    expect(resolveHalloweenPumpkinState("carved")).toBe("carved");
    expect(resolveHalloweenPumpkinState("lit")).toBe("lit");
    expect(resolveHalloweenPumpkinState("rotting")).toBe("rotting");
  });

  it("falls back to 'uncarved' for undefined, garbage, or a pre-existing profile record", () => {
    expect(resolveHalloweenPumpkinState(undefined)).toBe("uncarved");
    expect(resolveHalloweenPumpkinState(null)).toBe("uncarved");
    expect(resolveHalloweenPumpkinState("not-a-real-state")).toBe("uncarved");
    expect(resolveHalloweenPumpkinState(42)).toBe("uncarved");
  });
});

describe("nextHalloweenPumpkinState", () => {
  it("cycles uncarved → carved → lit → rotting → uncarved", () => {
    expect(nextHalloweenPumpkinState("uncarved")).toBe("carved");
    expect(nextHalloweenPumpkinState("carved")).toBe("lit");
    expect(nextHalloweenPumpkinState("lit")).toBe("rotting");
    expect(nextHalloweenPumpkinState("rotting")).toBe("uncarved");
  });
});
