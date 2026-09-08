import { describe, expect, it } from "vitest";
import {
  christmasFilmContentSchema,
  eventFilmEntrySchema,
  findCrossCategoryDuplicates,
  findWithinCategoryDuplicates,
  halloweenFilmContentSchema,
  parseChristmasFilmContent,
  parseHalloweenFilmContent,
  parseJanuaryFilmContent,
} from "./event-film-content-schema";

describe("eventFilmEntrySchema", () => {
  it("accepts a valid title+year entry", () => {
    const result = eventFilmEntrySchema.safeParse({
      title: "Halloween",
      year: 1978,
    });
    expect(result.success).toBe(true);
  });

  it("trims title whitespace", () => {
    const result = eventFilmEntrySchema.parse({
      title: "  Halloween  ",
      year: 1978,
    });
    expect(result.title).toBe("Halloween");
  });

  it("requires year — no provider-id-free entry can omit it", () => {
    const result = eventFilmEntrySchema.safeParse({ title: "Halloween" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(
      eventFilmEntrySchema.safeParse({ title: "", year: 1978 }).success,
    ).toBe(false);
  });

  it("rejects an implausible year", () => {
    expect(
      eventFilmEntrySchema.safeParse({ title: "X", year: 1500 }).success,
    ).toBe(false);
    expect(
      eventFilmEntrySchema.safeParse({ title: "X", year: 3000 }).success,
    ).toBe(false);
  });

  it("never accepts a tmdbId/letterboxdSlug — the new format is title+year only", () => {
    const result = eventFilmEntrySchema.safeParse({
      title: "Halloween",
      year: 1978,
      tmdbId: "10331",
    });
    // Zod's default (non-strict) object parsing just drops unknown keys —
    // confirm the parsed value genuinely carries no such field, since
    // silently accepting-and-ignoring it would be misleading for an
    // author who thinks they configured a provider id.
    expect(result.success).toBe(true);
    expect(result.success && "tmdbId" in result.data).toBe(false);
  });
});

describe("halloweenFilmContentSchema / parseHalloweenFilmContent", () => {
  it("parses a valid Halloween content object", () => {
    const parsed = parseHalloweenFilmContent({
      schemaVersion: 1,
      event: "halloween",
      horror: [{ title: "Halloween", year: 1978 }],
      kitsch: [{ title: "Hocus Pocus", year: 1993 }],
    });
    expect(parsed.horror).toHaveLength(1);
    expect(parsed.kitsch).toHaveLength(1);
  });

  it("throws on a malformed bundled file — an authoring mistake, not untrusted input", () => {
    expect(() => parseHalloweenFilmContent({ event: "halloween" })).toThrow();
    expect(() =>
      parseHalloweenFilmContent({
        schemaVersion: 1,
        event: "halloween",
        horror: [{ title: "Missing Year" }],
        kitsch: [],
      }),
    ).toThrow();
  });

  it("rejects the wrong event literal", () => {
    expect(
      halloweenFilmContentSchema.safeParse({
        schemaVersion: 1,
        event: "not-halloween",
        horror: [],
        kitsch: [],
      }).success,
    ).toBe(false);
  });
});

describe("januaryFilmContentSchema / parseJanuaryFilmContent", () => {
  it("parses a valid January content object, including an empty curated list", () => {
    const parsed = parseJanuaryFilmContent({
      schemaVersion: 1,
      event: "f-you-its-january",
      curated: [],
    });
    expect(parsed.curated).toEqual([]);
  });
});

describe("christmasFilmContentSchema / parseChristmasFilmContent", () => {
  it("parses a valid Christmas content object with classic/adjacent categories", () => {
    const parsed = parseChristmasFilmContent({
      schemaVersion: 1,
      event: "christmas",
      classic: [{ title: "It's a Wonderful Life", year: 1946 }],
      adjacent: [{ title: "Die Hard", year: 1988 }],
    });
    expect(parsed.classic).toHaveLength(1);
    expect(parsed.adjacent).toHaveLength(1);
  });

  it("rejects a schema missing the adjacent category", () => {
    expect(
      christmasFilmContentSchema.safeParse({
        schemaVersion: 1,
        event: "christmas",
        classic: [],
      }).success,
    ).toBe(false);
  });
});

describe("findWithinCategoryDuplicates", () => {
  it("finds no duplicates in a clean list", () => {
    expect(
      findWithinCategoryDuplicates([
        { title: "A", year: 2000 },
        { title: "B", year: 2001 },
      ]),
    ).toEqual([]);
  });

  it("finds a same-title-and-year duplicate", () => {
    const duplicates = findWithinCategoryDuplicates([
      { title: "A", year: 2000 },
      { title: "a", year: 2000 },
    ]);
    expect(duplicates).toHaveLength(1);
  });

  it("does not flag the same title with a different year as a duplicate", () => {
    expect(
      findWithinCategoryDuplicates([
        { title: "Halloween", year: 1978 },
        { title: "Halloween", year: 2007 },
      ]),
    ).toEqual([]);
  });
});

describe("findCrossCategoryDuplicates", () => {
  it("finds no cross-category duplicates when categories are disjoint", () => {
    expect(
      findCrossCategoryDuplicates({
        horror: [{ title: "A", year: 2000 }],
        kitsch: [{ title: "B", year: 2001 }],
      }),
    ).toEqual([]);
  });

  it("detects a film appearing in more than one category, without removing it from either", () => {
    const result = findCrossCategoryDuplicates({
      horror: [{ title: "Beetlejuice", year: 1988 }],
      kitsch: [{ title: "beetlejuice", year: 1988 }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories.sort()).toEqual(["horror", "kitsch"]);
  });

  it("works across three or more categories (e.g. Christmas classic/adjacent)", () => {
    const result = findCrossCategoryDuplicates({
      classic: [{ title: "Die Hard", year: 1988 }],
      adjacent: [{ title: "Die Hard", year: 1988 }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories.sort()).toEqual(["adjacent", "classic"]);
  });
});
