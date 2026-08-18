import { describe, expect, it } from "vitest";
import {
  resolveEligibleCandidates,
  type EligibilityCandidate,
} from "./event-eligibility";
import {
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
  getEventDefinition,
} from "./event-registry";

function candidate(
  watchlistEntryId: string,
  filmId: string,
  genres: string[] | null,
  averageRating: number | null = null,
): EligibilityCandidate {
  return { watchlistEntryId, filmId, genres, averageRating };
}

describe("resolveEligibleCandidates", () => {
  it("no rules configured at all ({}) — every candidate stays eligible, unchanged", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Comedy"]),
      candidate("entry-2", "film-2", null),
    ];

    expect(resolveEligibleCandidates(candidates, {})).toBe(candidates);
  });

  it("requiredGenres/curatedFilmIds explicitly null or empty — same as unconfigured, no restriction", () => {
    const candidates = [candidate("entry-1", "film-1", ["Comedy"])];

    expect(
      resolveEligibleCandidates(candidates, {
        requiredGenres: null,
        curatedFilmIds: null,
      }),
    ).toEqual(candidates);
    expect(
      resolveEligibleCandidates(candidates, {
        requiredGenres: [],
        curatedFilmIds: [],
      }),
    ).toEqual(candidates);
  });

  it("requiredGenres: only candidates with a matching genre qualify, matched case-insensitively", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Horror", "Comedy"]),
      candidate("entry-2", "film-2", ["horror"]),
      candidate("entry-3", "film-3", ["Drama"]),
      candidate("entry-4", "film-4", null),
    ];

    const result = resolveEligibleCandidates(candidates, {
      requiredGenres: ["Horror"],
    });

    expect(result.map((c) => c.watchlistEntryId)).toEqual([
      "entry-1",
      "entry-2",
    ]);
  });

  it("curatedFilmIds: a specific film id is eligible regardless of its genre metadata", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Comedy"]),
      candidate("entry-2", "film-2", null),
      candidate("entry-3", "film-3", ["Drama"]),
    ];

    const result = resolveEligibleCandidates(candidates, {
      curatedFilmIds: ["film-2"],
    });

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-2"]);
  });

  it("requiredGenres and curatedFilmIds are additive — a candidate matching either qualifies", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Horror"]),
      candidate("entry-2", "film-2", ["Comedy"]),
      candidate("entry-3", "film-3", ["Drama"]),
    ];

    const result = resolveEligibleCandidates(candidates, {
      requiredGenres: ["Horror"],
      curatedFilmIds: ["film-2"],
    });

    expect(new Set(result.map((c) => c.watchlistEntryId))).toEqual(
      new Set(["entry-1", "entry-2"]),
    );
  });

  it("deduplicates a candidate that matches both the genre and curated sources — it appears exactly once", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Horror"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, {
      requiredGenres: ["Horror"],
      curatedFilmIds: ["film-1"],
    });

    expect(result).toHaveLength(1);
    expect(result[0].watchlistEntryId).toBe("entry-1");
  });

  it("an empty candidate pool with rules configured returns empty, not an error", () => {
    expect(
      resolveEligibleCandidates([], { requiredGenres: ["Horror"] }),
    ).toEqual([]);
  });

  it("maxAverageRating: a rating at or below the ceiling qualifies, 3.5 exactly included", () => {
    const candidates = [
      candidate("entry-1", "film-1", null, 3.5),
      candidate("entry-2", "film-2", null, 3.4),
      candidate("entry-3", "film-3", null, 3.6),
    ];

    const result = resolveEligibleCandidates(candidates, {
      maxAverageRating: 3.5,
    });

    expect(new Set(result.map((c) => c.watchlistEntryId))).toEqual(
      new Set(["entry-1", "entry-2"]),
    );
  });

  it("maxAverageRating: a film with no average rating never qualifies through the rating path", () => {
    const candidates = [candidate("entry-1", "film-1", null, null)];

    const result = resolveEligibleCandidates(candidates, {
      maxAverageRating: 3.5,
    });

    expect(result).toEqual([]);
  });

  it("maxAverageRating and curatedFilmIds are additive — a high-rated but curated film still qualifies", () => {
    const candidates = [
      candidate("entry-1", "film-1", null, 4.2),
      candidate("entry-2", "film-2", null, 3.0),
      candidate("entry-3", "film-3", null, 4.5),
    ];

    const result = resolveEligibleCandidates(candidates, {
      maxAverageRating: 3.5,
      curatedFilmIds: ["film-1"],
    });

    expect(new Set(result.map((c) => c.watchlistEntryId))).toEqual(
      new Set(["entry-1", "entry-2"]),
    );
  });

  it("maxAverageRating and curatedFilmIds: a curated, missing-rating film still qualifies through the curated path alone", () => {
    const candidates = [candidate("entry-1", "film-1", null, null)];

    const result = resolveEligibleCandidates(candidates, {
      maxAverageRating: 3.5,
      curatedFilmIds: ["film-1"],
    });

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  it("maxAverageRating: deduplicates a candidate that qualifies through both rating and curated", () => {
    const candidates = [candidate("entry-1", "film-1", null, 2.0)];

    const result = resolveEligibleCandidates(candidates, {
      maxAverageRating: 3.5,
      curatedFilmIds: ["film-1"],
    });

    expect(result).toHaveLength(1);
  });

  it("a literal duplicate film id within curatedFilmIds itself never produces a duplicate candidate", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Drama"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, {
      curatedFilmIds: ["film-1", "film-1", "film-1"],
    });

    expect(result).toHaveLength(1);
    expect(result[0].watchlistEntryId).toBe("entry-1");
  });
});

describe("The Watchlist Frontier eligibility (event system Phase 7)", () => {
  const frontierRules = getEventDefinition(
    WATCHLIST_FRONTIER_EVENT_ID,
  )!.eligibilityRules;

  it("normal Western qualifies — a film tagged Western is eligible via the event's real requiredGenres rule", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Western"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, frontierRules);

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  it("unrelated film does not qualify — neither Western-genre nor curated", () => {
    const candidates = [candidate("entry-1", "film-1", ["Comedy", "Drama"])];

    const result = resolveEligibleCandidates(candidates, frontierRules);

    expect(result).toEqual([]);
  });

  it("empty curated list is safe — the event's real (currently empty) curatedFilmIds never throws and adds nothing beyond the genre rule", () => {
    expect(frontierRules.curatedFilmIds).toEqual([]);

    const candidates = [
      candidate("entry-1", "film-1", ["Western"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, frontierRules);

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  // The following two use a synthetic, non-empty curatedFilmIds list (the
  // real registered event's own list is deliberately empty — see
  // `event-registry.ts` — since no approved Neo-Western list exists in
  // the project yet). This proves the mechanism a real curated list would
  // exercise once one is added, without fabricating actual film content.
  it("curated Neo-Western qualifies — a non-Western-genre film in the curated list is still eligible", () => {
    const rulesWithCuratedNeoWestern = {
      ...frontierRules,
      curatedFilmIds: ["neo-western-1"],
    };
    const candidates = [
      candidate("entry-1", "neo-western-1", ["Crime", "Drama"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(
      candidates,
      rulesWithCuratedNeoWestern,
    );

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  it("duplicate eligibility yields one candidate — a Western-genre film that's also on the curated list appears exactly once", () => {
    const rulesWithCuratedNeoWestern = {
      ...frontierRules,
      curatedFilmIds: ["film-1"],
    };
    const candidates = [candidate("entry-1", "film-1", ["Western"])];

    const result = resolveEligibleCandidates(
      candidates,
      rulesWithCuratedNeoWestern,
    );

    expect(result).toHaveLength(1);
    expect(result[0].watchlistEntryId).toBe("entry-1");
  });
});

describe("Signal from Beyond eligibility (event system Phase 6)", () => {
  const signalRules = getEventDefinition(
    SIGNAL_FROM_BEYOND_EVENT_ID,
  )!.eligibilityRules;

  it("ordinary sci-fi film qualifies — a film tagged Science Fiction is eligible via the event's real requiredGenres rule", () => {
    const candidates = [
      candidate("entry-1", "film-1", ["Science Fiction"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, signalRules);

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  it("unrelated film does not qualify — neither sci-fi-genre nor whitelisted", () => {
    const candidates = [candidate("entry-1", "film-1", ["Comedy", "Drama"])];

    const result = resolveEligibleCandidates(candidates, signalRules);

    expect(result).toEqual([]);
  });

  it("empty custom whitelist remains safe — the event's real (currently empty) curatedFilmIds never throws and adds nothing beyond the genre rule", () => {
    expect(signalRules.curatedFilmIds).toEqual([]);

    const candidates = [
      candidate("entry-1", "film-1", ["Science Fiction"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, signalRules);

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  // The following two use a synthetic, non-empty curatedFilmIds list (the
  // real registered event's own whitelist is deliberately empty — see
  // `event-registry.ts` — since no approved sci-fi whitelist exists in the
  // project yet). This proves the mechanism a real whitelist would
  // exercise once one is added, without fabricating actual film content.
  it("whitelist-only film qualifies — a non-sci-fi-genre film on the curated whitelist is still eligible", () => {
    const rulesWithWhitelist = {
      ...signalRules,
      curatedFilmIds: ["whitelisted-1"],
    };
    const candidates = [
      candidate("entry-1", "whitelisted-1", ["Mystery", "Drama"]),
      candidate("entry-2", "film-2", ["Comedy"]),
    ];

    const result = resolveEligibleCandidates(candidates, rulesWithWhitelist);

    expect(result.map((c) => c.watchlistEntryId)).toEqual(["entry-1"]);
  });

  it("duplicate eligibility produces one candidate — a Science Fiction film that's also on the whitelist appears exactly once", () => {
    const rulesWithWhitelist = {
      ...signalRules,
      curatedFilmIds: ["film-1"],
    };
    const candidates = [candidate("entry-1", "film-1", ["Science Fiction"])];

    const result = resolveEligibleCandidates(candidates, rulesWithWhitelist);

    expect(result).toHaveLength(1);
    expect(result[0].watchlistEntryId).toBe("entry-1");
  });
});
