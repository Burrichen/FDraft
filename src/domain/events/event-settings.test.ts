import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_SETTINGS, resolveEventSettings } from "./event-settings";

describe("resolveEventSettings", () => {
  it("defaults to fully off/empty for null (no profile has ever saved this yet)", () => {
    expect(resolveEventSettings(null)).toEqual(DEFAULT_EVENT_SETTINGS);
  });

  it("defaults for undefined and non-object values, rather than throwing", () => {
    expect(resolveEventSettings(undefined)).toEqual(DEFAULT_EVENT_SETTINGS);
    expect(resolveEventSettings("not-an-object")).toEqual(
      DEFAULT_EVENT_SETTINGS,
    );
    expect(resolveEventSettings(42)).toEqual(DEFAULT_EVENT_SETTINGS);
  });

  it("passes through a fully-formed, valid value unchanged", () => {
    const value = {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: "signal-from-beyond",
      manuallyEnabledEvents: ["signal-from-beyond"],
    };
    expect(resolveEventSettings(value)).toEqual(value);
  });

  it("defaults each field independently when only some are present", () => {
    expect(resolveEventSettings({ eventsEnabled: true })).toEqual({
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
    });
  });

  it("falls back to defaults for a field of the wrong type, without discarding the rest", () => {
    expect(
      resolveEventSettings({
        eventsEnabled: "yes" as unknown,
        eventVisualsEnabled: true,
        activeEvent: 123 as unknown,
        manuallyEnabledEvents: "not-an-array" as unknown,
      }),
    ).toEqual({
      eventsEnabled: false,
      eventVisualsEnabled: true,
      activeEvent: null,
      manuallyEnabledEvents: [],
    });
  });

  it("drops non-string entries from manuallyEnabledEvents rather than failing the whole array", () => {
    expect(
      resolveEventSettings({
        manuallyEnabledEvents: ["real-event", 42, null, "another-event"],
      }),
    ).toEqual({
      ...DEFAULT_EVENT_SETTINGS,
      manuallyEnabledEvents: ["real-event", "another-event"],
    });
  });
});
