import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/domain/shared/rng";
import { countryLanguageChallenges } from "./country-language";
import { buildContext, buildFilm } from "./test-helpers";

function findChallenge(id: string) {
  const challenge = countryLanguageChallenges.find((c) => c.id === id);
  if (!challenge) throw new Error(`challenge not registered: ${id}`);
  return challenge;
}

describe("countryLanguageChallenges", () => {
  it("registers exactly the 6 country/language challenges with unique ids", () => {
    const ids = countryLanguageChallenges.map((c) => c.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(
      countryLanguageChallenges.every((c) => c.category === "country-language"),
    ).toBe(true);
    expect(
      countryLanguageChallenges.every((c) => c.interactive === false),
    ).toBe(true);
  });

  describe("passport-control", () => {
    const challenge = findChallenge("passport-control");

    it("only picks a film from the chosen country", () => {
      const films = [
        buildFilm({ countries: ["France"] }),
        buildFilm({ countries: ["Japan"] }),
      ];
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
      }
    });

    it("gives every country equal probability regardless of film count", () => {
      const franceFilms = Array.from({ length: 20 }, () =>
        buildFilm({ countries: ["France"] }),
      );
      const loneJapanFilm = buildFilm({ countries: ["Japan"] });
      let japanPicks = 0;
      const trials = 400;
      for (let i = 0; i < trials; i++) {
        const result = challenge.attempt(
          buildContext({
            candidates: [...franceFilms, loneJapanFilm],
            rng: createSeededRng(i),
          }),
        );
        if (
          result.status === "success" &&
          result.film.filmId === loneJapanFilm.filmId
        )
          japanPicks++;
      }
      expect(japanPicks / trials).toBeGreaterThan(0.3);
    });

    it("is ineligible when no film has a known country", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_country",
      });
    });
  });

  describe("language-roulette", () => {
    const challenge = findChallenge("language-roulette");

    it("only picks a film containing the chosen language", () => {
      const films = [
        buildFilm({ languages: ["French"] }),
        buildFilm({ languages: ["Japanese"] }),
      ];
      for (let seed = 0; seed < 20; seed++) {
        const result = challenge.attempt(
          buildContext({ candidates: films, rng: createSeededRng(seed) }),
        );
        expect(result.status).toBe("success");
      }
    });

    it("is ineligible when no film has known language metadata", () => {
      const context = buildContext({
        candidates: [buildFilm({ languages: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_films_with_known_language",
      });
    });
  });

  describe("no-english-allowed", () => {
    const challenge = findChallenge("no-english-allowed");

    it("picks a random film whose primary language is not English", () => {
      const winner = buildFilm({ primaryLanguage: "Japanese" });
      const context = buildContext({
        candidates: [buildFilm({ primaryLanguage: "English" }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when every known primary language is English", () => {
      const context = buildContext({
        candidates: [buildFilm({ primaryLanguage: "English" })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_non_english_films",
      });
    });

    it("is ineligible when primary language metadata is entirely unavailable", () => {
      // languages (plural, unordered) present, but primaryLanguage (canonical) is not —
      // must not substitute the former for the latter.
      const context = buildContext({
        candidates: [
          buildFilm({
            languages: ["English", "French"],
            primaryLanguage: null,
          }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is case-insensitive when comparing against English", () => {
      const context = buildContext({
        candidates: [buildFilm({ primaryLanguage: "ENGLISH" })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("world-cup", () => {
    const challenge = findChallenge("world-cup");

    it("draws four countries and picks a film from the surviving one, recorded in displayValue", () => {
      const films = [
        buildFilm({ countries: ["France"] }),
        buildFilm({ countries: ["Japan"] }),
        buildFilm({ countries: ["Brazil"] }),
        buildFilm({ countries: ["Germany"] }),
        buildFilm({ countries: ["Italy"] }),
      ];
      const result = challenge.attempt(buildContext({ candidates: films }));
      expect(result.status).toBe("success");
      if (result.status === "success") {
        const countries = result.displayValue?.countries as string[];
        const winner = result.displayValue?.winner as string;
        expect(countries).toHaveLength(4);
        expect(new Set(countries).size).toBe(4);
        expect(countries).toContain(winner);
        expect(result.film.countries).toContain(winner);
      }
    });

    it("is ineligible with fewer than four countries represented", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ countries: ["France"] }),
          buildFilm({ countries: ["Japan"] }),
          buildFilm({ countries: ["Brazil"] }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "fewer_than_four_countries_represented",
      });
    });

    it("boundary: exactly four countries represented is eligible", () => {
      const context = buildContext({
        candidates: [
          buildFilm({ countries: ["France"] }),
          buildFilm({ countries: ["Japan"] }),
          buildFilm({ countries: ["Brazil"] }),
          buildFilm({ countries: ["Germany"] }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(true);
    });

    it("is ineligible when no film has known country metadata", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("continental-drift", () => {
    const challenge = findChallenge("continental-drift");

    it("requires a previous draft pick", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: ["France"] })],
        previousPicks: [],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_previous_draft_pick",
      });
    });

    it("is ineligible when the previous pick has no known country", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: ["France"] })],
        previousPicks: [buildFilm({ countries: null })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "previous_pick_missing_countries",
      });
    });

    it("picks a film that does not share the previous pick's country", () => {
      const winner = buildFilm({ countries: ["Japan"] });
      const context = buildContext({
        candidates: [buildFilm({ countries: ["France"] }), winner],
        previousPicks: [buildFilm({ countries: ["France"] })],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("excludes a film sharing even one country", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: ["France", "Germany"] })],
        previousPicks: [buildFilm({ countries: ["France"] })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });

  describe("weeb", () => {
    const challenge = findChallenge("weeb");

    it("picks a random Japanese film by country of origin", () => {
      const winner = buildFilm({ countries: ["Japan"] });
      const context = buildContext({
        candidates: [buildFilm({ countries: ["France"] }), winner],
      });
      expect(challenge.attempt(context)).toMatchObject({
        status: "success",
        film: winner,
      });
    });

    it("is ineligible when no film is from Japan", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: ["France"] })],
      });
      expect(challenge.attempt(context)).toEqual({
        status: "ineligible",
        reason: "no_japanese_films_by_country_of_origin",
      });
    });

    it("does not guess Japanese origin from language or title", () => {
      // Japanese-language film but produced in the US, say — country data must govern, not language.
      const context = buildContext({
        candidates: [
          buildFilm({
            languages: ["Japanese"],
            countries: ["United States of America"],
          }),
        ],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });

    it("is ineligible when country metadata is entirely missing", () => {
      const context = buildContext({
        candidates: [buildFilm({ countries: null })],
      });
      expect(challenge.isEligible(context)).toBe(false);
    });
  });
});
