import { describe, expect, it } from "vitest";
import { resolveEventDraftAdditionPolicy } from "./event-draft-additions";
import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  getEventDefinition,
} from "./event-registry";

/**
 * Covers docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §9: the questions an
 * Event Draft must be able to ask the mutation layer, ahead of any Event Add
 * UI existing.
 */
describe("resolveEventDraftAdditionPolicy (§9)", () => {
  it("allows additions to a normal, non-Event Draft", () => {
    expect(resolveEventDraftAdditionPolicy(null)).toEqual({
      addEnabled: true,
      refusal: null,
    });
  });

  it("disables additions for January, by what the Event itself declares", () => {
    // January is `singleFilmDraft` — one join, one roll. No id-specific
    // branch anywhere in the policy makes this true.
    expect(
      getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID)?.singleFilmDraft,
    ).toBe(true);
    expect(resolveEventDraftAdditionPolicy(F_YOU_ITS_JANUARY_EVENT_ID)).toEqual(
      {
        addEnabled: false,
        refusal: "event_disallows_additions",
      },
    );
  });

  it("allows additions for multi-film Events", () => {
    for (const eventId of [HALLOWEEN_EVENT_ID, CHRISTMAS_EVENT_ID]) {
      expect(resolveEventDraftAdditionPolicy(eventId)).toEqual({
        addEnabled: true,
        refusal: null,
      });
    }
  });

  it("refuses additions to a Draft whose Event is no longer registered", () => {
    // Its persisted Draft still renders; the rules that would validate an
    // addition are gone, so nothing new may join it.
    expect(resolveEventDraftAdditionPolicy("retired-event")).toEqual({
      addEnabled: false,
      refusal: "event_not_registered",
    });
  });
});
