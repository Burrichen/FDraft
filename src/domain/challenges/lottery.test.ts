import { describe, expect, it } from "vitest";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "./types";
import {
  calculateAntiLotteryTickets,
  calculateLotteryTickets,
} from "./lottery";
import { buildFilm, buildWatchedFilm } from "./families/test-helpers";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("calculateLotteryTickets", () => {
  it("gives every film a baseline of 1 ticket with no bonuses", () => {
    const film = buildFilm({
      dateAdded: "2026-01-01",
      averageRating: null,
      watchCount: null,
      genres: null,
    });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown).toMatchObject({
      baseline: 1,
      completeYearsOnWatchlistBonus: 0,
      underwatchedBonus: 0,
      underrepresentedGenreBonus: 0,
      highlyRatedBonus: 0,
      totalTickets: 1,
    });
  });

  it("awards +1 per complete year on the watchlist", () => {
    const film = buildFilm({ dateAdded: "2020-06-15" }); // 5 complete years before 2026-01-01
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.completeYearsOnWatchlistBonus).toBe(5);
  });

  it("does not award a year bonus for a film added this year", () => {
    const film = buildFilm({ dateAdded: "2025-12-01" });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.completeYearsOnWatchlistBonus).toBe(0);
  });

  it("awards +2 to a film in the bottom 25% by watch count", () => {
    const films = [
      buildFilm({ watchCount: 1 }),
      buildFilm({ watchCount: 100 }),
      buildFilm({ watchCount: 200 }),
      buildFilm({ watchCount: 300 }),
    ];
    const breakdowns = calculateLotteryTickets(films, NOW);
    expect(breakdowns[0].underwatchedBonus).toBe(2);
    expect(breakdowns[1].underwatchedBonus).toBe(0);
  });

  it("does not award the underwatched bonus when watch count is unknown", () => {
    const film = buildFilm({ watchCount: null });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.underwatchedBonus).toBe(0);
  });

  it("awards +2 for a film in an underrepresented genre", () => {
    const commonGenreFilms = Array.from({ length: 10 }, () =>
      buildFilm({ genres: ["Drama"] }),
    );
    const rareGenreFilm = buildFilm({ genres: ["Documentary"] });
    const breakdowns = calculateLotteryTickets(
      [...commonGenreFilms, rareGenreFilm],
      NOW,
    );
    expect(breakdowns.at(-1)?.underrepresentedGenreBonus).toBe(2);
  });

  it("does not award the genre bonus when genres are unknown", () => {
    const film = buildFilm({ genres: null });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.underrepresentedGenreBonus).toBe(0);
  });

  it("awards +1 for a highly rated film (rating >= 4.0)", () => {
    const film = buildFilm({ averageRating: 4.0 });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.highlyRatedBonus).toBe(1);
  });

  it("boundary: a rating just under 4.0 does not qualify", () => {
    const film = buildFilm({ averageRating: 3.9 });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.highlyRatedBonus).toBe(0);
  });

  it("does not award the rating bonus when rating is unknown", () => {
    const film = buildFilm({ averageRating: null });
    const [breakdown] = calculateLotteryTickets([film], NOW);
    expect(breakdown.highlyRatedBonus).toBe(0);
  });

  it("sums every applicable bonus into totalTickets", () => {
    const film = buildFilm({
      dateAdded: "2020-01-01", // +6 years
      watchCount: 1,
      averageRating: 4.5, // +1
      genres: ["Rare"],
    });
    const filler = Array.from({ length: 10 }, () =>
      buildFilm({ watchCount: 500, genres: ["Common"] }),
    );
    const [breakdown] = calculateLotteryTickets([film, ...filler], NOW);
    expect(breakdown.underwatchedBonus).toBe(2);
    expect(breakdown.underrepresentedGenreBonus).toBe(2);
    expect(breakdown.highlyRatedBonus).toBe(1);
    expect(breakdown.totalTickets).toBe(
      breakdown.baseline + breakdown.completeYearsOnWatchlistBonus + 2 + 2 + 1,
    );
  });

  it("returns an empty array for an empty input without dividing by zero", () => {
    expect(calculateLotteryTickets([], NOW)).toEqual([]);
  });

  it("produces exactly one breakdown per input film, in order", () => {
    const films = [buildFilm(), buildFilm(), buildFilm()];
    const breakdowns = calculateLotteryTickets(films, NOW);
    expect(breakdowns.map((b) => b.watchlistEntryId)).toEqual(
      films.map((f) => f.watchlistEntryId),
    );
  });
});

describe("calculateAntiLotteryTickets", () => {
  it("applies a recent-addition penalty within the configured window", () => {
    const film = buildFilm({ dateAdded: "2025-12-15" }); // 17 days before NOW
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      [],
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.recentAdditionPenalty).toBe(
      -DEFAULT_CHALLENGE_ENGINE_CONFIG.antiLotteryRecentAdditionPenalty,
    );
  });

  it("boundary: exactly at the recent-addition window does not incur the penalty", () => {
    const film = buildFilm({ dateAdded: "2025-12-02" }); // exactly 30 days before NOW
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      [],
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.recentAdditionPenalty).toBe(0);
  });

  it("does not penalize an older addition", () => {
    const film = buildFilm({ dateAdded: "2020-01-01" });
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      [],
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.recentAdditionPenalty).toBe(0);
  });

  it("omits the taste-similarity penalty when there is insufficient rated watch history", () => {
    const film = buildFilm({ genres: ["Horror"], dateAdded: "2020-01-01" });
    const sparseHistory = [
      buildWatchedFilm({ genres: ["Horror"], userRating: 5 }),
    ]; // fewer than the default minimum of 5
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      sparseHistory,
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.tasteSimilarityPenaltyOmitted).toBe(true);
    expect(breakdown.tasteSimilarityPenalty).toBe(0);
  });

  it("applies the taste-similarity penalty once enough rated history establishes a dominant genre", () => {
    const film = buildFilm({ genres: ["Horror"], dateAdded: "2020-01-01" });
    const establishedHistory = Array.from({ length: 5 }, () =>
      buildWatchedFilm({ genres: ["Horror"], userRating: 4.5 }),
    );
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      establishedHistory,
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.tasteSimilarityPenaltyOmitted).toBe(false);
    expect(breakdown.tasteSimilarityPenalty).toBe(
      -DEFAULT_CHALLENGE_ENGINE_CONFIG.antiLotteryTasteSimilarityPenalty,
    );
  });

  it("does not penalize a film outside the established taste genres", () => {
    const film = buildFilm({
      genres: ["Documentary"],
      dateAdded: "2020-01-01",
    });
    const establishedHistory = Array.from({ length: 5 }, () =>
      buildWatchedFilm({ genres: ["Horror"], userRating: 4.5 }),
    );
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      establishedHistory,
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.tasteSimilarityPenalty).toBe(0);
  });

  it("ignores watched films below the established-taste rating threshold", () => {
    const film = buildFilm({ genres: ["Horror"], dateAdded: "2020-01-01" });
    const lowRatedHistory = Array.from({ length: 5 }, () =>
      buildWatchedFilm({ genres: ["Horror"], userRating: 2.0 }),
    );
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      lowRatedHistory,
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.tasteSimilarityPenaltyOmitted).toBe(true);
  });

  it("never floors below 1 ticket even when every penalty applies", () => {
    const film = buildFilm({
      genres: ["Horror"],
      dateAdded: "2025-12-31",
      averageRating: null,
      watchCount: null,
    });
    const establishedHistory = Array.from({ length: 5 }, () =>
      buildWatchedFilm({ genres: ["Horror"], userRating: 4.5 }),
    );
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      establishedHistory,
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.totalTickets).toBeGreaterThanOrEqual(1);
  });

  it("never invents taste history from zero watched films", () => {
    const film = buildFilm({ genres: ["Horror"] });
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      [],
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.tasteSimilarityPenaltyOmitted).toBe(true);
  });

  it("still applies the shared base bonuses underneath the penalties", () => {
    const film = buildFilm({ dateAdded: "2020-01-01", averageRating: 4.5 });
    const [breakdown] = calculateAntiLotteryTickets(
      [film],
      NOW,
      [],
      DEFAULT_CHALLENGE_ENGINE_CONFIG,
    );
    expect(breakdown.completeYearsOnWatchlistBonus).toBe(6);
    expect(breakdown.highlyRatedBonus).toBe(1);
  });
});
