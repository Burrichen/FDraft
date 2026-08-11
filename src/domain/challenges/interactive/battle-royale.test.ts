import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { buildFilm } from "../families/test-helpers";
import {
  beginBattleRoyale,
  getBattleRoyaleWinner,
  selectLeastAnticipated,
  selectMostAnticipated,
  type BattleRoyaleState,
} from "./battle-royale";

function buildEightFilms() {
  return Array.from({ length: 8 }, () => buildFilm());
}

describe("beginBattleRoyale", () => {
  it("generates exactly 8 candidates and starts awaiting the most-anticipated pick", () => {
    const state = beginBattleRoyale(
      buildEightFilms(),
      "standard",
      createSeededRng(1),
    );
    expect(state).not.toBeNull();
    expect(state?.candidates).toHaveLength(8);
    expect(state?.stage).toBe("awaiting_most_anticipated");
    expect(state?.mostAnticipatedEntryId).toBeNull();
    expect(state?.leastAnticipatedEntryId).toBeNull();
  });

  it("returns null when fewer than 8 eligible candidates exist", () => {
    const state = beginBattleRoyale(
      Array.from({ length: 7 }, () => buildFilm()),
      "standard",
      createSeededRng(1),
    );
    expect(state).toBeNull();
  });

  it("draws 8 distinct films even from a larger pool", () => {
    const films = Array.from({ length: 20 }, () => buildFilm());
    const state = beginBattleRoyale(films, "standard", createSeededRng(5));
    const ids = state?.candidates.map((f) => f.watchlistEntryId) ?? [];
    expect(new Set(ids).size).toBe(8);
  });

  it("is deterministic for a given seed", () => {
    const films = Array.from({ length: 20 }, () => buildFilm());
    const a = beginBattleRoyale(films, "standard", createSeededRng(42));
    const b = beginBattleRoyale(films, "standard", createSeededRng(42));
    expect(a?.candidates.map((f) => f.watchlistEntryId)).toEqual(
      b?.candidates.map((f) => f.watchlistEntryId),
    );
  });
});

describe("selectMostAnticipated", () => {
  const state = beginBattleRoyale(
    buildEightFilms(),
    "standard",
    createSeededRng(1),
  ) as BattleRoyaleState;

  it("transitions to awaiting_least_anticipated on a valid pick", () => {
    const result = selectMostAnticipated(
      state,
      state.candidates[0].watchlistEntryId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.stage).toBe("awaiting_least_anticipated");
      expect(result.state.mostAnticipatedEntryId).toBe(
        state.candidates[0].watchlistEntryId,
      );
    }
  });

  it("rejects a film id that isn't one of the 8 candidates", () => {
    const result = selectMostAnticipated(state, "not-a-real-entry-id");
    expect(result).toEqual({ ok: false, error: "not_a_candidate" });
  });

  it("rejects a second most-anticipated selection once already made", () => {
    const afterFirst = selectMostAnticipated(
      state,
      state.candidates[0].watchlistEntryId,
    );
    if (!afterFirst.ok) throw new Error("expected first selection to succeed");
    const second = selectMostAnticipated(
      afterFirst.state,
      state.candidates[1].watchlistEntryId,
    );
    expect(second).toEqual({
      ok: false,
      error: "not_awaiting_most_anticipated",
    });
  });
});

describe("selectLeastAnticipated", () => {
  function afterMostAnticipated() {
    const initial = beginBattleRoyale(
      buildEightFilms(),
      "standard",
      createSeededRng(1),
    ) as BattleRoyaleState;
    const result = selectMostAnticipated(
      initial,
      initial.candidates[0].watchlistEntryId,
    );
    if (!result.ok)
      throw new Error("expected most-anticipated selection to succeed");
    return result.state;
  }

  it("resolves the state on a valid pick from the remaining candidates", () => {
    const state = afterMostAnticipated();
    const result = selectLeastAnticipated(
      state,
      state.candidates[1].watchlistEntryId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.stage).toBe("resolved");
      expect(result.state.leastAnticipatedEntryId).toBe(
        state.candidates[1].watchlistEntryId,
      );
    }
  });

  it("rejects re-selecting the most-anticipated film as least-anticipated", () => {
    const state = afterMostAnticipated();
    const result = selectLeastAnticipated(
      state,
      state.mostAnticipatedEntryId as string,
    );
    expect(result).toEqual({
      ok: false,
      error: "cannot_repeat_most_anticipated",
    });
  });

  it("rejects a film id that isn't one of the 8 candidates", () => {
    const state = afterMostAnticipated();
    const result = selectLeastAnticipated(state, "not-a-real-entry-id");
    expect(result).toEqual({ ok: false, error: "not_a_candidate" });
  });

  it("rejects a least-anticipated pick before a most-anticipated pick has been made", () => {
    const initial = beginBattleRoyale(
      buildEightFilms(),
      "standard",
      createSeededRng(1),
    ) as BattleRoyaleState;
    const result = selectLeastAnticipated(
      initial,
      initial.candidates[1].watchlistEntryId,
    );
    expect(result).toEqual({
      ok: false,
      error: "not_awaiting_least_anticipated",
    });
  });
});

describe("getBattleRoyaleWinner", () => {
  it("returns null before the state is resolved", () => {
    const state = beginBattleRoyale(
      buildEightFilms(),
      "standard",
      createSeededRng(1),
    ) as BattleRoyaleState;
    expect(getBattleRoyaleWinner(state)).toBeNull();
  });

  it("standard variant: the winner is the most-anticipated pick", () => {
    const initial = beginBattleRoyale(
      buildEightFilms(),
      "standard",
      createSeededRng(1),
    ) as BattleRoyaleState;
    const afterMost = selectMostAnticipated(
      initial,
      initial.candidates[0].watchlistEntryId,
    );
    if (!afterMost.ok) throw new Error("expected success");
    const afterLeast = selectLeastAnticipated(
      afterMost.state,
      initial.candidates[1].watchlistEntryId,
    );
    if (!afterLeast.ok) throw new Error("expected success");
    const winner = getBattleRoyaleWinner(afterLeast.state);
    expect(winner?.watchlistEntryId).toBe(
      initial.candidates[0].watchlistEntryId,
    );
  });

  it("underdog variant: the winner is the least-anticipated pick", () => {
    const initial = beginBattleRoyale(
      buildEightFilms(),
      "underdog",
      createSeededRng(1),
    ) as BattleRoyaleState;
    const afterMost = selectMostAnticipated(
      initial,
      initial.candidates[0].watchlistEntryId,
    );
    if (!afterMost.ok) throw new Error("expected success");
    const afterLeast = selectLeastAnticipated(
      afterMost.state,
      initial.candidates[1].watchlistEntryId,
    );
    if (!afterLeast.ok) throw new Error("expected success");
    const winner = getBattleRoyaleWinner(afterLeast.state);
    expect(winner?.watchlistEntryId).toBe(
      initial.candidates[1].watchlistEntryId,
    );
  });
});
