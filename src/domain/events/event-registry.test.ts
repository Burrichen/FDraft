import { describe, expect, it } from "vitest";
import {
  getCurrentOccurrenceBounds,
  isEventAvailable,
} from "./event-availability";
import {
  CHRISTMAS_EVENT_ID,
  EVENT_DEFINITIONS,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
  getEventDefinition,
} from "./event-registry";

describe("event-registry", () => {
  it("registers F* You, It's January!, Halloween, The Watchlist Frontier, Signal from Beyond, and Christmas", () => {
    expect(EVENT_DEFINITIONS).toHaveLength(5);
    expect(EVENT_DEFINITIONS.map((event) => event.id)).toEqual([
      F_YOU_ITS_JANUARY_EVENT_ID,
      HALLOWEEN_EVENT_ID,
      WATCHLIST_FRONTIER_EVENT_ID,
      SIGNAL_FROM_BEYOND_EVENT_ID,
      CHRISTMAS_EVENT_ID,
    ]);
    expect(EVENT_DEFINITIONS[0].name).toBe("F* You, It's January!");
    expect(EVENT_DEFINITIONS[1].name).toBe("Halloween");
    expect(EVENT_DEFINITIONS[2].name).toBe("The Watchlist Frontier");
    expect(EVENT_DEFINITIONS[3].name).toBe("Signal from Beyond");
    expect(EVENT_DEFINITIONS[4].name).toBe("Christmas");
  });

  it("is naturally available 25 January 00:00 through 1 February 00:00 exclusive every year, manually activatable the rest of the year, and awards Misery Points when normally active", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.availability).toEqual({
      startsAt: null,
      endsAt: null,
      recurringMonths: null,
      recurringMonthDayRange: {
        startMonth: 1,
        startDay: 25,
        endMonth: 2,
        endDay: 1,
        endHour: 0,
        endMinute: 0,
      },
    });
    expect(event?.manualActivationAllowed).toBe(true);
    expect(event?.pointType).toBe("misery");
    expect(event?.currency).toEqual({
      id: "misery",
      label: "Misery Points",
      pointsPerFilm: 1,
    });
  });

  it("is NOT available on 24 January, and IS available from 25 January through 31 January", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID)!;
    const at = (iso: string) =>
      isEventAvailable(event.availability, new Date(iso), "UTC");
    expect(at("2027-01-24T23:59:00.000Z")).toBe(false);
    expect(at("2027-01-25T00:00:00.000Z")).toBe(true);
    expect(at("2027-01-28T12:00:00.000Z")).toBe(true);
    expect(at("2027-01-31T23:59:00.000Z")).toBe(true);
    // 1 February 00:00 is exclusive.
    expect(at("2027-02-01T00:00:00.000Z")).toBe(false);
  });

  it("uses normal FDraft drafting rules — the one-film roll is the whole mechanic", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.draftRules).toEqual({});
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

  it("has a dedicated temporary Event Page", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.page).toEqual({
      route: "/events/january",
      navLabel: "January",
    });
  });

  it("has a fixed Event deadline pinned to its own occurrence's end, and a real Event-ending experience (FDRAFT UPDATE 1 — JANUARY EVENT-OVER EXPERIENCE)", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.fixedEventDeadline).toBe(true);
    expect(event?.ending?.enabled).toBe(true);
    expect(event?.ending?.message).toBe(
      "The world brightens. The January misery is forgotten as the first sun of the year burns through the clouds. The town of FDraft forgets what that awful phrase and people begin to smile again. They can rebuild.",
    );
    expect(event?.ending?.buttonLabel).toBe(
      "I made it through the worst month.",
    );
    // No ordinal "Nth annual" line is required by this event's copy.
    expect(event?.ending?.secondaryMessageTemplate).toBeUndefined();
  });

  it("getEventDefinition returns null for an unknown id", () => {
    expect(getEventDefinition("some-unregistered-event")).toBeNull();
  });

  describe("Halloween", () => {
    it("has a real, annually-recurring natural window — 30 September 19:00 through 1 November 00:00 exclusive — and cannot be manually started outside it", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.availability).toEqual({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: {
          startMonth: 9,
          startDay: 30,
          startHour: 19,
          startMinute: 0,
          endMonth: 11,
          endDay: 1,
          endHour: 0,
          endMinute: 0,
        },
      });
      expect(event?.manualActivationAllowed).toBe(false);
    });

    it("has a dedicated temporary Event Page and force-enables Event Visuals on join", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.page).toEqual({
        route: "/events/halloween",
        navLabel: "Halloween",
      });
      expect(event?.enableVisualsOnOptIn).toBe(true);
    });

    it("has its own Haunted Points currency, earned per film watched (see draft-completion-reward.test.ts for the earning mechanic itself)", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.pointType).toBe("haunted");
      expect(event?.currency).toEqual({
        id: "haunted",
        label: "Haunted Points",
        pointsPerFilm: 1,
      });
    });

    it("has no curated eligibility data defined yet — uses normal FDraft drafting/eligibility", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.draftRules).toEqual({});
      expect(event?.eligibilityRules).toEqual({
        requiredGenres: null,
        curatedFilmIds: null,
      });
    });

    it("uses its own id as its visual theme id (see PROMPT 20 — HIGH-EFFORT HALLOWEEN UI)", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.visualTheme).toBe(HALLOWEEN_EVENT_ID);
    });

    it("supplies intro content for the generic event introduction modal, with its own exact join/decline button copy", () => {
      const event = getEventDefinition(HALLOWEEN_EVENT_ID);
      expect(event?.intro.description.length).toBeGreaterThan(0);
      expect(event?.intro.bullets.length).toBeGreaterThan(0);
      expect(event?.intro.primaryActionLabel).toBe("Let me in.");
      expect(event?.intro.secondaryActionLabel).toBe(
        "I don't want to be scared!",
      );
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
      // No per-film `currency` configured (see docs/updates, "EVENT
      // SYSTEM — UNIVERSAL EVENT CURRENCY EARNING") — Frontier keeps its
      // pre-existing per-completion-only Bounty award, unchanged.
      expect(event?.currency).toBeFalsy();
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
      expect(event?.currency).toBeFalsy();
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

  describe("Christmas (docs/updates, FDRAFT UPDATE 1 — FESTIVE POINTS + EVENT CURRENCY COMPLETION, EVENT ONE AT A TIME DRAFTING)", () => {
    it("is naturally available all of December every year (real end instant 1 January 00:00), manually activatable the rest of the year", () => {
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.availability).toEqual({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: {
          startMonth: 12,
          startDay: 1,
          endMonth: 12,
          endDay: 31,
          endHour: 24,
          endMinute: 0,
        },
      });
      expect(event?.manualActivationAllowed).toBe(true);

      // The real-world instant this resolves to is genuinely 1 January
      // 00:00 (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME
      // DRAFTING" §3) — confirmed via the same function `fixedEventDeadline`
      // draft creation relies on, not just the raw config shape above.
      const bounds = getCurrentOccurrenceBounds(
        event!.availability,
        new Date("2026-12-15T00:00:00.000Z"),
        "UTC",
      );
      expect(bounds?.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
      expect(isEventAvailable(event!.availability, bounds!.end, "UTC")).toBe(
        false,
      );
      expect(
        isEventAvailable(
          event!.availability,
          new Date(bounds!.end.getTime() - 1),
          "UTC",
        ),
      ).toBe(true);
    });

    it("has a fixed Event deadline pinned to its own occurrence's end, and a dedicated temporary Event Page", () => {
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.fixedEventDeadline).toBe(true);
      expect(event?.page).toEqual({
        route: "/events/christmas",
        navLabel: "Christmas",
      });
    });

    it("has its own Festive Points currency, earned per film watched, and no per-completion currency of its own (see event-currency-earning.test.ts for the earning mechanic itself)", () => {
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.pointType).toBe("festive");
      expect(event?.currency).toEqual({
        id: "festive",
        label: "Festive Points",
        pointsPerFilm: 1,
      });
    });

    it("has no curated eligibility data defined yet — uses normal FDraft drafting/eligibility", () => {
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.draftRules).toEqual({});
      expect(event?.eligibilityRules).toEqual({});
    });

    it("declares its two static content pools (classic/adjacent), matching public/events/christmas/films.json", () => {
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.contentPools).toEqual([
        { key: "classic", label: "Classic" },
        { key: "adjacent", label: "Adjacent" },
      ]);
    });

    it("has a real visual theme, its own red/green/blue/white identity", () => {
      // Supersedes an earlier `visualTheme: null` assertion from when
      // Christmas was drafting-mechanics-only (see docs/updates, "FDRAFT
      // UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §9).
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.visualTheme).toBe(CHRISTMAS_EVENT_ID);
    });

    it("has a two-stage ending: the Christmas goodbye, then the January stinger", () => {
      const ending = getEventDefinition(CHRISTMAS_EVENT_ID)?.ending;
      expect(ending?.enabled).toBe(true);
      expect(ending?.title).toBe("Have a lovely year!");
      expect(ending?.message).toContain("From, Burrichen");
      // §15 — the button is deliberately plain, never festive.
      expect(ending?.buttonLabel).toBe("Onto next year!");
      expect(ending?.stinger?.message).toBe("Fuck you, it's January!");
      expect(ending?.stinger?.delayMs).toBeGreaterThan(0);
    });

    it("is the only event with a two-stage ending, and January's own event is untouched by the stinger", () => {
      expect(
        EVENT_DEFINITIONS.filter((event) => event.ending?.stinger).map(
          (event) => event.id,
        ),
      ).toEqual([CHRISTMAS_EVENT_ID]);
      // The stinger only alludes to January — it must never be wired to
      // it (§16, "not activate January early"). January's own window is
      // the only thing that makes January available.
      const january = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
      expect(january?.availability.recurringMonthDayRange?.startDay).toBe(25);
      expect(january?.availability.recurringMonthDayRange?.startMonth).toBe(1);
    });

    it("supplies intro content for the generic event introduction modal", () => {
      const event = getEventDefinition(CHRISTMAS_EVENT_ID);
      expect(event?.intro.description.length).toBeGreaterThan(0);
      expect(event?.intro.bullets.length).toBeGreaterThan(0);
    });
  });
});

describe("F* You, It's January! — simple single-film mechanics (docs/updates, FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS)", () => {
  it("declares singleFilmDraft — its whole Draft is one film rolled at join", () => {
    expect(
      getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID)?.singleFilmDraft,
    ).toBe(true);
  });

  it("is the ONLY event that declares singleFilmDraft", () => {
    expect(
      EVENT_DEFINITIONS.filter((event) => event.singleFilmDraft).map(
        (event) => event.id,
      ),
    ).toEqual([F_YOU_ITS_JANUARY_EVENT_ID]);
  });

  it("declares exactly one content pool — the curated list the roll draws from", () => {
    expect(
      getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID)?.contentPools,
    ).toEqual([{ key: "curated", label: "Curated" }]);
  });

  it("has NO eligibility rules at all — the old rating ceiling and curated whitelist are both gone", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.eligibilityRules).toEqual({});
    // Average score is irrelevant to what January rolls now, so the old
    // `maxAverageRating: 3.5` ceiling must not survive anywhere.
    expect(event?.eligibilityRules.maxAverageRating).toBeUndefined();
    // Watchlist-membership-based curated eligibility is likewise gone —
    // the static list itself is the pool, resolved to real films outside
    // the registry entirely.
    expect(event?.eligibilityRules.curatedFilmIds).toBeUndefined();
  });

  it("pins its Draft deadline to the Event occurrence and earns Misery per film watched", () => {
    const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(event?.fixedEventDeadline).toBe(true);
    expect(event?.currency).toEqual({
      id: "misery",
      label: "Misery Points",
      pointsPerFilm: 1,
    });
  });

  it("getEventDefinition returns the registered definition verbatim, with no per-event overlay", () => {
    // The January-only curated-id overlay this function used to apply is
    // gone entirely — every event is now a plain registry lookup.
    for (const event of EVENT_DEFINITIONS) {
      expect(getEventDefinition(event.id)).toBe(event);
    }
  });
});
