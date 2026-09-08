import type { EventDefinition } from "./event-definition";

/**
 * FDraft's first real event (see docs/product-spec.md, event system Phase
 * 5), and — deliberately — its SIMPLEST one (see docs/updates, "FDRAFT
 * UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS"). Naturally
 * available 25 January 00:00 through 1 February 00:00 (exclusive) every
 * year (`recurringMonthDayRange`, evaluated per-profile timezone by
 * `isEventAvailable`) — the canonical window, not the whole month;
 * `manualActivationAllowed` lets a profile opt in the rest of the year
 * too, at which point the manual-event rule (enforced centrally by
 * `awardDraftCompletionReward`/`awardEventDraftItemReward`, not here)
 * downgrades the reward to generic/Lifetime Points automatically.
 *
 * `recurringMonthDayRange`'s end is spelled out explicitly as `endMonth: 2,
 * endDay: 1, endHour: 0, endMinute: 0` rather than relying on the day-only
 * end default — `isEventAvailable`'s own `isWithinMonthDayRange` resolves
 * both forms to the exact same instant (end-of-31-January), so this is a
 * behaviour-preserving clarification, not a change. It matters for
 * `fixedEventDeadline` below: `getCurrentOccurrenceBounds` (the function
 * that computes a `fixedEventDeadline` Draft's actual deadline instant)
 * defaults an UNSET `endHour`/`endMinute` to `0`, not end-of-day — the
 * opposite default `isWithinMonthDayRange` uses — so a day-only range
 * would have silently given a January Draft a deadline of "1 January
 * 00:00" instead of the real end of the window. Spelling out the exact
 * end instant sidesteps that divergence entirely.
 *
 * `singleFilmDraft: true` is now the whole of January's drafting
 * mechanic: joining rolls exactly ONE random film from
 * `public/events/january/films.json` and persists it immediately as the
 * January Event Draft (see `rollSingleFilmEventDraft`,
 * `single-film-event-draft.ts`, called from `beginEventOptIn`). There is
 * no second "Create Draft" step, no difficulty, no sliders, no category
 * allocation, no Challenge source, no One At A Time builder and no "Pick
 * Your Own" picker — the joke is that you get what January gives you.
 *
 * `eligibilityRules: {}` — REPLACES this event's old rating/whitelist
 * rule entirely (the former `maxAverageRating: 3.5` "plus a curated
 * whitelist as an additive exception" logic, which drew from a profile's
 * own active Watchlist). The static `curated` list in
 * `public/events/january/films.json` is now the AUTHORITATIVE and only
 * candidate pool, resolved into real local films by the generic
 * `loadEventCategoryFilmContent` (see `app-shell.tsx`) exactly like
 * Halloween's/Christmas's own pools — so Watchlist membership and average
 * score are both entirely irrelevant to what January rolls. Nothing about
 * January reads `resolveEligibleCandidates` any more; `getEventDefinition`
 * below is correspondingly free of the January-only manifest overlay it
 * used to splice curated ids in through (`january-manifest-overlay.ts`,
 * deleted). Historical January Drafts are unaffected — they persist their
 * own resolved `DraftItemRecord`s and are never re-derived from
 * eligibility rules (see `EVENT HISTORY RETENTION`, docs/product-spec.md).
 *
 * `currency` makes Misery Points earn PER FILM WATCHED in a January
 * Draft, through the fully generic `awardEventDraftItemReward` engine —
 * so January's one film banks exactly one Misery Point when watched, and
 * nothing at all merely for joining/rolling. `pointType: "misery"` is
 * kept only for the unrelated legacy per-completion path
 * (`resolveDraftCompletionReward`), which `currency` being set makes fall
 * back to plain Lifetime Points instead of ever reading it, so nothing
 * double-awards Misery.
 *
 * `fixedEventDeadline: true` — mirroring Halloween/Christmas: a January
 * Draft's deadline is pinned to the event's real natural occurrence end,
 * never a profile-chosen Calendar/Timer deadline, so
 * `finalizeExpiredEventDraftIfNeeded` (already fully generic, no per-event
 * branch) finalises/archives the one-film January Draft at the exact
 * moment the event itself expires — preserving watched/unwatched state and
 * making post-expiry Misery farming impossible (an expired Draft's items
 * are never returned by `listActiveDrafts`).
 *
 * `ending` gives January its own real Event-over experience through the
 * same generic framework Halloween's own uses
 * (`resolveEventEndingCandidate`, `EventEndingDialog`,
 * `acknowledgeEventEnding`). `message`/`buttonLabel` are the exact
 * required copy, verbatim, never rephrased. See `event-visual-themes.ts`
 * for the ending's own decoration (clouds parting/soft light/rain fading)
 * and its deliberately brighter icy-blue treatment.
 */
export const F_YOU_ITS_JANUARY_EVENT_ID = "f-you-its-january";

const F_YOU_ITS_JANUARY: EventDefinition = {
  id: F_YOU_ITS_JANUARY_EVENT_ID,
  name: "F* You, It's January!",
  availability: {
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
  },
  draftRules: {},
  // No restriction at all — see this event's doc comment above: January's
  // static curated list IS its pool, so there is nothing for the generic
  // `resolveEligibleCandidates` engine to narrow here.
  eligibilityRules: {},
  intro: {
    description:
      "The worst week of the cinematic year has arrived. Join, and January picks one film for you — no choices, no negotiation. Watch it and bank a permanent Misery Point.",
    bullets: [
      "Joining rolls one random film from January's own curated list — that's your Draft",
      "Watching it earns a permanent Misery Point instead of the usual reward",
      "You can still opt in manually outside this week from Settings, but it only ever earns Lifetime Points off-season",
    ],
  },
  pointType: "misery",
  currency: { id: "misery", label: "Misery Points", pointsPerFilm: 1 },
  // Reuses this event's own id as its visual theme id (see
  // docs/product-spec.md, event system Phase 8) — the presentation layer
  // (`src/components/events/event-visual-themes.ts`) maps this to a
  // hand-authored trash can icon plus January's own pale-icy-blue token
  // family, gated entirely behind `EventSettings.eventVisualsEnabled`;
  // nothing here or in `resolveEventVisualThemeId` depends on what that
  // mapping contains.
  visualTheme: F_YOU_ITS_JANUARY_EVENT_ID,
  manualActivationAllowed: true,
  page: { route: "/events/january", navLabel: "January" },
  // Matches `public/events/january/films.json`'s one category key — and,
  // unlike before, this is now genuinely READ at runtime: it is the pool
  // `rollSingleFilmEventDraft` draws January's single film from.
  contentPools: [{ key: "curated", label: "Curated" }],
  // The entire January drafting mechanic — see `EventDefinition.
  // singleFilmDraft`. January is the only event that sets this.
  singleFilmDraft: true,
  fixedEventDeadline: true,
  ending: {
    enabled: true,
    message:
      "The world brightens. The January misery is forgotten as the first sun of the year burns through the clouds. The town of FDraft forgets what that awful phrase and people begin to smile again. They can rebuild.",
    buttonLabel: "I made it through the worst month.",
  },
};

/**
 * FDraft's second real event (see docs/product-spec.md, event system
 * Phase 6). This phase ("PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE")
 * gives it a real, permanent, annually-recurring natural window and its
 * own temporary page; its actual drafting content stays deliberately
 * minimal beyond that — nothing in the project defines a dedicated reward
 * currency, curated/genre-restricted film list, or draft-pool generation
 * yet, so none of that is invented here (per the event system's own rule,
 * see `EventEligibilityRules`'s doc comment, an unconfigured/empty value
 * is the honest default, not a fabricated one):
 *  - `availability.recurringMonthDayRange` is 30 September 19:00 through
 *    1 November 00:00 (exclusive), evaluated in the profile's own
 *    timezone every year via `isEventAvailable` — the canonical window.
 *  - `manualActivationAllowed: false` — unlike every other event, a
 *    normal user cannot manually start Halloween outside this window at
 *    all (see `resolveEventToOptInto`, `event-opt-in.ts`, which only
 *    falls back to `manualActivationAllowed` when NOT naturally
 *    available). Admin Mode's Event Test Switcher can still make it
 *    naturally available for testing, since that flows through the same
 *    `getEffectiveEventDate`-backed `isEventAvailable` check — no special
 *    Halloween-only testing path exists.
 *  - `page`/`enableVisualsOnOptIn` back the join flow: joining shows the
 *    temporary Halloween page and turns Event Visuals on by default,
 *    without creating a draft.
 *  - `eligibilityRules` leaves both `requiredGenres` and `curatedFilmIds`
 *    unset — `resolveEligibleCandidates()` (`event-eligibility.ts`)
 *    treats that as "no restriction," so a Halloween-owned draft draws
 *    from the profile's normal FDraft-eligible candidates exactly like
 *    a non-event draft, until real curated data exists to configure here.
 *  - `pointType: "haunted"` plus `currency` (see docs/updates, "EVENT
 *    SYSTEM — UNIVERSAL EVENT CURRENCY EARNING") give Halloween its own
 *    real, permanent, per-film-watched currency — every film watched
 *    from a Halloween Draft (Horror or Kitsch alike, no distinction)
 *    earns one Haunted Point, in addition to the
 *    Lifetime Point the draft's own eventual completion still earns like
 *    any other draft. `pointType` itself is no longer read for
 *    Halloween's completion reward (see `resolveDraftCompletionReward`
 *    — `currency` being set makes it fall back to plain Lifetime Points
 *    instead), only kept for consistency with every other event's shape.
 *  - `visualTheme` is this event's own id (see docs/updates, "PROMPT 20 —
 *    HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER EGGS") — a real Kitsch
 *    Halloween theme (see `src/components/events/event-visual-themes.ts`);
 *    its nav icon, a hand-authored jack-o'-lantern, is resolved separately
 *    in `src/components/layout/use-nav-items.ts`.
 */
export const HALLOWEEN_EVENT_ID = "halloween";

const HALLOWEEN: EventDefinition = {
  id: HALLOWEEN_EVENT_ID,
  name: "Halloween",
  availability: {
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
  },
  draftRules: {},
  eligibilityRules: { requiredGenres: null, curatedFilmIds: null },
  intro: {
    // `description`/`bullets` are kept populated (required fields on the
    // shared `EventIntroContent` shape every event uses) but are NOT what
    // the join modal actually renders for Halloween any more — see
    // docs/updates, "PROMPT B2.3 — HALLOWEEN JOIN MODAL COMPLETE
    // REDESIGN" §3: `EventVisualTheme.renderIntroContent`
    // (`halloween-intro-content.tsx`) fully replaces this plain-string
    // content with genuinely rich, word-level-emphasized copy the generic
    // dialog path (still used by every other event) can't express.
    description:
      "Halloween has arrived — a full seasonal event with its own space in FDraft.",
    bullets: [
      "Its own temporary Halloween page, open for the season",
      "A dedicated Halloween Draft, built just for the event",
      "Two seasonal film pools to draft from",
      "Seasonal styling across the app while it's active",
      "A few hidden interactions to find — we're not telling",
    ],
    // Exact copy from docs/updates, "PROMPT B2.3" §1.
    primaryActionLabel: "Let me in.",
    secondaryActionLabel: "I don't want to be scared!",
  },
  pointType: "haunted",
  currency: { id: "haunted", label: "Haunted Points", pointsPerFilm: 1 },
  // See docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI + APPROVED
  // EASTER EGGS" — Halloween now has a real Kitsch Halloween theme (see
  // `src/components/events/event-visual-themes.ts`), reusing this event's
  // own id as its theme id, the same convention every other themed event
  // already follows.
  visualTheme: HALLOWEEN_EVENT_ID,
  manualActivationAllowed: false,
  page: { route: "/events/halloween", navLabel: "Halloween" },
  enableVisualsOnOptIn: true,
  // See docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
  // STATS" §3 — Halloween has ONE fixed deadline (the event's own end),
  // not a Calendar/Timer choice.
  fixedEventDeadline: true,
  // See docs/updates, "EVENT SYSTEM — EVENT-OVER EXPERIENCE" — Halloween
  // is the first event with a real, fully-defined ending. Exact copy from
  // that prompt's §9/§10/§11 — never rephrase. `foundingYear: 2026` is
  // Halloween's real first occurrence on this branch; `{ordinal}` is
  // substituted generically by `resolveEventEndingSecondaryMessage`
  // (`event-ending-annual.ts`), not hand-formatted here.
  ending: {
    enabled: true,
    message:
      "The dark cloud over FDraft finally parts, leaving a brisk chill in the air. It's passed, but you get the feeling it'll be back again soon.",
    secondaryMessageTemplate:
      "You survived the {ordinal} annual FDraft Halloween event.",
    foundingYear: 2026,
    buttonLabel: "See you next year.",
  },
  // See docs/updates, "STATIC EVENT FILM CONTENT PACKS" §12 — matches
  // `public/events/halloween/films.json`'s two category keys.
  contentPools: [
    { key: "horror", label: "Horror" },
    { key: "kitsch", label: "Kitsch" },
  ],
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
 * FDraft's fifth real event (see docs/updates, "FDRAFT UPDATE 1 — FESTIVE
 * POINTS + EVENT CURRENCY COMPLETION", extended by "FDRAFT UPDATE 1 —
 * EVENT ONE AT A TIME DRAFTING"). The currency phase gave Christmas a
 * real, registered `EventDefinition` with its own permanent per-film
 * currency; this phase gives it real Draft-creation gameplay (One At A
 * Time only — see `christmas-page-client.tsx`), so it now needs a
 * dedicated page/nav tab and a fixed Event deadline too. It still has NO
 * visual theme — see `src/components/events/event-visual-themes.ts`'s own
 * "CHRISTMAS ICON RESERVATION" note (the reserved `Snowflake` icon stays
 * unused until a future visual-polish phase) — this phase is drafting
 * mechanics only, not presentation.
 *  - `availability.recurringMonthDayRange` is 1 December 00:00 through the
 *    end of 31 December (exclusive) — all of December, evaluated in the
 *    profile's own timezone via `isEventAvailable`, the same convention
 *    every other recurring event uses. CORRECTED in this phase: the
 *    currency phase had set the end to 26 December, but "FDRAFT UPDATE 1
 *    — EVENT ONE AT A TIME DRAFTING" §3 states Christmas's fixed deadline
 *    is "1 Jan 00:00" — so the window's real end must be that same
 *    instant. Deliberately spelled out as `endMonth: 12, endDay: 31,
 *    endHour: 24, endMinute: 0` (an explicit end-of-day-31 boundary) rather
 *    than `endMonth: 1, endDay: 1` — `recurringMonthDayRange` only
 *    supports a range within a SINGLE calendar year (see its own doc
 *    comment; `isEventAvailable`'s month-scaled ordinal comparison, which
 *    orders December > January, would make a December→January range never
 *    match at all). `hour: 24` is a legitimate JS `Date` overflow value
 *    that normalizes to the next real calendar day at 00:00 — so
 *    `getCurrentOccurrenceBounds` (which `fixedEventDeadline` below relies
 *    on) resolves this to the exact real instant "1 January 00:00" the
 *    task requires, entirely within December's own month value, matching
 *    the exact end-of-day default `isWithinMonthDayRange` already uses for
 *    every OTHER day-only range (`endHour ?? 24`) — just spelled out
 *    explicitly here, for the same reason January's own end was spelled
 *    out explicitly (see January's own doc comment above): `getCurrentOccurrenceBounds`'s
 *    default for an UNSET `endHour` is `0`, not `24` — an unset value here
 *    would silently compute the wrong deadline ("31 December 00:00").
 *  - `manualActivationAllowed: true` — like January/Frontier/Signal (and
 *    unlike Halloween), a profile can opt in outside the natural window
 *    too; doing so downgrades BOTH reward paths to plain Lifetime Points —
 *    `resolveEffectiveRewardCurrency` for the per-completion reward, and
 *    `awardEventDraftItemReward`'s own independent `manuallyEnabled` check
 *    for the per-film currency — the same CRITICAL RULE every event
 *    follows, enforced in both places so neither can be forgotten.
 *  - `eligibilityRules: {}` — Christmas has no additive eligibility
 *    restriction (unlike January's rating/curated-whitelist rule); its
 *    real candidate restriction is entirely the category system
 *    (`contentPools` below), read by the new generic Event category
 *    resolver (`src/application/events/resolve-event-category-candidates.ts`),
 *    not by `resolveEligibleCandidates`.
 *  - `pointType: "festive"` plus `currency` (see docs/updates, "EVENT
 *    SYSTEM — UNIVERSAL EVENT CURRENCY EARNING") give Christmas its own
 *    real, permanent, per-film-watched currency — every film watched from
 *    a Christmas Draft earns one Festive Point, in addition to the
 *    Lifetime Point the draft's own eventual completion still earns like
 *    any other draft.
 *  - `contentPools` matches `public/events/christmas/films.json`'s two
 *    existing category keys — now genuinely read by the Event One At A
 *    Time builder (Classic/Adjacent), not just declarative.
 *  - `fixedEventDeadline: true` (see docs/updates, "FDRAFT UPDATE 1 —
 *    EVENT ONE AT A TIME DRAFTING" §3) — mirrors Halloween/January: a
 *    Christmas Draft's own deadline is the event's real occurrence end,
 *    never a profile-chosen Calendar/Timer deadline.
 *  - `page` — Christmas's own dedicated temporary page/nav tab, the same
 *    convention every other real event with gameplay uses.
 *  - `visualTheme: null` — deliberately still no visual theme (see this
 *    comment's opening paragraph).
 */
export const CHRISTMAS_EVENT_ID = "christmas";

const CHRISTMAS: EventDefinition = {
  id: CHRISTMAS_EVENT_ID,
  name: "Christmas",
  availability: {
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
  },
  draftRules: {},
  eligibilityRules: {},
  intro: {
    // See docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES +
    // VISUAL POLISH" §12 — the modal opens on a greeting rather than the
    // event's own name. `description`/`bullets` below are the SAME
    // approved strings as before, verbatim: §12 explicitly forbids
    // rewriting them, and `renderChristmasIntroContent` renders them
    // straight from this definition rather than re-typing them, so the
    // visual polish cannot drift from the copy.
    title: "Ho Ho Ho",
    description:
      "Christmas has arrived. Every film you watch from a Christmas Draft banks a permanent Festive Point, on top of the usual reward.",
    bullets: [
      "Every film watched in a Christmas Draft earns a permanent Festive Point",
      "You can still opt in manually outside the season from Settings, but it only ever earns Lifetime Points off-season",
    ],
  },
  pointType: "festive",
  currency: { id: "festive", label: "Festive Points", pointsPerFilm: 1 },
  // Christmas now has a REAL visual theme (see docs/updates, "FDRAFT
  // UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §9-§11) — a
  // red/green/blue/white palette with deliberately unequal colour roles,
  // resolved to its presentation (the reserved `Snowflake` icon plus the
  // `.theme-christmas` token family) in `event-visual-themes.ts`. This
  // supersedes the `visualTheme: null` this entry carried while Christmas
  // was drafting-mechanics-only.
  visualTheme: CHRISTMAS_EVENT_ID,
  manualActivationAllowed: true,
  contentPools: [
    { key: "classic", label: "Classic" },
    { key: "adjacent", label: "Adjacent" },
  ],
  fixedEventDeadline: true,
  page: { route: "/events/christmas", navLabel: "Christmas" },
  // See docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES +
  // VISUAL POLISH" §14-§16. A TWO-STAGE ending, the first event to use
  // one: the Christmas goodbye, then — a beat later — the January sting
  // in the tail.
  //
  // `buttonLabel` is deliberately NOT festive, and the theme deliberately
  // does not reroute `--primary` for this modal (see
  // `event-visual-themes.ts`), so "Onto next year!" keeps standard FDraft
  // button theming exactly as §15 requires.
  //
  // The `stinger` is purely presentational — copy plus its own separately
  // persisted acknowledgement. It never activates January, or touches any
  // participation state at all (§16); January opens on its own real
  // window, 25 January, through the same `availability` engine as always.
  ending: {
    enabled: true,
    title: "Have a lovely year!",
    message:
      "And with that, the holidays are over. I hope you have enjoyed FDraft, it truely is a passion project and the fact you are using and reading this means the world to me. I hope you had a good one, and if not there's always next year. Thank you for using FDraft. From, Burrichen.",
    buttonLabel: "Onto next year!",
    stinger: {
      message: "Fuck you, it's January!",
      buttonLabel: "Oh no.",
      // A short beat after the goodbye is dismissed — long enough to read
      // as a separate moment, short enough that nobody wonders whether
      // the app has hung.
      delayMs: 2200,
    },
  },
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
  CHRISTMAS,
];

/**
 * Every call site gets a fully-formed, synchronous `EventDefinition`,
 * exactly as declared above.
 *
 * This used to splice January's remotely-resolved curated film ids into
 * its `eligibilityRules.curatedFilmIds` on every lookup (via the now-
 * deleted `january-manifest-overlay.ts`). January no longer has
 * eligibility rules at all — its static curated list is its whole,
 * authoritative pool, resolved into real local films by the generic
 * `loadEventCategoryFilmContent`/`event-category-manifest-overlay.ts`
 * pipeline every other content-pack event already uses — so this is a
 * plain registry lookup again, with no per-event branch of any kind.
 */
export function getEventDefinition(id: string): EventDefinition | null {
  return EVENT_DEFINITIONS.find((event) => event.id === id) ?? null;
}
