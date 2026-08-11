import { describe, expect, it } from "vitest";
import type { LocalProfile } from "./profile";
import { resolveAutoOpenProfileId } from "./select-active-profile";

function profile(id: string): LocalProfile {
  return {
    id,
    displayName: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: { reducedMotion: false },
    dataVersion: 1,
  };
}

describe("resolveAutoOpenProfileId", () => {
  it("returns null when there are no profiles yet (first launch)", () => {
    expect(resolveAutoOpenProfileId([], null)).toBeNull();
  });

  it("auto-opens the only profile when exactly one exists, regardless of the remembered id", () => {
    const alex = profile("alex");
    expect(resolveAutoOpenProfileId([alex], null)).toBe("alex");
    expect(resolveAutoOpenProfileId([alex], "some-other-id")).toBe("alex");
  });

  it("with multiple profiles, honours the remembered profile id if it still exists", () => {
    const alex = profile("alex");
    const sam = profile("sam");
    expect(resolveAutoOpenProfileId([alex, sam], "sam")).toBe("sam");
  });

  it("with multiple profiles and no remembered id, forces the picker (returns null)", () => {
    const alex = profile("alex");
    const sam = profile("sam");
    expect(resolveAutoOpenProfileId([alex, sam], null)).toBeNull();
  });

  it("with multiple profiles, a remembered id for a since-deleted profile also forces the picker", () => {
    const alex = profile("alex");
    const sam = profile("sam");
    expect(
      resolveAutoOpenProfileId([alex, sam], "deleted-profile-id"),
    ).toBeNull();
  });
});
