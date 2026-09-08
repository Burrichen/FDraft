import { describe, expect, it } from "vitest";
import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { canEditDraftSlot } from "./draft-editing-permission";

describe("canEditDraftSlot", () => {
  it("normal draft + normal user: random slots are editable", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        draftSourceEventId: null,
        adminModeEnabled: false,
      }),
    ).toBe(true);
  });

  it("event draft + normal user: blocked", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        draftSourceEventId: "halloween",
        adminModeEnabled: false,
      }),
    ).toBe(false);
  });

  it("event draft + Admin Mode: allowed", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        draftSourceEventId: "halloween",
        adminModeEnabled: true,
      }),
    ).toBe(true);
  });

  it("challenge slot: blocked regardless of event/admin state", () => {
    expect(
      canEditDraftSlot({
        itemSource: "challenge",
        draftSourceEventId: null,
        adminModeEnabled: false,
      }),
    ).toBe(false);
    expect(
      canEditDraftSlot({
        itemSource: "challenge",
        draftSourceEventId: null,
        adminModeEnabled: true,
      }),
    ).toBe(false);
    expect(
      canEditDraftSlot({
        itemSource: "challenge",
        draftSourceEventId: "halloween",
        adminModeEnabled: true,
      }),
    ).toBe(false);
  });

  it("manual slot: blocked — a DIY/manually-added pick is not a random slot", () => {
    expect(
      canEditDraftSlot({
        itemSource: "manual",
        draftSourceEventId: null,
        adminModeEnabled: true,
      }),
    ).toBe(false);
  });
});

/**
 * See docs/updates, "FDRAFT UPDATE 1 — JANUARY / HALLOWEEN / CHRISTMAS
 * REGRESSION" — the one exception that overrides the whole truth table.
 */
describe("canEditDraftSlot — a singleFilmDraft Event is never editable", () => {
  it("refuses a January slot even with Admin Mode on", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        draftSourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
        adminModeEnabled: true,
      }),
    ).toBe(false);
  });

  it("still allows another Event's slot under Admin Mode, unchanged", () => {
    for (const eventId of [HALLOWEEN_EVENT_ID, CHRISTMAS_EVENT_ID]) {
      expect(
        canEditDraftSlot({
          itemSource: "random",
          draftSourceEventId: eventId,
          adminModeEnabled: true,
        }),
        eventId,
      ).toBe(true);
      expect(
        canEditDraftSlot({
          itemSource: "random",
          draftSourceEventId: eventId,
          adminModeEnabled: false,
        }),
        eventId,
      ).toBe(false);
    }
  });

  it("still allows a normal (non-event) random slot, unchanged", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        draftSourceEventId: null,
        adminModeEnabled: false,
      }),
    ).toBe(true);
  });
});
