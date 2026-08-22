import { describe, expect, it } from "vitest";
import {
  resolveFranchiseChronologicalPick,
  type FranchiseOrderCandidate,
} from "./franchise-order";

function candidate(
  watchlistEntryId: string,
  filmId: string,
  releaseYear: number | null,
  collectionId: string | null,
): FranchiseOrderCandidate {
  return { watchlistEntryId, filmId, releaseYear, collectionId };
}

describe("resolveFranchiseChronologicalPick", () => {
  it("replaces the rolled film with an earlier entry in the same franchise", () => {
    const rolled = candidate("entry-3", "mi-3", 2006, "mission-impossible");
    const pool = [
      candidate("entry-1", "mi-1", 1996, "mission-impossible"),
      candidate("entry-2", "mi-2", 2000, "mission-impossible"),
    ];

    const result = resolveFranchiseChronologicalPick({ rolled, pool });
    expect(result.filmId).toBe("mi-1");
  });

  it("does nothing when the rolled film is already the earliest available", () => {
    const rolled = candidate("entry-1", "mi-1", 1996, "mission-impossible");
    const pool = [
      candidate("entry-2", "mi-2", 2000, "mission-impossible"),
      candidate("entry-3", "mi-3", 2006, "mission-impossible"),
    ];

    const result = resolveFranchiseChronologicalPick({ rolled, pool });
    expect(result.filmId).toBe("mi-1");
  });

  it("ignores films from a different franchise entirely", () => {
    const rolled = candidate("entry-3", "mi-3", 2006, "mission-impossible");
    const pool = [candidate("entry-9", "die-hard-1", 1988, "die-hard")];

    const result = resolveFranchiseChronologicalPick({ rolled, pool });
    expect(result.filmId).toBe("mi-3");
  });

  it("keeps the original when the rolled film has no collection metadata at all", () => {
    const rolled = candidate("entry-1", "standalone", 2020, null);
    const pool = [candidate("entry-2", "other", 2010, null)];

    const result = resolveFranchiseChronologicalPick({ rolled, pool });
    expect(result.filmId).toBe("standalone");
  });

  it("keeps the original when the rolled film's own release year is missing (ambiguous)", () => {
    const rolled = candidate("entry-3", "mi-3", null, "mission-impossible");
    const pool = [candidate("entry-1", "mi-1", 1996, "mission-impossible")];

    const result = resolveFranchiseChronologicalPick({ rolled, pool });
    expect(result.filmId).toBe("mi-3");
  });

  it("skips a same-franchise candidate with no known release year rather than guessing it's earlier", () => {
    const rolled = candidate("entry-3", "mi-3", 2006, "mission-impossible");
    const pool = [
      candidate("entry-1", "mi-1", null, "mission-impossible"),
      candidate("entry-2", "mi-2", 2000, "mission-impossible"),
    ];

    const result = resolveFranchiseChronologicalPick({ rolled, pool });
    expect(result.filmId).toBe("mi-2");
  });

  it("only ever picks from the given pool — never reaches outside it", () => {
    const rolled = candidate("entry-3", "mi-3", 2006, "mission-impossible");
    const result = resolveFranchiseChronologicalPick({ rolled, pool: [] });
    expect(result.filmId).toBe("mi-3");
  });
});
