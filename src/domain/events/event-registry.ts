import { resolveEligibleCandidates } from "./event-eligibility";
import type { EventDefinition } from "./event-definition";
import { getJanuaryManifestCuratedFilmIds } from "./january-manifest-overlay";

/**
 * FDraft's first real event (see docs/product-spec.md, event system Phase
 * 5). Naturally available 25–31 January inclusive every year
 * (`recurringMonthDayRange`, evaluated per-profile timezone by
 * `isEventAvailable`) — the canonical window (see docs/updates, "Prompt
 * 14"), not the whole month; `manualActivationAllowed` lets a profile opt
 * in the rest of the year too, at which point the manual-event rule
 * (enforced centrally by `awardDraftCompletionReward`, not here) downgrades
 * `pointType` to generic/Lifetime Points automatically.
 *
 * `eligibilityRules.maxAverageRating: 3.5` (see docs/updates, "JANUARY
 * ELIGIBILITY RULES") is this event's one real film restriction: a film
 * qualifies if its community/external average rating is 3.5 or lower, OR
 * it's on the globally curated January whitelist — additive, exactly like
 * every other event's `resolveEligibleCandidates` rules. That whitelist
 * itself is NOT static data here; see `getEventDefinition` below for how
 * it's overlaid in from the remotely-configurable manifest system
 * (`january-manifest-overlay.ts`) without this literal ever changing.
 */
export const F_YOU_ITS_JANUARY_EVENT_ID = "f-you-its-january";

const F_YOU_ITS_JANUARY: EventDefinition = {
  id: F_YOU_ITS_JANUARY_EVENT_ID,
  name: "F* You, It's January!",
  availability: {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: { startMonth: 1, startDay: 25, endMonth: 1, endDay: 31 },
  },
  draftRules: {},
  eligibilityRules: { maxAverageRating: 3.5, curatedFilmIds: [] },
  intro: {
    description:
      "The worst week of the cinematic year has arrived. Every draft you finish this week banks permanent Misery Points instead of the usual reward.",
    bullets: [
      "Eligible films: anything rated 3.5 or lower, plus this year's curated January picks",
      "Draft completions earn permanent Misery Points instead of Lifetime Points",
      "You can still opt in manually outside this week from Settings, but it only ever earns Lifetime Points off-season",
    ],
  },
  pointType: "misery",
  // Reuses this event's own id as its visual theme id (see
  // docs/product-spec.md, event system Phase 8) — the presentation layer
  // (`src/components/events/event-visual-themes.ts`) maps this to an
  // already-installed lucide-react icon, gated entirely behind
  // `EventSettings.eventVisualsEnabled`; nothing here or in
  // `resolveEventVisualThemeId` depends on what that mapping contains.
  visualTheme: F_YOU_ITS_JANUARY_EVENT_ID,
  manualActivationAllowed: true,
};

/**
 * FDraft's second real event (see docs/product-spec.md, event system
 * Phase 6). Deliberately minimal: nothing in the project defines
 * Halloween's actual calendar window, a dedicated reward currency, or any
 * curated/genre-restricted film list, so none of that is invented here —
 * per the event system's own rule (see `EventEligibilityRules`'s doc
 * comment), an unconfigured/empty value is the honest default, not a
 * fabricated one:
 *  - `availability` is entirely `null` — no natural window is defined
 *    yet, so this event is never naturally available and can only ever be
 *    turned on manually (`manualActivationAllowed`), exactly like any
 *    other manual-only event the registry might hold.
 *  - `eligibilityRules` leaves both `requiredGenres` and `curatedFilmIds`
 *    unset — `resolveEligibleCandidates()` (`event-eligibility.ts`)
 *    treats that as "no restriction," so a Halloween-owned draft draws
 *    from the profile's normal FDraft-eligible candidates exactly like
 *    a non-event draft, until real curated data exists to configure here.
 *  - `pointType` is `null` — no dedicated currency has been assigned to
 *    Halloween anywhere in the project (the reserved-but-unused
 *    `"signal"`/`"bounty"` currencies are not this event's to claim
 *    unilaterally), so completions earn generic/Lifetime Points, the same
 *    as a normal draft, in both normal and manual activation today.
 *  - `visualTheme` is `null` — no Halloween visual assets/theme exist in
 *    the project yet.
 */
export const HALLOWEEN_EVENT_ID = "halloween";

const HALLOWEEN: EventDefinition = {
  id: HALLOWEEN_EVENT_ID,
  name: "Halloween",
  availability: {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: null,
  },
  draftRules: {},
  eligibilityRules: { requiredGenres: null, curatedFilmIds: null },
  intro: {
    description:
      "A themed drafting event — its exact rules and dates are still being finalized.",
    bullets: [
      "Uses your normal FDraft watchlist and drafting rules for now",
      "Draft completions currently earn the same points as a normal draft",
      "You can opt in manually any time from Settings",
    ],
  },
  pointType: null,
  visualTheme: null,
  manualActivationAllowed: true,
};

/**
 * The Watchlist Frontier's curated Neo-Western/explicitly-approved film
 * list (see docs/product-spec.md, event system Phase 7) — additive with
 * the event's own `requiredGenres: ["Western"]` rule below, for films
 * that belong in this event but aren't tagged with the "Western" genre
 * itself (Neo-Westerns, or any other explicitly approved title). Kept
 * here, separate from the generic `resolveEligibleCandidates` engine, as
 * this event's own owned data — the engine never hardcodes a single film
 * id.
 *
 * No curated Western/Neo-Western list exists anywhere else in the
 * project (repo-searched first, per this phase's own instructions), so
 * this stays a typed, empty list rather than a fabricated one — populate
 * it with real `FilmRecord.id` values once an approved list exists.
 */
const WATCHLIST_FRONTIER_CURATED_FILM_IDS: string[] = [];

/**
 * FDraft's third real event (see docs/product-spec.md, event system Phase
 * 7). Eligibility is normal Western-genre eligibility OR membership in
 * the curated list above — both additive, deduplicated automatically by
 * `resolveEligibleCandidates` (a film could satisfy both and still only
 * ever appears once). No fixed/recurring calendar window is defined
 * anywhere in the project for this event, so — same rule Halloween
 * already follows — none is invented here; manual activation is the only
 * way in today.
 *  - `eligibilityRules.requiredGenres: ["Western"]` reuses the existing,
 *    already-canonical genre string an imported film's metadata carries
 *    (matched case-insensitively by the shared engine) — no new
 *    genre-matching logic.
 *  - `eligibilityRules.curatedFilmIds` is the list above.
 *  - `pointType: "bounty"` is this event's own permanent currency for
 *    normal activation (previously reserved/unclaimed) — downgraded to
 *    generic/Lifetime Points automatically by `awardDraftCompletionReward`
 *    whenever manually enabled, the same CRITICAL RULE every event
 *    follows.
 */
export const WATCHLIST_FRONTIER_EVENT_ID = "watchlist-frontier";

const WATCHLIST_FRONTIER: EventDefinition = {
  id: WATCHLIST_FRONTIER_EVENT_ID,
  name: "The Watchlist Frontier",
  availability: {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: null,
  },
  draftRules: {},
  eligibilityRules: {
    requiredGenres: ["Western"],
    curatedFilmIds: WATCHLIST_FRONTIER_CURATED_FILM_IDS,
  },
  intro: {
    description:
      "A frontier for Western drafting. Westerns qualify normally, and a curated set of Neo-Westerns and other approved picks ride along with them — every completion out here banks permanent Bounty Points.",
    bullets: [
      "Eligible films: anything tagged Western, plus any curated Neo-Western/approved picks",
      "Draft completions earn permanent Bounty Points instead of the usual reward",
      "You can still opt in manually any time from Settings, but it only ever earns Lifetime Points then",
    ],
  },
  pointType: "bounty",
  // See the identical note on `F_YOU_ITS_JANUARY.visualTheme` above.
  visualTheme: WATCHLIST_FRONTIER_EVENT_ID,
  manualActivationAllowed: true,
};

/**
 * Signal from Beyond's curated sci-fi whitelist (see docs/product-spec.md,
 * event system Phase 6) — additive with the event's own
 * `requiredGenres: ["Science Fiction"]` rule below, for films that belong
 * in this event without carrying that exact genre tag (e.g. a
 * borderline/crossover title explicitly approved for it). Kept here,
 * separate from the generic `resolveEligibleCandidates` engine, as this
 * event's own owned data — the engine never hardcodes a single film id.
 *
 * No curated sci-fi whitelist exists anywhere else in the project
 * (repo-searched first, per this phase's own instructions), so this stays
 * a typed, empty list rather than a fabricated one — populate it with
 * real `FilmRecord.id` values once an approved whitelist exists.
 */
const SIGNAL_FROM_BEYOND_CURATED_FILM_IDS: string[] = [];

/**
 * FDraft's fourth real event (see docs/product-spec.md, event system
 * Phase 6): the sci-fi event. Eligibility is normal sci-fi-genre
 * eligibility OR membership in the curated whitelist above — both
 * additive, deduplicated automatically by `resolveEligibleCandidates` (a
 * film could satisfy both and still only ever appears once). No
 * fixed/recurring calendar window is defined anywhere in the project for
 * this event, so — same rule Halloween/The Watchlist Frontier already
 * follow — none is invented here; manual activation is the only way in
 * today.
 *  - `eligibilityRules.requiredGenres: ["Science Fiction"]` reuses the
 *    exact genre string FDraft's own metadata pipeline stores verbatim
 *    from its provider (see `src/domain/import/providers/tmdb-provider.ts`
 *    — genres are passed through unmodified, and the provider's real
 *    science-fiction genre name is "Science Fiction," not the informal
 *    "Sci-Fi"), matched case-insensitively by the shared engine — no new
 *    genre-matching logic.
 *  - `eligibilityRules.curatedFilmIds` is the whitelist above.
 *  - `pointType: "signal"` is this event's own permanent currency for
 *    normal activation (previously reserved/unclaimed) — downgraded to
 *    generic/Lifetime Points automatically by `awardDraftCompletionReward`
 *    whenever manually enabled, the same CRITICAL RULE every event
 *    follows.
 */
export const SIGNAL_FROM_BEYOND_EVENT_ID = "signal-from-beyond";

const SIGNAL_FROM_BEYOND: EventDefinition = {
  id: SIGNAL_FROM_BEYOND_EVENT_ID,
  name: "Signal from Beyond",
  availability: {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: null,
  },
  draftRules: {},
  eligibilityRules: {
    requiredGenres: ["Science Fiction"],
    curatedFilmIds: SIGNAL_FROM_BEYOND_CURATED_FILM_IDS,
  },
  intro: {
    description:
      "A transmission for sci-fi drafting. Science Fiction films qualify normally, and a curated whitelist of explicitly approved picks rides along with them — every completion out here banks permanent Signal Points.",
    bullets: [
      "Eligible films: anything tagged Science Fiction, plus any curated whitelist picks",
      "Draft completions earn permanent Signal Points instead of the usual reward",
      "You can still opt in manually any time from Settings, but it only ever earns Lifetime Points then",
    ],
  },
  pointType: "signal",
  // See the identical note on `F_YOU_ITS_JANUARY.visualTheme` above.
  visualTheme: SIGNAL_FROM_BEYOND_EVENT_ID,
  manualActivationAllowed: true,
};

/**
 * The single place a real event gets registered as data — the "one engine
 * instead of hardcoding January/Sci-Fi/Western logic throughout the app"
 * Phase 2 exists for.
 */
export const EVENT_DEFINITIONS: readonly EventDefinition[] = [
  F_YOU_ITS_JANUARY,
  HALLOWEEN,
  WATCHLIST_FRONTIER,
  SIGNAL_FROM_BEYOND,
];

/**
 * Every call site gets a fully-formed, synchronous `EventDefinition` —
 * for January specifically, that means overlaying in whichever curated
 * film ids the manifest system has most recently resolved (see
 * `january-manifest-overlay.ts`), merged with any statically-configured
 * ones (today: none). Every other event's definition is returned exactly
 * as declared above, completely untouched by this.
 */
export function getEventDefinition(id: string): EventDefinition | null {
  const base = EVENT_DEFINITIONS.find((event) => event.id === id) ?? null;
  if (!base || base.id !== F_YOU_ITS_JANUARY_EVENT_ID) {
    return base;
  }
  const manifestCuratedFilmIds = getJanuaryManifestCuratedFilmIds();
  if (manifestCuratedFilmIds.length === 0) {
    return base;
  }
  return {
    ...base,
    eligibilityRules: {
      ...base.eligibilityRules,
      curatedFilmIds: [
        ...(base.eligibilityRules.curatedFilmIds ?? []),
        ...manifestCuratedFilmIds,
      ],
    },
  };
}

/**
 * The canonical January eligibility check for a single film (see
 * docs/updates, "JANUARY ELIGIBILITY RULES") — the one place this
 * comparison exists; nowhere else (UI or otherwise) re-implements "rating
 * ≤ 3.5 OR curated." Delegates to the exact same `resolveEligibleCandidates`
 * engine draft creation itself uses (evaluated against a single-candidate
 * array), so there is exactly one implementation of the OR logic, not two.
 * Reads January's CURRENT eligibility rules via `getEventDefinition` — so
 * a manifest refresh that adds/removes curated films is reflected here
 * immediately, with no separate cache to keep in sync.
 */
export function isJanuaryEligibleFilm(film: {
  filmId: string;
  averageRating: number | null;
}): boolean {
  const event = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID);
  if (!event) {
    return false;
  }
  return (
    resolveEligibleCandidates(
      [
        {
          watchlistEntryId: film.filmId,
          filmId: film.filmId,
          genres: null,
          averageRating: film.averageRating,
        },
      ],
      event.eligibilityRules,
    ).length > 0
  );
}
