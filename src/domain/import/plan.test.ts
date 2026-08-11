import { describe, expect, it } from "vitest";
import { planWatchlistImport } from "./plan";
import type { ParsedWatchlistRow } from "./watchlist-csv";

function row(overrides: Partial<ParsedWatchlistRow> = {}): ParsedWatchlistRow {
  return {
    dateAdded: "2023-01-15",
    title: "Inception",
    releaseYear: 2010,
    letterboxdUri: "https://letterboxd.com/film/inception/",
    sourceRowNumber: 2,
    ...overrides,
  };
}

describe("planWatchlistImport — first-time import", () => {
  it("creates a film and entry for every new row, assigning sequential positions", () => {
    const rows = [
      row({
        title: "Inception",
        letterboxdUri: "https://letterboxd.com/film/inception/",
      }),
      row({
        title: "Arrival",
        letterboxdUri: "https://letterboxd.com/film/arrival-2016/",
      }),
    ];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [],
      existingEntries: [],
    });

    expect(plan.duplicateRowCount).toBe(0);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows.map((r) => r.action)).toEqual([
      "create_film_and_entry",
      "create_film_and_entry",
    ]);
    expect(plan.rows.map((r) => r.position)).toEqual([0, 1]);
  });

  it("creates only an entry (not a film) when the film already exists in the global catalog", () => {
    const rows = [row()];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [{ filmId: "film-1", filmKey: "slug:inception" }],
      existingEntries: [], // no entry for THIS user yet
    });

    expect(plan.rows[0].action).toBe("create_entry_for_existing_film");
    expect(plan.rows[0].existingFilmId).toBe("film-1");
    expect(plan.rows[0].existingEntryId).toBeNull();
  });
});

describe("planWatchlistImport — duplicate rows within one file", () => {
  it("counts and skips a repeated film, keeping the first occurrence's position", () => {
    const rows = [
      row({ title: "Inception" }),
      row({ title: "Inception", dateAdded: "2023-01-16" }),
      row({
        title: "Arrival",
        letterboxdUri: "https://letterboxd.com/film/arrival-2016/",
      }),
    ];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [],
      existingEntries: [],
    });

    expect(plan.duplicateRowCount).toBe(1);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows.map((r) => r.row.title)).toEqual(["Inception", "Arrival"]);
    // Arrival still gets position 1, not 2 — the duplicate did not consume a slot.
    expect(plan.rows.map((r) => r.position)).toEqual([0, 1]);
  });

  it("deduplicates by title/year fallback key when there is no Letterboxd URI", () => {
    const rows = [
      row({ title: "Untitled", letterboxdUri: null, releaseYear: 2020 }),
      row({
        title: "untitled",
        letterboxdUri: null,
        releaseYear: 2020,
        dateAdded: "2023-02-01",
      }),
    ];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [],
      existingEntries: [],
    });
    expect(plan.duplicateRowCount).toBe(1);
    expect(plan.rows).toHaveLength(1);
  });
});

describe("planWatchlistImport — repeated (idempotent) import", () => {
  it("produces no_change for every row when nothing changed since the last import", () => {
    const rows = [
      row({
        title: "Inception",
        letterboxdUri: "https://letterboxd.com/film/inception/",
      }),
      row({
        title: "Arrival",
        letterboxdUri: "https://letterboxd.com/film/arrival-2016/",
        dateAdded: "2023-02-20",
      }),
    ];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [
        { filmId: "film-1", filmKey: "slug:inception" },
        { filmId: "film-2", filmKey: "slug:arrival-2016" },
      ],
      existingEntries: [
        {
          filmId: "film-1",
          entryId: "entry-1",
          isActive: true,
          position: 0,
          dateAdded: "2023-01-15",
        },
        {
          filmId: "film-2",
          entryId: "entry-2",
          isActive: true,
          position: 1,
          dateAdded: "2023-02-20",
        },
      ],
    });

    expect(plan.rows.map((r) => r.action)).toEqual(["no_change", "no_change"]);
  });

  it("is stable across repeated runs with identical input (running it twice yields the same plan)", () => {
    const rows = [row()];
    const existingFilms = [{ filmId: "film-1", filmKey: "slug:inception" }];
    const existingEntries = [
      {
        filmId: "film-1",
        entryId: "entry-1",
        isActive: true,
        position: 0,
        dateAdded: "2023-01-15",
      },
    ];
    const first = planWatchlistImport({
      parsedRows: rows,
      existingFilms,
      existingEntries,
    });
    const second = planWatchlistImport({
      parsedRows: rows,
      existingFilms,
      existingEntries,
    });
    expect(first).toEqual(second);
  });
});

describe("planWatchlistImport — date and position preservation", () => {
  it("flags an update when the Date Added changed since the last import", () => {
    const rows = [row({ dateAdded: "2023-03-01" })];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [{ filmId: "film-1", filmKey: "slug:inception" }],
      existingEntries: [
        {
          filmId: "film-1",
          entryId: "entry-1",
          isActive: true,
          position: 0,
          dateAdded: "2023-01-15",
        },
      ],
    });
    expect(plan.rows[0].action).toBe("update_entry");
  });

  it("preserves the parsed Date Added value unchanged onto the plan row", () => {
    const rows = [row({ dateAdded: "2019-12-25" })];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [],
      existingEntries: [],
    });
    expect(plan.rows[0].row.dateAdded).toBe("2019-12-25");
  });

  it("flags an update when the ordinal position changed since the last import", () => {
    const rows = [
      row({
        title: "Arrival",
        letterboxdUri: "https://letterboxd.com/film/arrival-2016/",
      }),
      row({
        title: "Inception",
        letterboxdUri: "https://letterboxd.com/film/inception/",
      }),
    ];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [
        { filmId: "film-1", filmKey: "slug:arrival-2016" },
        { filmId: "film-2", filmKey: "slug:inception" },
      ],
      existingEntries: [
        // Previously Inception was first (position 0); now Arrival is first.
        {
          filmId: "film-1",
          entryId: "entry-1",
          isActive: true,
          position: 1,
          dateAdded: "2023-01-15",
        },
        {
          filmId: "film-2",
          entryId: "entry-2",
          isActive: true,
          position: 0,
          dateAdded: "2023-01-15",
        },
      ],
    });
    expect(plan.rows[0].action).toBe("update_entry"); // Arrival moved from position 1 -> 0
    expect(plan.rows[1].action).toBe("update_entry"); // Inception moved from position 0 -> 1
  });
});

describe("planWatchlistImport — reactivating a removed film", () => {
  it("reactivates an inactive entry instead of creating a duplicate", () => {
    const rows = [row()];
    const plan = planWatchlistImport({
      parsedRows: rows,
      existingFilms: [{ filmId: "film-1", filmKey: "slug:inception" }],
      existingEntries: [
        {
          filmId: "film-1",
          entryId: "entry-1",
          isActive: false,
          position: 0,
          dateAdded: "2022-06-01",
        },
      ],
    });
    expect(plan.rows[0].action).toBe("reactivate_entry");
    expect(plan.rows[0].existingEntryId).toBe("entry-1");
  });
});
