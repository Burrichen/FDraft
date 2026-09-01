import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_STUDIO_PRESET_ID,
  getEventStudioPresets,
} from "./event-studio-presets";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";

beforeAll(async () => {
  // Registers Christmas (and Halloween a second time, harmlessly) into
  // the shared Event Art registry — same precondition
  // `event-art-system-preview-section.test.tsx` already establishes for
  // `listRegisteredEventIds()` to see anything at all.
  await import("@/components/events/register-event-art");
});

describe("getEventStudioPresets — discovered from the central Event registry (EVENT STUDIO — PHASE 2 §9)", () => {
  it("includes the exact minimum required set: Default, January, Halloween, Christmas", () => {
    const presets = getEventStudioPresets();
    const ids = presets.map((p) => p.id);
    expect(ids).toContain(DEFAULT_EVENT_STUDIO_PRESET_ID);
    expect(ids).toContain(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(ids).toContain(HALLOWEEN_EVENT_ID);
    expect(ids).toContain("christmas");
  });

  it("labels Default and the real events with their real display names", () => {
    const presets = getEventStudioPresets();
    const byId = new Map(presets.map((p) => [p.id, p.label]));
    expect(byId.get(DEFAULT_EVENT_STUDIO_PRESET_ID)).toBe("Default");
    expect(byId.get(HALLOWEEN_EVENT_ID)).toBe("Halloween");
    expect(byId.get(F_YOU_ITS_JANUARY_EVENT_ID)).toBe("F* You, It's January!");
  });

  it("never lists the same id twice, even though Halloween is both a real EventDefinition and separately Event-Art-registered", () => {
    const presets = getEventStudioPresets();
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Default is always first", () => {
    const presets = getEventStudioPresets();
    expect(presets[0]?.id).toBe(DEFAULT_EVENT_STUDIO_PRESET_ID);
  });
});
