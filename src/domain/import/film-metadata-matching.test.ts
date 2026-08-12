import { describe, expect, it } from "vitest";
import {
  MATCH_CONFIDENCE_THRESHOLD,
  pickBestMatch,
  scoreCandidate,
  yearConfidence,
  type FilmMetadataSearchCandidate,
} from "./film-metadata-matching";

function candidate(
  overrides: Partial<FilmMetadataSearchCandidate<number>> & { id: number },
): FilmMetadataSearchCandidate<number> {
  return { title: "Untitled", releaseYear: null, ...overrides };
}

describe("yearConfidence", () => {
  it("is 1 for an exact match", () => {
    expect(yearConfidence(2010, 2010)).toBe(1);
  });

  it("is a graduated partial score for a one-year discrepancy", () => {
    const score = yearConfidence(2011, 2010);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("is lower for a two-year discrepancy than a one-year discrepancy", () => {
    expect(yearConfidence(2012, 2010)).toBeLessThan(yearConfidence(2011, 2010));
  });

  it("is 0 for a large, clearly-wrong discrepancy", () => {
    expect(yearConfidence(1975, 2010)).toBe(0);
  });

  it("is 0 (not a guessed middle value) when either year is unknown", () => {
    expect(yearConfidence(null, 2010)).toBe(0);
    expect(yearConfidence(2010, null)).toBe(0);
    expect(yearConfidence(null, null)).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("scores a normal exact title + exact year match at (or near) full confidence", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "Inception", releaseYear: 2010 }),
      {
        title: "Inception",
        releaseYear: 2010,
      },
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("scores a punctuation-only title difference the same as an exact match", () => {
    const withPunctuation = scoreCandidate(
      candidate({
        id: 1,
        title: "Spider-Man: Into the Spider-Verse",
        releaseYear: 2018,
      }),
      { title: "Spider Man Into the Spider Verse", releaseYear: 2018 },
    );
    expect(withPunctuation.titleSimilarity).toBe(1);
    expect(withPunctuation.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("scores an accented title the same as its unaccented equivalent", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "Amélie", releaseYear: 2001 }),
      {
        title: "Amelie",
        releaseYear: 2001,
      },
    );
    expect(result.titleSimilarity).toBe(1);
  });

  it("handles an apostrophe difference", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "Don't Look Up", releaseYear: 2021 }),
      {
        title: "Don’t Look Up",
        releaseYear: 2021,
      },
    );
    expect(result.titleSimilarity).toBe(1);
  });

  it("scores a title with a subtitle as similar but not identical", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "Blade Runner 2049", releaseYear: 2017 }),
      {
        title: "Blade Runner",
        releaseYear: 2017,
      },
    );
    expect(result.titleSimilarity).toBeGreaterThan(0.5);
    expect(result.titleSimilarity).toBeLessThan(1);
  });

  it("still gives a strong confidence for a one-year release discrepancy on an exact title", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "Parasite", releaseYear: 2019 }),
      {
        title: "Parasite",
        releaseYear: 2020,
      },
    );
    expect(result.confidence).toBeGreaterThanOrEqual(
      MATCH_CONFIDENCE_THRESHOLD,
    );
  });

  it("gives a low confidence for an exact title paired with a clearly-wrong year", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "It", releaseYear: 1990 }),
      {
        title: "It",
        releaseYear: 2017,
      },
    );
    // Exact title alone (no year corroboration) should NOT clear the bar
    // when a *known*, badly-mismatched year actively argues against it.
    expect(result.confidence).toBeLessThan(MATCH_CONFIDENCE_THRESHOLD);
  });

  it("relies on title alone (not a fabricated neutral year score) when neither side has a year", () => {
    const result = scoreCandidate(
      candidate({ id: 1, title: "Inception", releaseYear: null }),
      {
        title: "Inception",
        releaseYear: null,
      },
    );
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("discounts a candidate missing its year more heavily than the case where the import itself has no year — found live against real TMDB data, where a stray no-date 'Parasite' entry was outranking the real one-year-off 2019 film", () => {
    const importHasNoYear = scoreCandidate(
      candidate({ id: 1, title: "Inception", releaseYear: null }),
      { title: "Inception", releaseYear: null },
    );
    const candidateMissingYearOnly = scoreCandidate(
      candidate({ id: 2, title: "Inception", releaseYear: null }),
      { title: "Inception", releaseYear: 2010 },
    );
    expect(candidateMissingYearOnly.confidence).toBeLessThan(
      importHasNoYear.confidence,
    );
    // Still viable on title alone, just not favoured over a corroborated match.
    expect(candidateMissingYearOnly.confidence).toBeGreaterThanOrEqual(
      MATCH_CONFIDENCE_THRESHOLD,
    );
  });

  it("also checks the candidate's original title, not just its display title", () => {
    const result = scoreCandidate(
      candidate({
        id: 1,
        title: "Spirited Away",
        originalTitle: "Sen to Chihiro no Kamikakushi",
        releaseYear: 2001,
      }),
      { title: "Sen to Chihiro no Kamikakushi", releaseYear: 2001 },
    );
    expect(result.titleSimilarity).toBe(1);
  });
});

describe("pickBestMatch", () => {
  it("returns not-found for an empty candidate list", () => {
    expect(pickBestMatch([], { title: "Anything", releaseYear: 2020 })).toEqual(
      { status: "not-found" },
    );
  });

  it("returns not-found when no candidate clears the confidence threshold", () => {
    const result = pickBestMatch(
      [
        candidate({
          id: 1,
          title: "Completely Different Film",
          releaseYear: 1975,
        }),
      ],
      { title: "Inception", releaseYear: 2010 },
    );
    expect(result.status).toBe("not-found");
  });

  it("matches a single strong candidate", () => {
    const result = pickBestMatch(
      [candidate({ id: 1, title: "Inception", releaseYear: 2010 })],
      { title: "Inception", releaseYear: 2010 },
    );
    expect(result).toEqual(expect.objectContaining({ status: "matched" }));
    if (result.status === "matched") {
      expect(result.candidate.id).toBe(1);
    }
  });

  it("never blindly picks the first result — a worse first candidate loses to a better second one", () => {
    const result = pickBestMatch(
      [
        candidate({
          id: 1,
          title: "The Thing from Another World",
          releaseYear: 1951,
        }),
        candidate({ id: 2, title: "The Thing", releaseYear: 1982 }),
      ],
      { title: "The Thing", releaseYear: 1982 },
    );
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.candidate.id).toBe(2);
    }
  });

  it("reports ambiguous when multiple candidates are equally plausible", () => {
    const result = pickBestMatch(
      [
        candidate({ id: 1, title: "Doubt", releaseYear: 2008 }),
        candidate({ id: 2, title: "Doubt", releaseYear: 2008 }),
      ],
      { title: "Doubt", releaseYear: 2008 },
    );
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.length).toBe(2);
    }
  });

  it("matches a one-year-off real film over a same-titled candidate with no year at all, instead of reporting them ambiguous", () => {
    // Regression test for a real TMDB result set: searching "Parasite" with
    // an import year of 2018 (actual release 2019) also returns a couple of
    // duplicate/obscure "Parasite" entries with no reported release date at
    // all. Those must not be treated as equally plausible as the real film.
    const result = pickBestMatch(
      [
        candidate({ id: 1, title: "PARASITE", releaseYear: null }),
        candidate({ id: 2, title: "Parasite", releaseYear: null }),
        candidate({ id: 3, title: "Parasite", releaseYear: 2019 }),
      ],
      { title: "Parasite", releaseYear: 2018 },
    );
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.candidate.id).toBe(3);
    }
  });

  it("breaks a near-tie using popularity only when confidences are genuinely within the ambiguous margin", () => {
    const result = pickBestMatch(
      [
        candidate({
          id: 1,
          title: "Beauty and the Beast",
          releaseYear: 2017,
          popularity: 5,
        }),
        candidate({
          id: 2,
          title: "Beauty and the Beast",
          releaseYear: null,
          popularity: 50,
        }),
      ],
      { title: "Beauty and the Beast", releaseYear: 2017 },
    );
    // Exact year match (id 1) is well ahead of the no-year candidate (id 2)
    // on confidence, so this must resolve, not go ambiguous, and popularity
    // must not override that.
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.candidate.id).toBe(1);
    }
  });
});
