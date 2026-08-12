import { describe, expect, it } from "vitest";
import {
  MIN_CHECK_INTERVAL_MS,
  shouldAutoCheckForUpdate,
} from "./update-check-policy";

const NOW = new Date("2026-08-12T12:00:00.000Z");

describe("shouldAutoCheckForUpdate", () => {
  it("checks on a fresh install — no check has ever completed", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        lastCheckedAt: null,
        alreadyCheckedThisSession: false,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("never checks when the user has turned automatic checking off", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: false,
        lastCheckedAt: null,
        alreadyCheckedThisSession: false,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("does not check again within the same session, regardless of how long ago the last check was", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        lastCheckedAt: "2020-01-01T00:00:00.000Z",
        alreadyCheckedThisSession: true,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("does not check again if the last check was within the minimum interval", () => {
    const recentlyChecked = new Date(
      NOW.getTime() - MIN_CHECK_INTERVAL_MS / 2,
    ).toISOString();
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        lastCheckedAt: recentlyChecked,
        alreadyCheckedThisSession: false,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("checks again once the minimum interval has elapsed since the last check", () => {
    const longAgo = new Date(
      NOW.getTime() - MIN_CHECK_INTERVAL_MS - 1000,
    ).toISOString();
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        lastCheckedAt: longAgo,
        alreadyCheckedThisSession: false,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("checks if the stored timestamp is corrupted/unparsable, rather than getting stuck never checking again", () => {
    expect(
      shouldAutoCheckForUpdate({
        autoCheckEnabled: true,
        lastCheckedAt: "not-a-date",
        alreadyCheckedThisSession: false,
        now: NOW,
      }),
    ).toBe(true);
  });
});
