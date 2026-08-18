import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./release-notes";

describe("parseReleaseNotes", () => {
  it("extracts the title after an em dash and strips the heading from the notes", () => {
    const body = [
      "### v1.0.3 — Now Updating",
      "",
      "#### Added",
      "* Thing one",
      "* Thing two",
    ].join("\n");
    expect(parseReleaseNotes(body)).toEqual({
      title: "Now Updating",
      notes: "#### Added\n* Thing one\n* Thing two",
    });
  });

  it("accepts a plain hyphen instead of an em dash", () => {
    expect(parseReleaseNotes("v1.0.3 - Now Updating\n\nBody text")).toEqual({
      title: "Now Updating",
      notes: "Body text",
    });
  });

  it("tolerates leading blank lines before the heading", () => {
    expect(parseReleaseNotes("\n\n### v2.0.0 — Title\n\nNotes here")).toEqual({
      title: "Title",
      notes: "Notes here",
    });
  });

  it("falls back to no title and the raw body when the heading convention isn't followed", () => {
    const body = "See the assets below to download and install this version.";
    expect(parseReleaseNotes(body)).toEqual({ title: null, notes: body });
  });

  it("returns nulls for an empty or missing body", () => {
    expect(parseReleaseNotes(null)).toEqual({ title: null, notes: null });
    expect(parseReleaseNotes(undefined)).toEqual({ title: null, notes: null });
    expect(parseReleaseNotes("   ")).toEqual({ title: null, notes: null });
  });

  it("returns null notes when nothing is left after the heading line", () => {
    expect(parseReleaseNotes("### v1.0.3 — Now Updating")).toEqual({
      title: "Now Updating",
      notes: null,
    });
  });
});
