import { describe, expect, it } from "vitest";
import { canEditDraftSlot } from "./draft-editing-permission";

describe("canEditDraftSlot", () => {
  it("normal draft + normal user: random slots are editable", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        isEventDraft: false,
        adminModeEnabled: false,
      }),
    ).toBe(true);
  });

  it("event draft + normal user: blocked", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        isEventDraft: true,
        adminModeEnabled: false,
      }),
    ).toBe(false);
  });

  it("event draft + Admin Mode: allowed", () => {
    expect(
      canEditDraftSlot({
        itemSource: "random",
        isEventDraft: true,
        adminModeEnabled: true,
      }),
    ).toBe(true);
  });

  it("challenge slot: blocked regardless of event/admin state", () => {
    expect(
      canEditDraftSlot({
        itemSource: "challenge",
        isEventDraft: false,
        adminModeEnabled: false,
      }),
    ).toBe(false);
    expect(
      canEditDraftSlot({
        itemSource: "challenge",
        isEventDraft: false,
        adminModeEnabled: true,
      }),
    ).toBe(false);
    expect(
      canEditDraftSlot({
        itemSource: "challenge",
        isEventDraft: true,
        adminModeEnabled: true,
      }),
    ).toBe(false);
  });

  it("manual slot: blocked — a DIY/manually-added pick is not a random slot", () => {
    expect(
      canEditDraftSlot({
        itemSource: "manual",
        isEventDraft: false,
        adminModeEnabled: true,
      }),
    ).toBe(false);
  });
});
