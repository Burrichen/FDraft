import { describe, expect, it } from "vitest";
import { compareVersions, selectSkippedReleases } from "./skipped-releases";

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.0.2", "1.0.3")).toBeLessThan(0);
    expect(compareVersions("1.0.3", "1.0.2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.3", "1.0.3")).toBe(0);
    expect(compareVersions("1.1.0", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });

  it("treats a missing segment as 0", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.9")).toBeGreaterThan(0);
  });
});

describe("selectSkippedReleases", () => {
  const releases = [
    { version: "1.0.1", body: "### v1.0.1 — First" },
    { version: "1.0.2", body: "### v1.0.2 — The Green Pen Patch" },
    { version: "1.0.3", body: "### v1.0.3 — Now Updating" },
    { version: "1.0.4", body: "### v1.0.4 — Future" },
  ];

  it("returns releases strictly between the current and target version, newest first", () => {
    const result = selectSkippedReleases(releases, "1.0.1", "1.0.4");
    expect(result.map((r) => r.version)).toEqual(["1.0.3", "1.0.2"]);
    expect(result[0].title).toBe("Now Updating");
    expect(result[1].title).toBe("The Green Pen Patch");
  });

  it("excludes the target version itself — that's the dialog's own primary heading", () => {
    const result = selectSkippedReleases(releases, "1.0.2", "1.0.4");
    expect(result.map((r) => r.version)).toEqual(["1.0.3"]);
  });

  it("excludes the current version itself", () => {
    const result = selectSkippedReleases(releases, "1.0.1", "1.0.2");
    expect(result).toEqual([]);
  });

  it("returns nothing for a normal one-version-forward update", () => {
    const result = selectSkippedReleases(releases, "1.0.3", "1.0.4");
    expect(result).toEqual([]);
  });

  it("returns an empty list when given no releases at all", () => {
    expect(selectSkippedReleases([], "1.0.1", "1.0.4")).toEqual([]);
  });
});
