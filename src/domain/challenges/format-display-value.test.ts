import { describe, expect, it } from "vitest";
import { formatChallengeDisplayValue } from "./format-display-value";

describe("formatChallengeDisplayValue", () => {
  it("returns an empty array for null or undefined", () => {
    expect(formatChallengeDisplayValue(null)).toEqual([]);
    expect(formatChallengeDisplayValue(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty object", () => {
    expect(formatChallengeDisplayValue({})).toEqual([]);
  });

  it("formats Minute Match's target minutes with a humanized label", () => {
    expect(formatChallengeDisplayValue({ targetMinutes: 137 })).toEqual([
      { label: "Target Minutes", value: "137" },
    ]);
  });

  it("formats a short array of scalars as a joined string", () => {
    expect(
      formatChallengeDisplayValue({ genres: ["Horror", "Comedy"] }),
    ).toEqual([{ label: "Genres", value: "Horror, Comedy" }]);
  });

  it("formats World Cup's countries and winner together", () => {
    const result = formatChallengeDisplayValue({
      countries: ["France", "Japan", "Brazil", "Germany"],
      winner: "Japan",
    });
    expect(result).toEqual([
      { label: "Countries", value: "France, Japan, Brazil, Germany" },
      { label: "Winner", value: "Japan" },
    ]);
  });

  it("formats a boolean scalar", () => {
    expect(formatChallengeDisplayValue({ isRerun: true })).toEqual([
      { label: "Is Rerun", value: "true" },
    ]);
  });

  it("skips a nested object value", () => {
    expect(formatChallengeDisplayValue({ nested: { a: 1 } })).toEqual([]);
  });

  it("skips an array longer than the display limit", () => {
    const longArray = Array.from({ length: 10 }, (_, i) => `item-${i}`);
    expect(formatChallengeDisplayValue({ tooLong: longArray })).toEqual([]);
  });

  it("skips an array containing non-scalar items (e.g. lottery ticket breakdowns)", () => {
    const tickets = [{ watchlistEntryId: "a", totalTickets: 3 }];
    expect(formatChallengeDisplayValue({ tickets })).toEqual([]);
  });

  it("skips an empty array", () => {
    expect(formatChallengeDisplayValue({ empty: [] })).toEqual([]);
  });

  it("preserves insertion order and mixes displayable and skipped keys", () => {
    const result = formatChallengeDisplayValue({
      targetMinutes: 100,
      tickets: [{ a: 1 }],
      genre: "Horror",
    });
    expect(result).toEqual([
      { label: "Target Minutes", value: "100" },
      { label: "Genre", value: "Horror" },
    ]);
  });
});
