import { describe, expect, it } from "vitest";
import { EVENT_DEFINITIONS, getEventDefinition } from "./event-registry";

describe("event-registry", () => {
  it("starts empty — no real event is defined by this phase", () => {
    expect(EVENT_DEFINITIONS).toEqual([]);
  });

  it("getEventDefinition returns null for any id, since none are registered", () => {
    expect(getEventDefinition("f-you-its-january")).toBeNull();
    expect(getEventDefinition("anything")).toBeNull();
  });
});
