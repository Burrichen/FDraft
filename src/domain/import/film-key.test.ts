import { describe, expect, it } from "vitest";
import { computeFilmKey, extractLetterboxdSlug } from "./film-key";

describe("extractLetterboxdSlug", () => {
  it("extracts the slug from a standard film URL", () => {
    expect(
      extractLetterboxdSlug("https://letterboxd.com/film/inception/"),
    ).toBe("inception");
  });

  it("handles URLs without a trailing slash", () => {
    expect(extractLetterboxdSlug("https://letterboxd.com/film/inception")).toBe(
      "inception",
    );
  });

  it("handles http and www variants", () => {
    expect(
      extractLetterboxdSlug("http://www.letterboxd.com/film/arrival-2016/"),
    ).toBe("arrival-2016");
  });

  it("returns null for a non-film URL", () => {
    expect(
      extractLetterboxdSlug(
        "https://letterboxd.com/someone/list/best-of-2020/",
      ),
    ).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(extractLetterboxdSlug(null)).toBeNull();
    expect(extractLetterboxdSlug(undefined)).toBeNull();
    expect(extractLetterboxdSlug("")).toBeNull();
  });
});

describe("computeFilmKey", () => {
  it("prefers the slug when a Letterboxd URI is present", () => {
    const key = computeFilmKey({
      letterboxdUri: "https://letterboxd.com/film/inception/",
      title: "Inception",
      releaseYear: 2010,
    });
    expect(key).toBe("slug:inception");
  });

  it("falls back to a normalized title/year key when there is no URI", () => {
    const key = computeFilmKey({
      letterboxdUri: null,
      title: "Some Obscure Film",
      releaseYear: 2020,
    });
    expect(key).toBe("title-year:some obscure film::2020");
  });

  it("falls back key is case-insensitive and trims whitespace", () => {
    const a = computeFilmKey({
      letterboxdUri: null,
      title: "  Arrival  ",
      releaseYear: 2016,
    });
    const b = computeFilmKey({
      letterboxdUri: null,
      title: "arrival",
      releaseYear: 2016,
    });
    expect(a).toBe(b);
  });

  it("uses 'unknown' for a missing release year in the fallback key", () => {
    const key = computeFilmKey({
      letterboxdUri: null,
      title: "Mystery Film",
      releaseYear: null,
    });
    expect(key).toBe("title-year:mystery film::unknown");
  });

  it("slug-based and title/year-based keys never collide", () => {
    const slugKey = computeFilmKey({
      letterboxdUri: "https://letterboxd.com/film/unknown/",
      title: "unknown",
      releaseYear: null,
    });
    const fallbackKey = computeFilmKey({
      letterboxdUri: null,
      title: "unknown",
      releaseYear: null,
    });
    expect(slugKey).not.toBe(fallbackKey);
  });
});
