import { describe, expect, it } from "vitest";
import {
  hasSuspiciousTitleContainment,
  normalizeFilmTitle,
  stripLeadingArticle,
  titleSimilarity,
} from "./title-normalization";

describe("normalizeFilmTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeFilmTitle("Spider-Man: Into the Spider-Verse")).toBe(
      "spider man into the spider verse",
    );
  });

  it("produces the same normalized form for a punctuation-free equivalent", () => {
    expect(normalizeFilmTitle("Spider-Man: Into the Spider-Verse")).toBe(
      normalizeFilmTitle("Spider Man Into the Spider Verse"),
    );
  });

  it("strips diacritics/accents", () => {
    expect(normalizeFilmTitle("Amélie")).toBe("amelie");
    expect(normalizeFilmTitle("Léon: The Professional")).toBe(
      "leon the professional",
    );
  });

  it("handles apostrophes (including curly/typographic ones)", () => {
    expect(normalizeFilmTitle("Don't Look Up")).toBe("don t look up");
    expect(normalizeFilmTitle("Don’t Look Up")).toBe("don t look up");
  });

  it("spells out ampersands", () => {
    expect(normalizeFilmTitle("Fast & Furious")).toBe("fast and furious");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(normalizeFilmTitle("  The   Matrix  ")).toBe("the matrix");
  });

  it("handles colons in subtitles", () => {
    expect(normalizeFilmTitle("Mission: Impossible")).toBe(
      "mission impossible",
    );
  });
});

describe("stripLeadingArticle", () => {
  it("removes a single leading article", () => {
    expect(stripLeadingArticle("the matrix")).toBe("matrix");
    expect(stripLeadingArticle("a quiet place")).toBe("quiet place");
    expect(stripLeadingArticle("an american werewolf in london")).toBe(
      "american werewolf in london",
    );
  });

  it("leaves a title with no leading article untouched", () => {
    expect(stripLeadingArticle("inception")).toBe("inception");
  });
});

describe("titleSimilarity", () => {
  it("is 1 for identical titles", () => {
    expect(titleSimilarity("Inception", "Inception")).toBe(1);
  });

  it("is 1 for titles differing only in punctuation", () => {
    expect(
      titleSimilarity(
        "Spider-Man: Into the Spider-Verse",
        "Spider Man Into the Spider Verse",
      ),
    ).toBe(1);
  });

  it("is 1 for titles differing only in accents", () => {
    expect(titleSimilarity("Amelie", "Amélie")).toBe(1);
  });

  it("is high but not perfect for a subtitle difference", () => {
    const score = titleSimilarity("Blade Runner", "Blade Runner 2049");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("is low for genuinely unrelated titles", () => {
    expect(titleSimilarity("Inception", "The Notebook")).toBeLessThan(0.2);
  });

  it("is 0 when either title is empty after normalization", () => {
    expect(titleSimilarity("", "Inception")).toBe(0);
    expect(titleSimilarity("!!!", "Inception")).toBe(0);
  });

  it("distinguishes a same-title-different-film case reasonably (some overlap, not identical)", () => {
    const score = titleSimilarity("The Thing", "The Thing from Another World");
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1);
  });
});

describe("hasSuspiciousTitleContainment", () => {
  it("flags a documentary/making-of title that contains the real title plus extra words", () => {
    expect(
      hasSuspiciousTitleContainment(
        "The Queen's Gambit",
        "Creating The Queen's Gambit",
      ),
    ).toBe(true);
  });

  it("is symmetric — order of arguments doesn't matter", () => {
    expect(
      hasSuspiciousTitleContainment(
        "Creating The Queen's Gambit",
        "The Queen's Gambit",
      ),
    ).toBe(true);
  });

  it("does not flag a plain leading-article difference", () => {
    expect(hasSuspiciousTitleContainment("Matrix", "The Matrix")).toBe(false);
    expect(hasSuspiciousTitleContainment("The Matrix", "Matrix")).toBe(false);
  });

  it("flags a sequel/subtitle relationship the same way — these must not auto-match either", () => {
    expect(
      hasSuspiciousTitleContainment("Blade Runner", "Blade Runner 2049"),
    ).toBe(true);
  });

  it("does not flag identical titles", () => {
    expect(hasSuspiciousTitleContainment("Inception", "Inception")).toBe(false);
  });

  it("does not flag genuinely unrelated titles (no containment relationship)", () => {
    expect(hasSuspiciousTitleContainment("Inception", "The Notebook")).toBe(
      false,
    );
  });
});
