import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkThemeCompatibility,
  FDRAFT_SUPPORTED_CAPABILITIES,
  FDRAFT_SUPPORTED_COMPONENT_KEYS,
  getThemeRuntimeCompatibility,
} from "./compatibility";

/**
 * Reads the exact installed package.json files directly (never the
 * compatibility module's own report) so this test can genuinely catch
 * the report drifting from what's actually installed, rather than just
 * re-asserting the same values the module already computed.
 */
function installedVersion(pkg: "theme-sdk" | "theme-renderer"): string {
  const raw = readFileSync(`node_modules/@fdraft/${pkg}/package.json`, "utf-8");
  return (JSON.parse(raw) as { version: string }).version;
}

describe("getThemeRuntimeCompatibility", () => {
  it("reports the exact installed SDK and renderer versions", () => {
    const report = getThemeRuntimeCompatibility();
    expect(report.installedSdkVersion).toBe(installedVersion("theme-sdk"));
    expect(report.installedRendererVersion).toBe(
      installedVersion("theme-renderer"),
    );
  });

  it("reports a supported project/theme format range", () => {
    const report = getThemeRuntimeCompatibility();
    expect(report.supportedProjectFormatRange.min).toBe("0.9.0");
    expect(report.supportedProjectFormatRange.current).toBe("1.0.0");
    expect(report.supportedThemeFormatRange.min).toBe("1.0.0");
    expect(report.supportedThemeFormatRange.current).toBe("1.0.0");
  });

  it("reports FDraft's own supported component keys and capabilities", () => {
    const report = getThemeRuntimeCompatibility();
    expect(report.supportedComponentKeys).toEqual(
      FDRAFT_SUPPORTED_COMPONENT_KEYS,
    );
    expect(report.supportedCapabilities).toEqual(FDRAFT_SUPPORTED_CAPABILITIES);
  });
});

describe("checkThemeCompatibility", () => {
  it("accepts a theme whose requirements are fully within this host's support", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "0.1.0",
      requiredComponentKeys: ["page-title", "points-counter"],
      capabilities: ["responsive"],
    });
    expect(result).toEqual({ compatible: true, reasons: [] });
  });

  it("rejects a theme requiring a newer renderer than is installed", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "99.0.0",
      requiredComponentKeys: [],
      capabilities: [],
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]).toMatch(/renderer >= 99\.0\.0/);
  });

  it("rejects a theme requiring an unsupported component key", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "0.1.0",
      requiredComponentKeys: ["profile-badge"],
      capabilities: [],
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.some((r) => r.includes("profile-badge"))).toBe(true);
  });

  it("rejects a theme requiring an unsupported capability", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "0.1.0",
      requiredComponentKeys: [],
      capabilities: ["behaviour"],
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.some((r) => r.includes("behaviour"))).toBe(true);
  });

  it("reports every incompatibility reason at once, not just the first", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "99.0.0",
      requiredComponentKeys: ["profile-badge"],
      capabilities: ["behaviour"],
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });
});
