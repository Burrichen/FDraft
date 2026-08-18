import { describe, expect, it } from "vitest";
import { shouldAutoCheckForUpdate } from "./update-check-policy";

describe("shouldAutoCheckForUpdate", () => {
  it("checks on startup when enabled and not yet checked this session", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        alreadyCheckedThisSession: false,
      }),
    ).toBe(true);
  });

  it("never checks when the user has turned automatic checking off", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: false,
        alreadyCheckedThisSession: false,
      }),
    ).toBe(false);
  });

  it("does not check again within the same session, regardless of how recently enabled", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        alreadyCheckedThisSession: true,
      }),
    ).toBe(false);
  });

  it("checks again on every fresh startup — no cross-session cooldown", () => {
    // A prior check having happened at all — recently or long ago — must
    // never suppress the NEXT startup's own check; only this session's
    // own guard should.
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        alreadyCheckedThisSession: false,
      }),
    ).toBe(true);
  });
});
