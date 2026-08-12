import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_FALLBACK,
  defaultPagePath,
  isDefaultPage,
  resolveDefaultPage,
} from "./default-page";

describe("DEFAULT_PAGE_FALLBACK", () => {
  it("is Watchlist", () => {
    expect(DEFAULT_PAGE_FALLBACK).toBe("watchlist");
  });
});

describe("isDefaultPage", () => {
  it("accepts every known page", () => {
    expect(isDefaultPage("watchlist")).toBe(true);
    expect(isDefaultPage("drafts")).toBe(true);
    expect(isDefaultPage("history")).toBe(true);
    expect(isDefaultPage("stats")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDefaultPage("settings")).toBe(false);
    expect(isDefaultPage(null)).toBe(false);
    expect(isDefaultPage(undefined)).toBe(false);
    expect(isDefaultPage(42)).toBe(false);
  });
});

describe("resolveDefaultPage", () => {
  it("passes through a valid value", () => {
    expect(resolveDefaultPage("drafts")).toBe("drafts");
    expect(resolveDefaultPage("stats")).toBe("stats");
  });

  it("falls back to Watchlist for a missing value", () => {
    expect(resolveDefaultPage(undefined)).toBe("watchlist");
  });

  it("falls back to Watchlist for an invalid/stale value", () => {
    expect(resolveDefaultPage("some-removed-page")).toBe("watchlist");
    expect(resolveDefaultPage(null)).toBe("watchlist");
  });
});

describe("defaultPagePath", () => {
  it("maps every page to its real route", () => {
    expect(defaultPagePath("watchlist")).toBe("/watchlist");
    expect(defaultPagePath("drafts")).toBe("/drafts");
    expect(defaultPagePath("history")).toBe("/drafts/history");
    expect(defaultPagePath("stats")).toBe("/stats");
  });
});
