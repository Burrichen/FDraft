import { describe, expect, it } from "vitest";
import { drawPreferringWatchlist } from "./prefer-watchlist-draw";
import { createSeededRng } from "@/domain/shared/rng";

function candidate(
  filmId: string,
  watchlistEntryId: string | null = null,
  watchlistSelectionWeight: number | null = null,
) {
  return { filmId, watchlistEntryId, watchlistSelectionWeight };
}

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE
 * CLEANUP" §6/§10 — the shared, generic "Prefer items from my Watchlist"
 * draw rule, extracted from Christmas's own already-tested logic so
 * Halloween's Horror/Kitsch pools can reuse it too.
 */
describe("drawPreferringWatchlist", () => {
  it("returns an empty array when count is 0", () => {
    const pool = [candidate("a"), candidate("b")];
    expect(drawPreferringWatchlist(pool, 0, true, createSeededRng(1))).toEqual(
      [],
    );
  });

  it("preferWatchlist off draws from the whole pool, ignoring watchlist membership", () => {
    const pool = [candidate("a", "entry-a", 5), candidate("b"), candidate("c")];
    const result = drawPreferringWatchlist(pool, 3, false, createSeededRng(1));
    expect(result).toHaveLength(3);
    expect(new Set(result.map((c) => c.filmId))).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("preferWatchlist on fills from the watchlist intersection first, then tops up from the rest", () => {
    const onList = [
      candidate("on-1", "entry-1", 1),
      candidate("on-2", "entry-2", 1),
    ];
    const offList = [
      candidate("off-1"),
      candidate("off-2"),
      candidate("off-3"),
    ];
    const pool = [...onList, ...offList];

    const result = drawPreferringWatchlist(pool, 4, true, createSeededRng(1));
    expect(result).toHaveLength(4);
    const drawnIds = result.map((c) => c.filmId);
    // Both watchlist films made it in — the preference is honoured...
    expect(drawnIds).toContain("on-1");
    expect(drawnIds).toContain("on-2");
    // ...and exactly two more came from the rest of the pool to fill the
    // remaining slots, so it stayed a preference, never a requirement.
    expect(drawnIds.filter((id) => id.startsWith("off-"))).toHaveLength(2);
  });

  it("never fails when the watchlist intersection is empty — a genuine preference, not a requirement", () => {
    const pool = [candidate("a"), candidate("b"), candidate("c")];
    const result = drawPreferringWatchlist(pool, 2, true, createSeededRng(1));
    expect(result).toHaveLength(2);
  });

  it("never fails when the watchlist intersection already covers the whole request", () => {
    const pool = [
      candidate("on-1", "entry-1", 1),
      candidate("on-2", "entry-2", 1),
      candidate("on-3", "entry-3", 1),
      candidate("off-1"),
    ];
    const result = drawPreferringWatchlist(pool, 2, true, createSeededRng(1));
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.watchlistEntryId !== null)).toBe(true);
  });

  it("never draws the same film twice", () => {
    const pool = Array.from({ length: 10 }, (_, i) => candidate(`film-${i}`));
    const result = drawPreferringWatchlist(pool, 10, false, createSeededRng(1));
    expect(new Set(result.map((c) => c.filmId)).size).toBe(10);
  });
});
