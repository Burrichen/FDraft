import { afterEach, describe, expect, it } from "vitest";
import {
  resetEventCategoryFilmIdsForTests,
  setEventCategoryFilmIds,
} from "@/domain/events/event-category-manifest-overlay";
import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import type { EligibilityCandidate } from "@/domain/events/event-eligibility";
import { resolveEventDraftFilmAddition } from "./event-draft-additions";

afterEach(() => {
  resetEventCategoryFilmIdsForTests();
});

function film(overrides: Partial<EligibilityCandidate> = {}) {
  return {
    watchlistEntryId: "entry-1",
    filmId: "film-1",
    genres: null,
    averageRating: null,
    ...overrides,
  } satisfies EligibilityCandidate;
}

/**
 * The single answer to "may this film be manually added to this Event's
 * Draft?" (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3
 * §4/§7/§8/§9) — Event rules reused, never re-implemented.
 */
describe("resolveEventDraftFilmAddition — the Event's own boundary (§7)", () => {
  it("allows any film into a normal, non-Event Draft", () => {
    expect(
      resolveEventDraftFilmAddition({
        draft: { sourceEventId: null },
        film: film(),
      }),
    ).toEqual({ allowed: true, refusal: null });
  });

  it("allows any watchlist film into an Event whose own rules restrict nothing", () => {
    // Halloween's `eligibilityRules` are deliberately empty: its
    // "adjacent" pool IS the profile's own watchlist. So the boundary it
    // enforces is simply "a film you could draft at all".
    for (const eventId of [HALLOWEEN_EVENT_ID, CHRISTMAS_EVENT_ID]) {
      expect(
        resolveEventDraftFilmAddition({
          draft: { sourceEventId: eventId },
          film: film({ genres: ["Comedy"] }),
        }),
      ).toEqual({ allowed: true, refusal: null });
    }
  });

  it("enforces a restrictive Event's genre rule, which manual selection may not override", () => {
    // The Watchlist Frontier requires Westerns. An explicit manual choice
    // overrides FDraft's own generation preferences, never the Event's
    // eligibility boundary.
    expect(
      resolveEventDraftFilmAddition({
        draft: { sourceEventId: WATCHLIST_FRONTIER_EVENT_ID },
        film: film({ genres: ["Horror"] }),
      }),
    ).toEqual({ allowed: false, refusal: "film_not_eligible_for_event" });
    expect(
      resolveEventDraftFilmAddition({
        draft: { sourceEventId: WATCHLIST_FRONTIER_EVENT_ID },
        film: film({ genres: ["western"] }),
      }),
    ).toEqual({ allowed: true, refusal: null });
  });

  it("accepts a curated pool film as an additional way in, alongside the rules", () => {
    setEventCategoryFilmIds(WATCHLIST_FRONTIER_EVENT_ID, {
      curated: ["film-approved"],
    });
    expect(
      resolveEventDraftFilmAddition({
        draft: { sourceEventId: WATCHLIST_FRONTIER_EVENT_ID },
        film: film({ filmId: "film-approved", genres: ["Drama"] }),
      }),
    ).toEqual({ allowed: true, refusal: null });
  });

  it("refuses everything for January, whatever the film (§8)", () => {
    // Its single rolled film is the entire mechanic — disabled by what the
    // Event declares (`singleFilmDraft`), not by an id check.
    setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, {
      curated: ["film-1"],
    });
    expect(
      resolveEventDraftFilmAddition({
        draft: { sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID },
        film: film(),
      }),
    ).toEqual({ allowed: false, refusal: "event_disallows_additions" });
  });

  it("refuses a Draft whose Event is no longer registered", () => {
    expect(
      resolveEventDraftFilmAddition({
        draft: { sourceEventId: "retired-event" },
        film: film(),
      }),
    ).toEqual({ allowed: false, refusal: "event_not_registered" });
  });
});
