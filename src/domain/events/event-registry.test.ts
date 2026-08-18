import { afterEach, describe, expect, it } from "vitest";
import { setJanuaryManifestCuratedFilmIds } from "./january-manifest-overlay";
import {
  EVENT_DEFINITIONS,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
  getEventDefinition,
  isJanuaryEligibleFilm,
} from "./event-registry";

describe("event-registry", () => {
  it("registers F* You, It's January!, Halloween, The Watchlist Frontier, and Signal from Beyond", () => {
    expect(EVENT_DEFINITIONS).toHaveLength(4);
    expect(EVENT_DEFINITIONS.map((event) => event.id)).toEqual([
      F_YOU_ITS_JANUARY_EVENT_ID,
      HALLOWEEN_EVENT_ID,
      WATCHLIST_FRONTIER_EVENT_ID,
      SIGNAL_FROM_BEYOND_EVENT_ID,
    ]);
    expect(EVENT_DEFINITIONS[0].name).toBe("F* You, It's January!");
    expect(EVENT_DEFINITIONS[1].name).toBe("Halloween");
    expect(EVENT_DEFINITIONS[2].name).toBe("The Watchlist Frontier");
    expect(EVENT_DEFINITIONS[3].name).toBe("Signal from Beyond");
  });

  it("is naturally available 25–31 January every year, manually activatable the rest of the year, and awards Misery Points when normally active", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.availability).toEqual({
      startsAt: null,
      endsAt: null,
      recurringMonths: null,
      recurringMonthDayRange: {
        startMonth: 1,
        startDay: 25,
        endMonth: 1,
        endDay: 31,
      },
    });
    expect(event?.manualActivationAllowed).toBe(true);
    expect(event?.pointType).toBe("misery");
  });

  it("uses normal FDraft drafting rules — only eligibility is restricted", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.draftRules).toEqual({});
  });

  it("is eligible for films rated 3.5 or lower, or on the curated whitelist", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.eligibilityRules.maxAverageRating).toBe(3.5);
    expect(event?.eligibilityRules.curatedFilmIds).toEqual([]);
  });

  it("supplies intro content for the generic event introduction modal", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.intro.description.length).toBeGreaterThan(0);
    expect(event?.intro.bullets.length).toBeGreaterThan(0);
  });

  it("has a visual theme id, for when Event visuals are enabled", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.visualTheme).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });

  it("getEventDefinition returns null for an unknown id", () => {
    expect(getEventDefinition("some-unregistered-event")).toBeNull();
  });

  describe("Halloween", () => {
    it("has no defined natural availability window — manual activation only, since no real date exists yet", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.availability).toEqual({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: null,
      });
      expect(event?.manualActivationAllowed).toBe(true);
    });

    it("has no dedicated reward currency defined yet — resolves to generic/Lifetime Points", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.pointType).toBeNull();
    });

    it("has no curated eligibility data defined yet — uses normal FDraft drafting/eligibility", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.draftRules).toEqual({});
      expect(event?.eligibilityRules).toEqual({
        requiredGenres: null,
        curatedFilmIds: null,
      });
    });

    it("has no visual theme defined yet", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.visualTheme).toBeNull();
    });

    it("supplies intro content for the generic event introduction modal", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.intro.description.length).toBeGreaterThan(0);
      expect(event?.intro.bullets.length).toBeGreaterThan(0);
    });
  });

  describe("The Watchlist Frontier", () => {
    it("has no defined natural availability window — manual activation only, since no existing date configuration was found", () => {
      const event = getEventDefinition(WATCHLIST_FRONTIER_EVENT_ID);
      expect(event?.availability).toEqual({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: null,
      });
      expect(event?.manualActivationAllowed).toBe(true);
    });

    it("awards Bounty Points when normally active", () => {
      const event = getEventDefinition(WATCHLIST_FRONTIER_EVENT_ID);
      expect(event?.pointType).toBe("bounty");
    });

    it("is eligible via normal Western genre OR the curated Neo-Western list, currently empty (no such list exists in the project yet)", () => {
      const event = getEventDefinition(WATCHLIST_FRONTIER_EVENT_ID);
      expect(event?.eligibilityRules.requiredGenres).toEqual(["Western"]);
      expect(event?.eligibilityRules.curatedFilmIds).toEqual([]);
    });

    it("uses normal FDraft drafting rules — no Frontier-specific draft generation logic", () => {
      const event = getEventDefinition(WATCHLIST_FRONTIER_EVENT_ID);
      expect(event?.draftRules).toEqual({});
    });

    it("has a visual theme id, for when Event visuals are enabled", () => {
      const event = getEventDefinition(WATCHLIST_FRONTIER_EVENT_ID);
      expect(event?.visualTheme).toBe(WATCHLIST_FRONTIER_EVENT_ID);
    });

    it("supplies intro content for the generic event introduction modal", () => {
      const event = getEventDefinition(WATCHLIST_FRONTIER_EVENT_ID);
      expect(event?.intro.description.length).toBeGreaterThan(0);
      expect(event?.intro.bullets.length).toBeGreaterThan(0);
    });
  });

  describe("Signal from Beyond", () => {
    it("has no defined natural availability window — manual activation only, since no existing date configuration was found", () => {
      const event = getEventDefinition(SIGNAL_FROM_BEYOND_EVENT_ID);
      expect(event?.availability).toEqual({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: null,
      });
      expect(event?.manualActivationAllowed).toBe(true);
    });

    it("awards Signal Points when normally active", () => {
      const event = getEventDefinition(SIGNAL_FROM_BEYOND_EVENT_ID);
      expect(event?.pointType).toBe("signal");
    });

    it("is eligible via normal Science Fiction genre OR the curated whitelist, currently empty (no such list exists in the project yet)", () => {
      const event = getEventDefinition(SIGNAL_FROM_BEYOND_EVENT_ID);
      expect(event?.eligibilityRules.requiredGenres).toEqual([
        "Science Fiction",
      ]);
      expect(event?.eligibilityRules.curatedFilmIds).toEqual([]);
    });

    it("uses normal FDraft drafting rules — no Signal-from-Beyond-specific draft generation logic", () => {
      const event = getEventDefinition(SIGNAL_FROM_BEYOND_EVENT_ID);
      expect(event?.draftRules).toEqual({});
    });

    it("has a visual theme id, for when Event visuals are enabled", () => {
      const event = getEventDefinition(SIGNAL_FROM_BEYOND_EVENT_ID);
      expect(event?.visualTheme).toBe(SIGNAL_FROM_BEYOND_EVENT_ID);
    });

    it("supplies intro content for the generic event introduction modal", () => {
      const event = getEventDefinition(SIGNAL_FROM_BEYOND_EVENT_ID);
      expect(event?.intro.description.length).toBeGreaterThan(0);
      expect(event?.intro.bullets.length).toBeGreaterThan(0);
    });
  });
});

describe("getEventDefinition — January manifest overlay (docs/updates, GLOBAL CURATED JANUARY LIST)", () => {
  afterEach(() => {
    // The overlay is module-level mutable state shared across every test
    // in the process — never leave a non-empty value behind for a later,
    // unrelated test to accidentally inherit.
    setJanuaryManifestCuratedFilmIds([]);
  });

  it("with no overlay applied, curatedFilmIds stays the statically-declared empty list", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.eligibilityRules.curatedFilmIds).toEqual([]);
  });

  it("after the manifest overlay is applied, curatedFilmIds reflects it immediately", () => {
    setJanuaryManifestCuratedFilmIds(["film-a", "film-b"]);
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.eligibilityRules.curatedFilmIds).toEqual([
      "film-a",
      "film-b",
    ]);
    // The rating rule and every other field are untouched by the overlay.
    expect(event?.eligibilityRules.maxAverageRating).toBe(3.5);
  });

  it("never affects any other registered event", () => {
    setJanuaryManifestCuratedFilmIds(["film-a"]);
    expect(
      getEventDefinition(HALLOWEEN_EVENT_ID)?.eligibilityRules.curatedFilmIds,
    ).toBeNull();
  });
});

describe("isJanuaryEligibleFilm (docs/updates, JANUARY ELIGIBILITY RULES)", () => {
  afterEach(() => {
    setJanuaryManifestCuratedFilmIds([]);
  });

  it("qualifies a film rated 3.5 exactly", () => {
    expect(
      isJanuaryEligibleFilm({ filmId: "film-1", averageRating: 3.5 }),
    ).toBe(true);
  });

  it("qualifies a film rated below 3.5", () => {
    expect(
      isJanuaryEligibleFilm({ filmId: "film-1", averageRating: 1.2 }),
    ).toBe(true);
  });

  it("rejects a film rated above 3.5 and not curated", () => {
    expect(
      isJanuaryEligibleFilm({ filmId: "film-1", averageRating: 3.6 }),
    ).toBe(false);
  });

  it("rejects a film with no average rating and not curated — missing-rating films only qualify if explicitly curated", () => {
    expect(
      isJanuaryEligibleFilm({ filmId: "film-1", averageRating: null }),
    ).toBe(false);
  });

  it("qualifies a high-rated film that is on the curated whitelist", () => {
    setJanuaryManifestCuratedFilmIds(["film-1"]);
    expect(
      isJanuaryEligibleFilm({ filmId: "film-1", averageRating: 4.8 }),
    ).toBe(true);
  });

  it("qualifies a missing-rating film that is on the curated whitelist", () => {
    setJanuaryManifestCuratedFilmIds(["film-1"]);
    expect(
      isJanuaryEligibleFilm({ filmId: "film-1", averageRating: null }),
    ).toBe(true);
  });
});
