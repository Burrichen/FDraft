import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { watchlistAgeChallenges } from "./watchlist-age";
import { buildContext, buildFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = watchlistAgeChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("watchlistAgeChallenges", () => {
  it("registers exactly the 15 watchlist age/time challenges with unique ids", () => {
    const ids = watchlistAgeChallenges.map((c) => c.id);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    expect(
      watchlistAgeChallenges.every((c) => c.category === "watchlist-age"),
    ).toBe(true);
    expect(watchlistAgeChallenges.every((c) => c.interactive === false)).toBe(
      true,
    );
  });

  describe("the-eldest", () => {
    const challenge = findChallenge("the-eldest");

    it("picks the film with the oldest release year", () => {
      const oldest = buildFilm({ releaseYear: 1950 });
      const context = buildContext({
        candidates: [
          buildFilm({ releaseYear: 2000 }),
          oldest,
          buildFilm({ releaseYear: 1980 }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(true);
      const result = challenge.attempt(context);
      expect(result).toMatchObject({ status: "success", film: oldest });
    });

    it("is ineligible when no film has a known release year", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      });
    });

    it("is ineligible for an empty watchlist", () => {
      const context = buildContext({ candidates: [] });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("breaks a tie between films sharing the oldest release year", () => {
      const tiedA = buildFilm({ releaseYear: 1950 });
      const tiedB = buildFilm({ releaseYear: 1950 });
      const context = buildContext({
        candidates: [tiedA, tiedB, buildFilm({ releaseYear: 2000 })],
      });
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt({
          ...context,
          rng: createSeededRng(seed),
        });
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.size).toBeGreaterThan(0);
      for (const id of seen) {
        expect([tiedA.filmId, tiedB.filmId]).toContain(id);
      }
    });

    it("handles a single-candidate watchlist", () => {
      const only = buildFilm({ releaseYear: 1999 });
      const result = challenge.attempt(buildContext({ candidates: [only] }));
      expect(result).toMatchObject({ status: "success", film: only });
    });
  });

  describe("the-ancient-ones", () => {
    const challenge = findChallenge("the-ancient-ones");

    it("only ever picks from the ten oldest additions", () => {
      const films = Array.from({ length: 20 }, (_, i) =>
        buildFilm({ dateAdded: `2024-01-${String(i + 1).padStart(2, "0")}` }),
      );
      const oldest10Ids = new Set(films.slice(0, 10).map((f) => f.filmId));
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
        if (result.status === "success") {
          expect(oldest10Ids.has(result.film.filmId)).toBe(true);
        }
      }
    });

    it("is ineligible for an empty watchlist", () => {
      const context = buildContext({ candidates: [] });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });

    it("works fine with fewer than ten candidates (boundary)", () => {
      const films = [buildFilm(), buildFilm(), buildFilm()];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
    });
  });

  describe("archaeological-dig", () => {
    const challenge = findChallenge("archaeological-dig");

    it("only picks from the oldest 20% by date added", () => {
      const films = Array.from({ length: 10 }, (_, i) =>
        buildFilm({ dateAdded: `2024-01-${String(i + 1).padStart(2, "0")}` }),
      );
      const oldestFifthIds = new Set(films.slice(0, 2).map((f) => f.filmId));
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") {
          expect(oldestFifthIds.has(result.film.filmId)).toBe(true);
        }
      }
    });

    it("is ineligible for an empty watchlist", () => {
      expect(challenge.attempt(buildContext({ candidates: [] }))).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });

    it("still returns a film for a single-film watchlist (percentile boundary)", () => {
      const only = buildFilm();
      const result = challenge.attempt(buildContext({ candidates: [only] }));
      expect(result).toMatchObject({ status: "success", film: only });
    });
  });

  describe("fresh-meat", () => {
    const challenge = findChallenge("fresh-meat");

    it("only ever picks from the ten newest additions", () => {
      const films = Array.from({ length: 20 }, (_, i) =>
        buildFilm({ dateAdded: `2024-01-${String(i + 1).padStart(2, "0")}` }),
      );
      const newest10Ids = new Set(films.slice(10).map((f) => f.filmId));
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") {
          expect(newest10Ids.has(result.film.filmId)).toBe(true);
        }
      }
    });

    it("is ineligible for an empty watchlist", () => {
      expect(challenge.attempt(buildContext({ candidates: [] }))).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });
  });

  describe("forgotten-middle-child", () => {
    const challenge = findChallenge("forgotten-middle-child");

    it("picks the single middle entry for an odd-length watchlist", () => {
      const films = Array.from({ length: 5 }, (_, i) =>
        buildFilm({ dateAdded: `2024-01-${String(i + 1).padStart(2, "0")}` }),
      );
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result).toMatchObject({ status: "success", film: films[2] });
    });

    it("breaks the tie between the two middle entries for an even-length watchlist", () => {
      const films = Array.from({ length: 4 }, (_, i) =>
        buildFilm({ dateAdded: `2024-01-${String(i + 1).padStart(2, "0")}` }),
      );
      const middlePair = new Set([films[1].filmId, films[2].filmId]);
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") {
          expect(middlePair.has(result.film.filmId)).toBe(true);
          seen.add(result.film.filmId);
        }
      }
      expect(seen.size).toBeGreaterThan(0);
    });

    it("is ineligible for an empty watchlist", () => {
      expect(challenge.attempt(buildContext({ candidates: [] }))).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });

    it("handles a single-film watchlist (boundary)", () => {
      const only = buildFilm();
      expect(
        challenge.attempt(buildContext({ candidates: [only] })),
      ).toMatchObject({
        status: "success",
        film: only,
      });
    });
  });

  describe("the-100-club", () => {
    const challenge = findChallenge("the-100-club");

    it("selects a film sitting at ordinal position 100 (stored position 99)", () => {
      const milestoneFilm = buildFilm({ position: 99 });
      const context = buildContext({
        candidates: [buildFilm({ position: 5 }), milestoneFilm],
      });
      expect(challenge.isEligible(context)).toBe(true);
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: milestoneFilm,
      });
    });

    it("is ineligible when no active film sits at a milestone position", () => {
      const context = buildContext({
        candidates: [buildFilm({ position: 5 }), buildFilm({ position: 98 })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_active_film_at_milestone_position",
      });
    });

    it("treats a null position as never a milestone", () => {
      const context = buildContext({
        candidates: [buildFilm({ position: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("boundary: ordinal 1 (stored position 0) is not a milestone", () => {
      const context = buildContext({
        candidates: [buildFilm({ position: 0 })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("boundary: ordinal 200 (stored position 199) is a milestone", () => {
      const film = buildFilm({ position: 199 });
      const context = buildContext({ candidates: [film] });
      expect(challenge.isEligible(context)).toBe(true);
    });
  });

  describe("buried-treasure", () => {
    const challenge = findChallenge("buried-treasure");

    it("picks a highly-rated film from the oldest quartile", () => {
      const winner = buildFilm({ dateAdded: "2024-01-01", averageRating: 4.5 });
      const context = buildContext({
        candidates: [
          winner,
          buildFilm({ dateAdded: "2024-06-01", averageRating: 4.8 }), // high rating but not in oldest 25%
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when the oldest quartile has no film rated 4.0+", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ dateAdded: "2024-01-01", averageRating: 3.5 }),
        ],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_oldest_quartile_films_rated_4_plus",
      });
    });

    it("is ineligible when rating metadata is entirely missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ averageRating: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("boundary: exactly 4.0 qualifies", () => {
      const film = buildFilm({ dateAdded: "2024-01-01", averageRating: 4.0 });
      expect(
        challenge.attempt(buildContext({ candidates: [film] })),
      ).toMatchObject({
        status: "success",
        film,
      });
    });

    it("declares average_rating as a required capability", () => {
      expect(challenge.requiredCapabilities).toContain("average_rating");
    });
  });

  describe("spring-cleaning", () => {
    const challenge = findChallenge("spring-cleaning");

    it("only picks from the 25 oldest active entries", () => {
      const films = Array.from({ length: 30 }, (_, i) =>
        buildFilm({
          dateAdded: `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
        }),
      );
      const oldest25Ids = new Set(films.slice(0, 25).map((f) => f.filmId));
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        if (result.status === "success") {
          expect(oldest25Ids.has(result.film.filmId)).toBe(true);
        }
      }
    });

    it("is ineligible for an empty watchlist", () => {
      expect(challenge.attempt(buildContext({ candidates: [] }))).toEqual({
        status: "ineligible",
        reason: "no_active_watchlist_films",
      });
    });
  });

  describe("decade-roulette", () => {
    const challenge = findChallenge("decade-roulette");

    it("only picks a film from one single decade", () => {
      const films = [
        buildFilm({ releaseYear: 1985 }),
        buildFilm({ releaseYear: 1992 }),
        buildFilm({ releaseYear: 2015 }),
      ];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
      if (result.status === "success") {
        const decadeFilms = films.filter(
          (f) =>
            Math.floor((f.releaseYear ?? 0) / 10) ===
            Math.floor((result.film.releaseYear ?? 0) / 10),
        );
        expect(decadeFilms.map((f) => f.filmId)).toContain(result.film.filmId);
      }
    });

    it("is ineligible when no film has a known release year", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ releaseYear: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      });
    });

    it("chooses decades with roughly equal probability regardless of how many films each has", () => {
      // A heavily-populated 1990s decade vs a single 2010s film — equal probability
      // between decades means the lone film should get picked a meaningful share of the time.
      const ninetiesFilms = Array.from({ length: 20 }, () =>
        buildFilm({ releaseYear: 1995 }),
      );
      const lone2010sFilm = buildFilm({ releaseYear: 2015 });
      const rng = createSeededRng(7);
      let loneFilmPicks = 0;
      const trials = 400;
      for (let i = 0; i < trials; i++) {
        const result = challenge.attempt(
          buildContext({ candidates: [...ninetiesFilms, lone2010sFilm], rng }),
        );
        if (
          result.status === "success" &&
          result.film.filmId === lone2010sFilm.filmId
        ) {
          loneFilmPicks++;
        }
      }
      // Expect roughly half (two decades, equal probability) — assert it's not
      // drowned out by the 20:1 film-count imbalance (which would predict ~5%).
      expect(loneFilmPicks / trials).toBeGreaterThan(0.3);
    });
  });

  describe("birth-of-cinema", () => {
    const challenge = findChallenge("birth-of-cinema");

    it("picks the film with the oldest release year", () => {
      const oldest = buildFilm({ releaseYear: 1920 });
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 2000 }), oldest],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: oldest,
      });
    });

    it("is ineligible when no film has a known release year", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ releaseYear: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      });
    });

    it("breaks a tie between films sharing the oldest release year", () => {
      const tiedA = buildFilm({ releaseYear: 1920 });
      const tiedB = buildFilm({ releaseYear: 1920 });
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [tiedA, tiedB],
            rng: createSeededRng(seed),
          }),
        );
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.size).toBeGreaterThan(0);
    });
  });

  describe("temporal-opposite", () => {
    const challenge = findChallenge("temporal-opposite");

    it("requires a previous draft pick", () => {
      expect(challenge.requiredCapabilities).toContain("previous_draft_pick");
      const context = buildContext({
        candidates: [buildFilm()],
        previousPicks: [],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_previous_draft_pick",
      });
    });

    it("is ineligible when the previous pick has no known release year", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        previousPicks: [buildFilm({ releaseYear: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "previous_pick_missing_release_year",
      });
    });

    it("chooses from the oldest decade when the previous pick is from 2000 or later", () => {
      const oldFilm = buildFilm({ releaseYear: 1950 });
      const context = buildContext({
        candidates: [oldFilm, buildFilm({ releaseYear: 1990 })],
        previousPicks: [buildFilm({ releaseYear: 2010 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: oldFilm,
      });
    });

    it("boundary: a previous pick from exactly year 2000 uses the oldest-decade branch", () => {
      const oldFilm = buildFilm({ releaseYear: 1950 });
      const context = buildContext({
        candidates: [oldFilm],
        previousPicks: [buildFilm({ releaseYear: 2000 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: oldFilm,
      });
    });

    it("chooses a film from 2000 onward when the previous pick is before 2000", () => {
      const modernFilm = buildFilm({ releaseYear: 2010 });
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 1980 }), modernFilm],
        previousPicks: [buildFilm({ releaseYear: 1999 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: modernFilm,
      });
    });

    it("is ineligible when the pre-2000 branch has no films from 2000 onward", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 1980 })],
        previousPicks: [buildFilm({ releaseYear: 1990 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_from_2000_onward",
      });
    });
  });

  describe("turn-of-the-millennium", () => {
    const challenge = findChallenge("turn-of-the-millennium");

    it("picks a film released in 1999, 2000, or 2001", () => {
      const winner = buildFilm({ releaseYear: 2000 });
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 1995 }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film falls in 1999-2001", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ releaseYear: 1995 })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_from_1999_to_2001",
      });
    });

    it("boundary: 1998 and 2002 are excluded", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ releaseYear: 1998 }),
          buildFilm({ releaseYear: 2002 }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("boundary: 1999 and 2001 are included", () => {
      const context1999 = buildContext({
        candidates: [buildFilm({ releaseYear: 1999 })],
      });
      const context2001 = buildContext({
        candidates: [buildFilm({ releaseYear: 2001 })],
      });
      expect(challenge.isEligible(context1999)).toBe(true);
      expect(challenge.isEligible(context2001)).toBe(true);
    });
  });

  describe("decade-survivor", () => {
    const challenge = findChallenge("decade-survivor");

    it("picks from the decade with the fewest films", () => {
      const survivor = buildFilm({ releaseYear: 2015 });
      const context = buildContext({
        candidates: [
          buildFilm({ releaseYear: 1990 }),
          buildFilm({ releaseYear: 1995 }),
          survivor,
        ],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: survivor,
      });
    });

    it("is ineligible when no film has a known release year", () => {
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm({ releaseYear: null })] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      });
    });

    it("resolves a tie between equally-small decades randomly", () => {
      const decadeA = buildFilm({ releaseYear: 1990 });
      const decadeB = buildFilm({ releaseYear: 2010 });
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [decadeA, decadeB],
            rng: createSeededRng(seed),
          }),
        );
        if (result.status === "success") seen.add(result.film.filmId);
      }
      expect(seen.has(decadeA.filmId) || seen.has(decadeB.filmId)).toBe(true);
    });
  });

  describe("generational-leap", () => {
    const challenge = findChallenge("generational-leap");

    it("requires a previous draft pick", () => {
      expect(challenge.requiredCapabilities).toContain("previous_draft_pick");
      expect(
        challenge.attempt(
          buildContext({ candidates: [buildFilm()], previousPicks: [] }),
        ),
      ).toEqual({
        status: "ineligible",
        reason: "no_previous_draft_pick",
      });
    });

    it("is ineligible when the previous pick has no known release year", () => {
      const context = buildContext({
        candidates: [buildFilm()],
        previousPicks: [buildFilm({ releaseYear: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "previous_pick_missing_release_year",
      });
    });

    it("picks a film at least 30 release years apart", () => {
      const farFilm = buildFilm({ releaseYear: 1970 });
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 2005 }), farFilm],
        previousPicks: [buildFilm({ releaseYear: 2000 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: farFilm,
      });
    });

    it("boundary: exactly 30 years apart qualifies", () => {
      const film = buildFilm({ releaseYear: 1970 });
      const context = buildContext({
        candidates: [film],
        previousPicks: [buildFilm({ releaseYear: 2000 })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film,
      });
    });

    it("boundary: 29 years apart does not qualify", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 1971 })],
        previousPicks: [buildFilm({ releaseYear: 2000 })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_at_least_30_years_apart",
      });
    });
  });

  describe("calendar-match", () => {
    const challenge = findChallenge("calendar-match");

    it.each([
      ["2026-09-15", 9], // September = 9
      ["2026-10-15", 0], // October = 0
      ["2026-11-15", 1], // November = 1
      ["2026-12-15", 2], // December = 2
    ])("matches the spec's worked example for %s", (isoDate, expectedDigit) => {
      const winner = buildFilm({ releaseYear: 2000 + expectedDigit });
      const context = buildContext({
        candidates: [winner],
        now: new Date(`${isoDate}T00:00:00.000Z`),
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film's release year matches the digit", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: 2003 })],
        now: new Date("2026-09-15T00:00:00.000Z"), // digit 9
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_film_matching_calendar_digit",
      });
    });

    it("is ineligible when no film has a known release year", () => {
      const context = buildContext({
        candidates: [buildFilm({ releaseYear: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });
});
