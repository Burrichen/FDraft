import { describe, expect, it } from "vitest";
import { normalizeAssetFilename } from "./filename-normalization";

describe("normalizeAssetFilename (EVENT STUDIO — PHASE 9 §5)", () => {
  it("leaves an already-clean filename completely unchanged", () => {
    expect(normalizeAssetFilename("ghost-peeking.png")).toBe(
      "ghost-peeking.png",
    );
  });

  it("leaves a simple lowercase filename with an underscore unchanged", () => {
    expect(normalizeAssetFilename("pumpkin_lit.webp")).toBe("pumpkin_lit.webp");
  });

  it("slugifies a messy filename into the spec's own example shape", () => {
    expect(normalizeAssetFilename("Ghost Peeking FINAL (2)!!!!.png")).toBe(
      "ghost-peeking-final-2.png",
    );
  });

  it("lowercases the extension", () => {
    expect(normalizeAssetFilename("Ghost.PNG")).toBe("ghost.png");
  });

  it("collapses multiple separators and trims leading/trailing ones", () => {
    expect(normalizeAssetFilename("  --Ghost   Peeking--  .png")).toBe(
      "ghost-peeking.png",
    );
  });

  it("falls back to a generic stem when nothing usable survives", () => {
    expect(normalizeAssetFilename("!!!.png")).toBe("asset.png");
  });

  it("handles a filename with no extension at all", () => {
    expect(normalizeAssetFilename("Ghost Peeking")).toBe("ghost-peeking");
  });

  it("produces a stem that always starts with an alphanumeric character, matching the schema's own filename pattern", () => {
    const result = normalizeAssetFilename("___Weird Name___.svg");
    expect(result).toMatch(/^[a-z0-9]/);
  });
});
