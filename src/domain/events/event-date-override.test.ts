import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_DATE_OVERRIDE,
  resolveEventDateOverride,
} from "./event-date-override";

describe("resolveEventDateOverride", () => {
  it("defaults to off/empty for null (no profile has ever saved this yet)", () => {
    expect(resolveEventDateOverride(null)).toEqual(DEFAULT_EVENT_DATE_OVERRIDE);
  });

  it("defaults for undefined and non-object values, rather than throwing", () => {
    expect(resolveEventDateOverride(undefined)).toEqual(
      DEFAULT_EVENT_DATE_OVERRIDE,
    );
    expect(resolveEventDateOverride("not-an-object")).toEqual(
      DEFAULT_EVENT_DATE_OVERRIDE,
    );
    expect(resolveEventDateOverride(42)).toEqual(DEFAULT_EVENT_DATE_OVERRIDE);
  });

  it("passes through a fully-formed, valid value unchanged", () => {
    const value = {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "2026-10-15T20:00:00.000Z",
    };
    expect(resolveEventDateOverride(value)).toEqual(value);
  });

  it("defaults each field independently when only some are present", () => {
    expect(resolveEventDateOverride({ enabled: true })).toEqual({
      ...DEFAULT_EVENT_DATE_OVERRIDE,
      enabled: true,
    });
  });

  it("falls back to defaults for a field of the wrong type, without discarding the rest", () => {
    expect(
      resolveEventDateOverride({
        enabled: "yes" as unknown,
        eventId: 123 as unknown,
        simulatedDate: "2026-10-15T20:00:00.000Z",
      }),
    ).toEqual({
      enabled: false,
      eventId: null,
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });
  });
});
