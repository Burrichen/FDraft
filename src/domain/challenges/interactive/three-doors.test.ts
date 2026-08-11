import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { buildFilm } from "../families/test-helpers";
import {
  beginThreeDoors,
  getThreeDoorsWinner,
  selectDoor,
} from "./three-doors";

function buildViableCandidates() {
  return [
    buildFilm({ runtimeMinutes: 70 }),
    buildFilm({ runtimeMinutes: 200, releaseYear: 1930 }),
    buildFilm({ runtimeMinutes: 150, releaseYear: 2020, averageRating: 4.8 }),
    buildFilm({ runtimeMinutes: 150, releaseYear: 2020, averageRating: 4.5 }),
  ];
}

describe("beginThreeDoors", () => {
  it("produces exactly three doors: short, old, highly rated", () => {
    const result = beginThreeDoors(buildViableCandidates(), createSeededRng(1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.doors.map((d) => d.kind)).toEqual([
        "short",
        "old",
        "highly_rated",
      ]);
      expect(result.state.stage).toBe("awaiting_choice");
    }
  });

  it("produces three distinct films across the doors", () => {
    const result = beginThreeDoors(buildViableCandidates(), createSeededRng(3));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.state.doors.map((d) => d.film.watchlistEntryId);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it("is ineligible when no film has a known runtime for the short door", () => {
    const candidates = [
      buildFilm({ runtimeMinutes: null, releaseYear: 1930 }),
      buildFilm({ averageRating: 4.5 }),
    ];
    const result = beginThreeDoors(candidates, createSeededRng(1));
    expect(result).toEqual({ ok: false, reason: "no_short_film_candidate" });
  });

  it("is ineligible when no remaining film has a known release year for the old door", () => {
    // Only one film has runtime info (fills the short door); nothing left has a release year.
    const candidates = [buildFilm({ runtimeMinutes: 70, releaseYear: null })];
    const result = beginThreeDoors(candidates, createSeededRng(1));
    expect(result).toEqual({ ok: false, reason: "no_old_film_candidate" });
  });

  it("is ineligible when no remaining film is rated 4.0+ for the highly-rated door", () => {
    const candidates = [
      buildFilm({ runtimeMinutes: 70, releaseYear: 2020, averageRating: null }),
      buildFilm({ runtimeMinutes: 150, releaseYear: 1930, averageRating: 3.0 }),
    ];
    const result = beginThreeDoors(candidates, createSeededRng(1));
    expect(result).toEqual({
      ok: false,
      reason: "no_highly_rated_film_candidate",
    });
  });

  it("is deterministic for a given seed", () => {
    const candidates = buildViableCandidates();
    const a = beginThreeDoors(candidates, createSeededRng(99));
    const b = beginThreeDoors(candidates, createSeededRng(99));
    expect(
      a.ok && b.ok && a.state.doors.map((d) => d.film.watchlistEntryId),
    ).toEqual(b.ok && b.state.doors.map((d) => d.film.watchlistEntryId));
  });
});

describe("selectDoor", () => {
  function begin() {
    const result = beginThreeDoors(buildViableCandidates(), createSeededRng(1));
    if (!result.ok) throw new Error("expected doors to be generated");
    return result.state;
  }

  it("resolves the state when a valid door is chosen", () => {
    const state = begin();
    const chosenId = state.doors[0].film.watchlistEntryId;
    const result = selectDoor(state, chosenId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.stage).toBe("resolved");
      expect(result.state.chosenWatchlistEntryId).toBe(chosenId);
    }
  });

  it("rejects a film id that isn't one of the three doors", () => {
    const state = begin();
    const result = selectDoor(state, "not-a-real-entry-id");
    expect(result).toEqual({ ok: false, error: "not_a_door" });
  });

  it("rejects a second selection once already resolved", () => {
    const state = begin();
    const first = selectDoor(state, state.doors[0].film.watchlistEntryId);
    if (!first.ok) throw new Error("expected first selection to succeed");
    const second = selectDoor(
      first.state,
      state.doors[1].film.watchlistEntryId,
    );
    expect(second).toEqual({ ok: false, error: "not_awaiting_choice" });
  });
});

describe("getThreeDoorsWinner", () => {
  it("returns null before a door is chosen", () => {
    const result = beginThreeDoors(buildViableCandidates(), createSeededRng(1));
    if (!result.ok) throw new Error("expected doors to be generated");
    expect(getThreeDoorsWinner(result.state)).toBeNull();
  });

  it("returns the chosen door's film once resolved", () => {
    const result = beginThreeDoors(buildViableCandidates(), createSeededRng(1));
    if (!result.ok) throw new Error("expected doors to be generated");
    const chosen = result.state.doors[2].film;
    const resolved = selectDoor(result.state, chosen.watchlistEntryId);
    if (!resolved.ok) throw new Error("expected selection to succeed");
    expect(getThreeDoorsWinner(resolved.state)?.watchlistEntryId).toBe(
      chosen.watchlistEntryId,
    );
  });

  it("only the chosen door's film is the winner, not the other two", () => {
    const result = beginThreeDoors(buildViableCandidates(), createSeededRng(1));
    if (!result.ok) throw new Error("expected doors to be generated");
    const chosen = result.state.doors[0].film;
    const resolved = selectDoor(result.state, chosen.watchlistEntryId);
    if (!resolved.ok) throw new Error("expected selection to succeed");
    const winner = getThreeDoorsWinner(resolved.state);
    expect(winner?.watchlistEntryId).not.toBe(
      result.state.doors[1].film.watchlistEntryId,
    );
    expect(winner?.watchlistEntryId).not.toBe(
      result.state.doors[2].film.watchlistEntryId,
    );
  });
});
