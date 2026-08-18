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
    const body = "Just a plain, hand-written release description.";
    expect(parseReleaseNotes(body)).toEqual({ title: null, notes: body });
  });

  it("treats the old generic installer boilerplate as no notes at all, not real content", () => {
    const body =
      "See the assets below to download and install this version.\n\nFor a fresh install, download the `FDraft_*_Setup.exe` file.";
    expect(parseReleaseNotes(body)).toEqual({ title: null, notes: null });
  });

  it("strips installer boilerplate even when it's the only thing left after a real heading", () => {
    const body = [
      "### v1.2.0 — Placeholder",
      "",
      "See the assets below to download and install this version.",
    ].join("\n");
    expect(parseReleaseNotes(body)).toEqual({
      title: "Placeholder",
      notes: null,
    });
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
