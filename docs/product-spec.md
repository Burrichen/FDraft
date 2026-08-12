# Monthly Watchlist App — Product Specification

> **Status: Canonical.** This document is the source of truth for product scope and
> behaviour. It was supplied in full by the product owner and must not be reinterpreted
> or trimmed by future implementation sessions. If a later instruction explicitly
> changes something here, update this file in the same change so it stays canonical.
>
> Implementation proceeds in numbered phases against this spec. Each phase's prompt
> defines what is in scope _right now_; this document defines what the finished product
> must eventually do. Do not use the presence of a requirement here as license to build
> it ahead of the phase that asks for it.

---

## CANONICAL ARCHITECTURE (as of Phase 9.5D)

**This section is the current source of truth for FDraft's architecture and
overrides anything below that contradicts it** — specifically the original
"RECOMMENDED STACK" and "AUTHENTICATION / PERSISTENCE" sections, and items 7
and 8 of "PRODUCT", each individually annotated in place with a pointer back
here. Those sections are kept verbatim as historical context (they're what
Phases 1–9 were originally built against, before Phases 9.5A–9.5D's
local-first migration), not deleted or rewritten, per this document's own
rule above; this section exists because that migration is exactly the kind
of "later instruction that explicitly changes something here."

- **FDraft is local-first.** All application data — profile, watchlist,
  drafts, draft history, watched history, ratings, postmortem responses,
  settings — lives in this browser's own IndexedDB (see "LOCAL DATABASE",
  Phase 9.5A). There is no server-side database and no Postgres schema.
- **No online account is required.** A "profile" is a local, on-device
  identity with a display name and nothing else — no email, no password, no
  session, no server-side user record (see "LOCAL PROFILES REPLACE REMOTE
  ACCOUNTS", Phase 9.5B).
- **Core functionality works offline.** Importing a watchlist, browsing it,
  creating and completing drafts (including the challenge engine), marking
  films watched, viewing stats, managing profiles, and exporting/importing a
  backup all work with no network connection, verified by the offline
  Playwright E2E suite (Phases 9.5B–9.5D).
- **Letterboxd imports are processed locally.** CSV/ZIP parsing happens
  entirely in the browser; an imported file is never uploaded anywhere (see
  "DATA PROVIDER RULE", Phase 9.5B).
- **Internet is required only for**: external metadata retrieval and
  refresh (TMDB enrichment via `src/app/api/metadata/route.ts`, entirely
  optional and always user-initiated — never automatic), and external links
  (opening a film's Letterboxd page, which is native browser navigation to
  a third-party site).
- **Downloaded metadata is cached locally** in the same local database as
  everything else (`film_metadata`), with provenance and a last-enriched
  timestamp, and is never re-fetched just to satisfy a challenge that can
  already be answered from what's cached (see "CHALLENGE ARCHITECTURE",
  "METADATA" — Phase 9.5D verified this against a real network-request
  count, not just by inspection).
- **Local profiles can be exported and imported** as a single portable,
  versioned backup file — the replacement for cross-device sync (see
  "Phase 9.5C — Portable profile export, import, backup and restore").
- **Docker is not required for normal use.** `pnpm install && pnpm dev` (or
  `pnpm build && pnpm start`) is the entire runbook — see `local_setup.md`.
  Docker was only ever used to run a local Supabase stack for development,
  which no longer exists in this repository (see Phase 9.5B).
- **Cloud sync is not part of the required architecture.** If optional
  cloud sync is considered later, it belongs in `docs/updates/` as a
  proposal, not this file, unless and until it is explicitly promoted into
  this specification by the product owner.

---

You are the senior software engineer and technical lead for this project.

Your job is to design, implement, test, refactor, and finish a production-quality web application for managing a Letterboxd watchlist and creating recurring Monthly Watchlist Drafts.

Act like a senior engineer, not a prototype generator.

You must:

- inspect the existing repository before changing anything;
- understand existing architecture and conventions;
- make sensible architectural decisions without repeatedly asking me questions;
- prefer maintainable, typed, testable code;
- avoid giant components and giant switch statements;
- keep domain logic separate from UI;
- write migrations and database types properly;
- test every meaningful piece of business logic;
- run lint, TypeScript checks, unit tests, integration tests, and relevant E2E tests after changes;
- never claim a test passed unless you actually ran it;
- fix failures you introduce;
- preserve existing working functionality;
- avoid TODO-only implementations and fake/mock production behaviour;
- only show me changed files if providing code in chat; do not give me a ZIP.

When requirements are ambiguous, make the most reasonable product/engineering decision, document the assumption, and continue.

The finished application should feel like a real product rather than a hackathon demo.

---

## PRODUCT

Build a modern web application centred around the user's Letterboxd watchlist.

The application should have:

1. Letterboxd watchlist importing.
2. Watchlist browsing.
3. Random-film selection.
4. Watchlist statistics.
5. Monthly Watchlist Drafts.
6. A large challenge engine for generating interesting draft picks.
7. ~~Cross-device persistent storage.~~ **Superseded — see "CANONICAL ARCHITECTURE": storage is local-first (on-device IndexedDB); moving between devices happens via explicit portable backup export/import (Phase 9.5C), not automatic server sync.**
8. ~~Server-synchronised dates/deadlines.~~ **Superseded — see "CANONICAL ARCHITECTURE": dates/deadlines are computed from the local device clock via the `Clock` abstraction (Phase 9.5A), with the profile's own stored timezone — there is no server to synchronise against.**
9. Historical draft statistics.

The Monthly Watchlist Draft system is the core of the product.

---

## DESIGN DIRECTION

Create an easy, clean, responsive, modern dark UI.

Use Letterboxd's visual language as inspiration without making a pixel-for-pixel clone.

Think:

- charcoal/dark backgrounds;
- prominent film posters;
- restrained typography;
- green/blue/orange accent colours where useful;
- compact metadata;
- subtle borders;
- clean cards;
- strong hover states;
- responsive layouts;
- excellent desktop and mobile behaviour.

Avoid:

- generic admin-dashboard appearance;
- excessive glassmorphism;
- giant rounded cards everywhere;
- unnecessary gradients;
- clutter;
- enormous headings;
- excessive animation.

Animation should be subtle and functional.

Accessibility matters:

- keyboard navigation;
- semantic controls;
- visible focus states;
- ARIA labels where necessary;
- tooltips must also work via keyboard/touch;
- colour must never be the only indication of state.

---

## RECOMMENDED STACK

> **Superseded — see "CANONICAL ARCHITECTURE".** The Supabase bullet below
> described FDraft's architecture through Phase 9; it was fully removed in
> Phase 9.5B and replaced with local-first storage (Dexie/IndexedDB). Kept
> verbatim as historical context for the Implementation Log below, not as a
> current recommendation.

Unless the existing repository strongly suggests otherwise, use:

- Next.js
- TypeScript with strict mode
- React
- Tailwind CSS
- shadcn/ui where useful, without making everything look like default shadcn
- Supabase for:

  - authentication;
  - PostgreSQL;
  - persistent user data;
  - server timestamps;

- Zod for validation
- date-fns/date-fns-tz or an equivalent robust date library
- Vitest for domain/unit tests
- React Testing Library for important components
- Playwright for key end-to-end flows

Use the current stable versions already compatible with the repository. Do not needlessly perform framework upgrades.

Keep core business logic framework-independent wherever possible.

---

## DATA PROVIDER RULE

Do NOT build the app around fragile or unauthorised Letterboxd scraping.

The import pipeline must support Letterboxd's user export data.

At minimum, accept the Letterboxd Watchlist CSV.

Prefer also accepting the user's full Letterboxd export ZIP when available so personal ratings, watched history, diary information and other useful exported information can be imported.

Implement external film metadata behind an adapter/provider interface.

For example:

FilmMetadataProvider

It should be possible to enrich films with provider-supported information such as:

- title
- release year/date
- poster
- runtime
- genres
- directors
- countries
- languages
- collection/franchise ID
- average rating
- popularity
- watch count
- fans count
- list appearances
- external IDs
- Letterboxd URL

Different providers may support different fields.

All enriched fields must therefore be nullable.

NEVER invent missing data.

If a challenge requires information we do not have, that challenge must be considered ineligible and the reason must be logged.

The UI should only display statistics when that statistic actually exists.

Keep provenance where useful, e.g.:

source/provider
last_enriched_at

Do not couple challenge logic directly to a particular metadata API.

---

## AUTHENTICATION / PERSISTENCE

> **Superseded — see "CANONICAL ARCHITECTURE".** There is no account and no
> server-side storage as of Phase 9.5B; "different devices" is handled by
> the portable backup format (Phase 9.5C), not a login. The timezone and
> device-clock rules below are the one part of this section that's still
> accurate — see `Clock` (Phase 9.5A) and `date-fns-tz` usage throughout
> the draft/deadline code.

Users must be able to access their account and data from different devices.

Store application data server-side.

All important dates should use server-generated timestamps and be persisted in UTC.

Store the user's timezone separately.

Do not trust the client's system clock for calculating whether a draft has expired.

Calendar calculations should use the user's timezone.

---

## CORE DATA MODEL

Design the schema properly, but expect entities approximately like:

profiles

films

watchlist_entries

watchlist_imports

film_metadata

watched_history

user_ratings

drafts

draft_items

draft_challenge_attempts

draft_postmortem_responses

selection_weight_adjustments

Optional supporting tables where normalisation makes sense.

A watchlist entry needs to retain at least:

- user
- film
- date added
- original watchlist position/order where available
- active/inactive state
- selection weight/boost
- import source
- created/updated timestamps

Do NOT physically delete historical records merely because a user watches/removes a film.

Mark it inactive/removed while retaining historical draft information.

---

## DEFAULT START PAGE SETTING

Settings has a "Default page" control — a dropdown/select, options
Watchlist / Drafts / History / Stats.

The selected page determines where FDraft opens when the app is launched
or the root URL is opened. Persist this in the local profile.

### Root routing

Navigating to the root route ("/") redirects/opens the user's selected
default page. Do not interfere with direct links — `/drafts/history` must
still open History regardless of the default.

If the setting is missing or invalid, default to Watchlist.

### Multiple local profiles

The default-page preference belongs to the profile, not the device: Alex
can default to Drafts while Sam defaults to Stats on the same install.
Switching profile must use that profile's own setting the next time the
root/home routing behaviour is invoked.

---

## LETTERBOXD IMPORT

Allow importing a Letterboxd watchlist.

The system should:

1. Parse the file safely.
2. Validate expected headers.
3. Handle duplicates.
4. Upsert films rather than duplicating them.
5. Preserve Date Added.
6. Preserve Letterboxd URL where available.
7. Preserve watchlist ordering/ordinal position where determinable.
8. Enrich films through the metadata provider.
9. Store all available metadata even when the normal watchlist UI does not display it.
10. Record when the import completed.

An import should be idempotent where possible.

Provide useful import feedback:

- films imported;
- films updated;
- duplicates;
- unresolved films;
- enrichment failures.

Do not discard the entire import because a handful of films fail metadata enrichment.

---

## STALE WATCHLIST WARNING

If more than THREE CALENDAR MONTHS have passed since the most recent successful Letterboxd import, show a clear but non-obnoxious warning.

Use calendar-month arithmetic rather than blindly assuming three months = 90 days.

Example:

last imported 5 March
warning begins after 5 June

Show:

- last import date;
- warning;
- button/link to import again.

---

## NORMAL WATCHLIST PAGE

Create a responsive poster-grid/list experience inspired by Letterboxd's watchlist.

Each film should display relevant information including:

- poster
- title
- year
- runtime if available
- average rating if available
- genres if available

Clicking a film should take the user to that film's Letterboxd page.

### Runtime Display

Integrate runtime naturally into the card's existing year/rating metadata
line — do not add another visual row just for it.

Format: plain minutes, e.g. `81 min`, `142 min`. Never convert to `2h 22m`
— this is the one consistent convention used across FDraft for a single
film's runtime (a separate `Xh Ym` convention exists only for aggregated
totals on the Stats page, e.g. "142h 30m" of total watch time across many
films, and the two must not be confused).

If a film has no runtime yet, omit it gracefully — never show `N/A` or any
other placeholder.

The card's text must stay responsive at every grid width: titles must not
overflow (truncating is acceptable), the year/runtime/rating line must not
force horizontal overflow, genre badges must wrap, and the watch-toggle
control must remain reachable regardless of how much metadata a given
card has.

Provide an eye control in the top-right area of the card.

Eye meaning:

unwatched = normal/closed or neutral state
watched = watched state

The control needs an accessible text label as well.

When marked watched:

- mark the film watched;
- remove it from the ACTIVE watchlist;
- preserve it historically;
- if it belongs to an active Monthly Draft, mark that draft item complete;
- update draft progress.

Do not lose historical information.

The watched action above is undoable for the remainder of the current
session — see "WATCHED FILM UNDO" below for the full rule.

---

## WATCHLIST SORT / FILTER CONTROL

The main Watchlist page has a "Sort & Filter" control, primarily for
controlling how films are organised. This is deliberately small — a fixed
set of genuinely useful sort orders plus a handful of lightweight filters,
never a query builder.

### Sort options

At least:

- Date Added — Newest First (the default)
- Date Added — Oldest First
- Title — A to Z
- Title — Z to A
- Release Year — Newest First
- Release Year — Oldest First
- Runtime — Shortest First
- Runtime — Longest First
- Average Rating — Highest First
- Average Rating — Lowest First
- Random / Shuffle

An option whose field can be missing (runtime, rating, release year) must
behave sensibly, never crash, and never produce NaN ordering: films with a
known value sort first, in the requested order; films missing that value
group at the end, regardless of direction.

### Filters

A handful of lightweight filters, dynamically populated from what the
current watchlist actually has (never a hardcoded list the watchlist
doesn't match):

- Genre
- Decade
- Runtime range
- Metadata available/missing

Filtering down to zero results gets its own distinct empty state — never
confused with "the watchlist is empty" or "everything's been watched."

### UI

A menu/popover under a "Sort & Filter" button. Clearly show when a
non-default sort or filter is active — not by colour alone. Works well on
mobile, not just desktop.

### Sort persistence

The chosen sort is remembered in the profile's local settings and survives
a reload. Filters are not persisted — they reset to "Any" each time the
page is freshly loaded, which is intentional: a filter is a temporary lens
on the list, while the sort is how the user actually wants their watchlist
organised long-term.

Do not persist a one-time Shuffle result as the permanent order — only the
fact that "Shuffle" is the chosen mode. Every time that mode is active
(picking it, or loading the page with it already chosen), generate a fresh
random ordering.

---

## WATCHED FILM UNDO

Marking a film watched — from the normal Watchlist page or the Active Draft
page — is undoable for the remainder of the current application session.

Marking watched still does everything it always did, immediately: mark the
film watched, record the watched date, deactivate it on the watchlist,
complete the matching active-draft item if any, and update draft/watchlist
progress and stats. Nothing about the persisted outcome changes.

What changes is the UI's reaction to it:

- the card does NOT instantly disappear — it stays exactly where it was;
- fade it (reduced opacity, a desaturated poster, subdued text) so it still
  reads clearly, never becomes unreadable;
- replace its watched control with an "Undo" control.

The user should immediately understand: "I marked this as watched, but I
can still undo it."

### Undo window

The undo opportunity lasts until the application reloads — not a fixed
number of seconds, and not a toast-only affordance that disappears if the
user looks away. It survives navigating between FDraft pages and back to
whichever one showed it. A hard reload is what permanently closes the
window; from that point on, the normal persisted watched state applies with
no further undo available.

Do not implement this as a countdown timer.

### Undo semantics

Undoing a watch action:

- reactivates the watchlist entry;
- reverts the matching draft item back to incomplete, if the watch action
  completed one;
- reverts the draft itself back to active, if completing that item is what
  archived it early (see "Completed/fully watched draft" below) — never a
  draft that's archived for some other, unrelated reason;
- removes exactly the watched-history record that specific watch action
  created — never an older or otherwise-unrelated one;
- recalculates draft progress, watchlist state, and stats.

Every reversal step re-checks that what it's about to touch is provably the
result of THIS action (matching watched-history record ids, matching draft
status) before touching anything, specifically so a stale or
already-superseded undo can never revert someone else's legitimate state.

### Session-only state

Whether a given watch action can still be undone is not persisted anywhere
— it exists only in memory for the current application session. The watch
action itself is persisted immediately, exactly as it always was. Do not
add a `canUndo`-style field, or anything like it, to any persisted record.

### Completed/fully watched draft

Completing a draft's last remaining film still archives it early, exactly
as before. That early archive must not make the action that caused it
impossible to undo: the draft — and that last watch action — must stay
reachable and undoable for the rest of the session, including after
navigating away from the Active Draft page and back, not merely while it
happens to still be on screen at the moment of completion.

---

## RANDOM WATCHLIST FILM

Provide a Random Watchlist Film feature.

It picks one active watchlist film.

Postmortem weight boosts should affect the probability of eligible films being selected.

Include an option to reroll.

Do not accidentally select inactive/watched items.

---

## STATISTICS

Create a Stats area.

Only display metrics supported by available data.

Useful statistics include:

- current watchlist size;
- films watched from the watchlist;
- average watchlist age;
- oldest watchlist additions;
- newest additions;
- release-year distribution;
- decade distribution;
- average runtime;
- total remaining runtime;
- genre distribution;
- languages;
- countries;
- directors;
- average external rating;
- rating distribution;
- draft completion history;
- films drafted;
- challenge vs random completion rates;
- most-used challenges;
- deferred films;
- watchlist removals;
- monthly performance.

Do not render meaningless "N/A" dashboards full of missing statistics.

Hide or gracefully omit unsupported cards.

---

## MONTHLY WATCHLIST DRAFTS

This is the application's main feature.

A user creates a temporary watchlist challenge for a defined period.

### Difficulty

Provide:

Baby — 5 films

Easy — 8 films

Medium — 10 films

Hard — 12 films

Hardcore — 20 films

Freeform — special behaviour described below

Represent difficulty programmatically, not with duplicated magic numbers throughout the codebase.

---

## FREEFORM MODE

Freeform works differently.

Generate films in batches of FIVE.

The user can generate another batch as they progress.

At the end of the selected period, calculate the difficulty level they effectively achieved based on how many films they completed.

Use these thresholds:

0–4 = below Baby
5–7 = Baby
8–9 = Easy
10–11 = Medium
12–19 = Hard
20+ = Hardcore

Show the final achieved rank in the results.

Do not count generated-but-unwatched films as completed.

---

## DRAFT TIME MODE

When creating a draft, allow the user to choose:

CALENDAR MODE

or

TIMER MODE

This toggle only belongs in draft creation/configuration.

### Calendar Mode

The draft starts when created and ends at the END of the current calendar month in the user's timezone.

Example:

Created 27 August.
Ends at the end of 31 August.

It does NOT receive 30 days simply because it was created late.

### Timer Mode

The draft lasts exactly 30 days from creation.

Persist the calculated deadline.

Do not continually recalculate it from the browser clock.

### Calendar Mode Progress

This is a distinction between DEADLINE ELIGIBILITY and the TIME progress
indicator shown on the Active Draft page (see "ACTIVE DRAFT PAGE"). Calendar
Mode eligibility rules above are unchanged: a draft created 27 August still
begins 27 August and still ends at the end of 31 August, and does NOT
receive 30 days just because it was created late.

The TIME progress bar's percentage, however, represents progress through
the CURRENT CALENDAR MONTH as a whole — not through the draft's own
creation-to-deadline window. It does NOT start at 0% merely because the
draft was created partway through the month.

For Calendar Mode, the progress window is:

- Progress start: the start of the first calendar day of the month, in the
  profile's timezone.
- Progress end: the end of the final calendar day of the month, in the
  profile's timezone (the same instant as the deadline).

Therefore, for a draft in August regardless of when in August it was
created:

- August 1: approximately 0% elapsed.
- August 11: approximately one-third through August.
- August 31: approaching/at 100% elapsed.

For Timer Mode, the progress window is unchanged: 0% is the exact draft
creation timestamp, 100% is the persisted 30-day deadline. Timer Mode must
never be changed to calendar-month progress.

Both modes:

- Use exact timestamps (not integer day counts) for the percentage, so it
  moves smoothly within a day rather than jumping only at midnight.
- Clamp the percentage to 0-100 — never negative, never over 100%.
- Compute days remaining consistently in the profile's timezone, including
  around midnight, month boundaries, February, leap years, and the final
  calendar day.

---

## DRAFT CONFIGURATION — RANDOM VS CHALLENGE

Before selecting films show:

"How do you want the list to be made?"

For normal difficulty modes, display two linked sliders:

Random Films

Challenge Films

The total MUST always equal the number of films defined by the difficulty.

Example for Medium:

Random: 4
Challenge: 6

Total: 10

Moving either control changes the other automatically.

Do not allow invalid totals.

The interaction should feel polished and responsive.

Also show the numbers prominently.

For challenge-generated slots provide:

Choose My Challenge

or

Decide My Challenge For Me

### Choose My Challenge

Let the user choose challenge(s) from a searchable/selectable challenge browser.

Show descriptions.

Challenges that cannot currently run because required data is unavailable can be disabled with an explanation.

### Decide My Challenge For Me

Randomly choose challenges from the eligible challenge catalogue.

If a selected challenge cannot produce a film:

- log why;
- skip/reroll;
- choose another eligible challenge.

Avoid infinite reroll loops.

Do not draft the same film twice unless a future explicit feature permits that.

Avoid duplicate challenges within a draft where possible.

---

## CHALLENGE ARCHITECTURE

DO NOT implement the challenge catalogue as a massive UI switch statement.

Create a proper challenge engine.

Each challenge should have something like:

- id
- name
- description
- category
- required data capabilities
- interactive/non-interactive
- evaluate eligibility
- candidate selection logic
- display metadata

A challenge result should be able to represent:

success
ineligible
requires user choice
failure

Randomness should be injectable/seedable so challenge behaviour can be tested deterministically.

Challenge logic should have unit tests.

For every automatic challenge attempt log structured information in development:

- challenge id/name;
- whether it succeeded;
- why it was skipped;
- missing metadata;
- zero-candidate result;
- reroll event;
- selected film ID where successful.

Example:

[DraftChallenge]
challenge=prestige-pick
status=skipped
reason=no_films_rating_gte_4

Prefer a structured logger rather than scattered random console.log statements.

Persist challenge attempts when useful for debugging/statistics.

---

## SELECTION WEIGHTS

Each active watchlist entry starts with a baseline selection weight.

When a film gets:

"I didn't get time, but I wanted to!"

increase its future selection weight.

The increase remains until that film leaves the watchlist.

Weighted randomness should be implemented in a reusable, tested utility.

Challenges that randomly choose among eligible candidates may respect the film's selection weight unless the challenge explicitly defines a winner such as "highest rated" or "shortest".

---

## CHALLENGE DISPLAY

A film added through a challenge should clearly show its challenge underneath the film metadata.

Use a visually distinct accent.

Example:

CHALLENGE: Short King

Hovering/focusing/tapping the challenge label should display the challenge description.

Do not rely solely on hover because mobile devices exist.

Store which challenge generated the draft item.

For challenges with generated values, display those values.

Example:

Minute Match — target: 137 minutes

---

## CHALLENGE CATALOGUE

Implement the following.

Use deterministic tie-breaking via weighted/random selection where several films equally satisfy a rule.

If required information does not exist, mark the challenge ineligible and log the reason.

### WATCHLIST AGE / TIME

#### The Eldest

The oldest RELEASED film currently in the active watchlist.

#### The Ancient Ones

Randomly choose from the ten oldest watchlist additions.

#### Archaeological Dig

Random selection from the oldest 20% of watchlist entries by Date Added.

#### Fresh Meat

Randomly choose from the ten newest watchlist additions.

#### Forgotten Middle Child

Choose from the film(s) sitting at the middle index of the watchlist when sorted by Date Added.

If there are two exact middle entries, either can be selected.

#### The 100 Club

Choose randomly among watchlist ordinal positions:

100
200
300
400
etc.

Only positions that currently contain active films are eligible.

#### Buried Treasure

Film from the oldest 25% of watchlist additions with external average rating >= 4.0.

#### Spring Cleaning

Randomly choose from the 25 oldest active watchlist entries.

#### Decade Roulette

Randomly choose an eligible decade represented in the watchlist with equal probability between decades, then randomly choose a film from that decade.

#### Birth of Cinema

Choose from the oldest release year currently represented on the active watchlist.

#### Temporal Opposite

Look at the previous generated draft pick.

If previous film >= year 2000:
choose from the oldest eligible decade.

If previous film < 2000:
choose a film from 2000 onward.

Requires a previous draft pick.

#### Turn of the Millennium

Random film released in:

1999
2000
or 2001.

#### Decade Survivor

Determine which decade has the FEWEST remaining active watchlist films.

Choose from it.

Ties can be resolved randomly.

#### Generational Leap

Film must be at least 30 release-years older OR younger than the previous generated draft pick.

#### Calendar Match

Match the last digit of a film's release year to the current calendar month's numeric value modulo 10.

Examples:

September = 9
October = 0
November = 1
December = 2

Select randomly among matches.

---

### RUNTIME

#### Short King

Shortest active watchlist film with a known runtime.

#### Plus Sized Short King

Shortest watchlist film qualifying as feature length.

Make the feature-length threshold configurable.

Default to 40 minutes unless the project establishes a better explicit rule.

#### Under 90 Club

Random film with runtime < 90 minutes.

#### Boss Battle

Random film with runtime >= 150 minutes.

#### Runtime Roulette

Randomly choose one category with equal probability:

<90

90–119

120–149

150+

Then choose randomly among eligible films in the selected category.

If category has no candidates, reroll/log.

#### Double Feature Half

Pick a film that can be paired with another film already in the current draft while keeping their combined runtime under 200 minutes.

If this challenge is encountered before enough draft context exists, defer it until later in generation.

#### Goldilocks

Film with runtime closest to exactly 100 minutes.

#### Minute Match

Generate a random integer from 80 through 180 inclusive.

Choose the film whose runtime is closest.

Display the generated target number on the draft item.

---

### RATINGS

Use external/community average rating, NOT the user's own rating, unless explicitly stated.

#### Crown Jewel

Highest-rated active watchlist film.

#### Trash Goblin

Lowest-rated active watchlist film.

#### Danger Zone

Random film with rating < 3.0.

#### Respectable Citizen

Random film with rating >= 3.0 and <= 3.5.

#### Prestige Pick

Random film with rating >= 4.0.

#### Perfectly Average

Film whose rating is closest to 2.5.

#### Rating Roulette

Randomly choose a half-star rating band represented by eligible films, then randomly choose within that band.

Use clear non-overlapping bucket boundaries.

#### Trust the People

Random film from the top 10% of watchlist films ranked by average rating.

#### Defy the People

Random film from the bottom 10% by average rating.

---

### POPULARITY / COMMUNITY

These challenges only become available when the provider supplies the necessary metrics.

#### Main Character

Most popular remaining watchlist film.

Define the provider's canonical popularity metric in one place.

#### Hipster Pick

Randomly sample 20 active watchlist films.

From that sample choose the film with the lowest watch count.

If fewer than 20 exist, sample all available films.

#### Nobody Knows This

Active watchlist film with the smallest watch count.

#### List Goblin

Film appearing on the most Letterboxd/community lists if that metric is available.

#### Cult Classic

High-rated but relatively low-watch-count film.

Define as:

rating >= 4.0

and watch count in the bottom 25% of the user's eligible watchlist.

#### Everyone Saw It Except Me

Highest watch count.

#### Nobody's Favourite

Lowest fans count.

#### Hidden Gem Algorithm

Filter:

rating >= 4.0

Then choose the film with the fewest watches.

---

### GENRES

#### Genre Roulette

Random genre represented in the watchlist, then random eligible film.

When the user is manually choosing challenges, allow them to choose the genre.

#### Watchlist Infestation

Find the genre occurring most often across the active watchlist.

Randomly choose a film containing it.

#### Extinction Event

Find the genre represented by the fewest remaining watchlist movies.

Randomly choose from that genre.

Ignore pathological metadata values with zero actual films.

#### Genre Detox

Choose a genre absent from the previous FIVE draft selections, then select an eligible film.

#### Double Agent

Randomly choose two genres.

Pick a film containing BOTH.

If no film exists, reroll the genre pair with a bounded retry strategy.

#### Genre Collision

Select a film whose genre COMBINATION the user has never watched before.

Requires sufficient watched-history metadata.

Treat combinations canonically so order does not matter.

#### Genre Whiplash

Film must share ZERO genres with the previous draft pick.

#### Dominant Species

Random selection from the watchlist's most common genre.

#### Minority Report

Determine the three smallest represented genres.

Randomly choose one of those genres and then an eligible film.

---

### DIRECTORS

#### Director Roulette

Randomly select a director represented by MORE THAN ONE active watchlist film.

Then randomly choose one of their films.

#### Finish the Job

Choose a director for whom the user has already watched multiple films but still has an unwatched film on the watchlist.

Then choose one of the remaining films.

#### New Blood

Film from a director the user has never watched before.

#### Old Friend

Film from a director whose work the user has previously rated highly.

Use a clearly defined threshold, defaulting to user rating >= 4 stars.

#### Second Chance

Select a director whose previous film the user rated poorly and from whom they have watched nothing since.

Default "poorly" to <= 2 stars and document the rule.

#### Auteur Month

Film from a director represented at least THREE times in the active watchlist.

#### One and Done

Film whose director is represented exactly once in the active watchlist.

#### Director Monopoly

Film from the director with the most active watchlist films.

#### Passing the Torch

Start with the director of the previous draft pick.

Look at that previous film's genres.

Choose a DIFFERENT director with an eligible film sharing at least one of those genres.

Then select one of their films.

---

### COUNTRY / LANGUAGE

#### Passport Control

Choose a country represented in the active watchlist.

Every represented country gets equal probability regardless of how many films it has.

Then choose a film from that country.

#### Language Roulette

Choose a language represented in the watchlist with equal probability between languages.

Then randomly choose a film containing that language.

#### No English Allowed

Random film whose primary/original language is not English.

Define which provider field is canonical.

#### World Cup

Randomly select four represented countries.

Randomly eliminate three.

The surviving country wins.

Then randomly choose a film from it.

Store/show the four countries and winner in challenge metadata if practical.

#### Continental Drift

Choose a film that does NOT share the previous draft pick's country.

#### Weeb

Random Japanese film from the active watchlist.

Use country/origin data rather than guessing from language/title.

---

### COLLECTIONS / FRANCHISES

#### Finish What You Started

Choose a sequel/collection film where the user has already watched an earlier entry.

Requires collection and watched-history data.

#### Franchise Debt

Oldest watchlist ADDITION belonging to a known film collection.

#### Gateway Drug

First unwatched movie from a collection the user has never started.

"First" should use collection ordering/release order where reliable.

#### No Homework

Choose a standalone film with no filmCollectionId / collection identifier.

---

### CONTEXTUAL / TASTE

#### Palette Cleanser

Choose the film maximally different from the previous THREE relevant films.

Use a documented distance score combining:

- release year distance;
- runtime distance;
- genre dissimilarity.

Normalise numeric components so one metric cannot dominate solely due to scale.

Genre difference should use a sensible metric such as Jaccard distance.

Unit-test the scoring algorithm.

#### Decade Detox

Select from a decade absent from the user's last TEN watched films.

If reliable recent watch history does not exist, the challenge is ineligible.

#### Five-Star Echo

Choose a film sharing either:

- director;
- or genre

with one of the user's recent 5-star watches.

---

### META / RANDOM / INTERACTIVE

#### The Number 7

Shuffle the eligible watchlist and take the seventh result.

If an authorised provider offers actual Letterboxd-style Shuffle ordering, encapsulate it in the provider.

Otherwise use the application's own properly randomised shuffle and document that behaviour.

Requires at least seven eligible films.

#### Battle Royale

This is INTERACTIVE.

Generate eight random eligible movies.

Show all eight.

Ask the user to select their MOST anticipated.

Then ask them to select their LEAST anticipated from the remaining candidates.

The MOST anticipated film is added to this month's draft.

Persist enough interaction information for the flow to survive refresh.

#### Battle Royale Variant

The user-facing title must simply be:

Battle Royale

Do NOT include "Fake" anywhere in the visible challenge title.

Internally use a distinct challenge ID such as:

battle-royale-underdog

Generate eight random eligible movies.

Ask the user for their MOST anticipated.

Then LEAST anticipated.

The LEAST anticipated film is added to the draft.

The challenge description should explain the twist without using "Fake" in its title.

#### Three Doors

INTERACTIVE.

Produce three candidates:

1. Short — a suitably short film.
2. Old — a suitably old release.
3. Highly Rated — a highly rated film.

Present the three as doors/candidates.

The user chooses one.

Only the selected film enters the draft.

#### The Draft Lottery

Every eligible movie receives tickets.

Start with 1 baseline ticket.

Add:

+1 for every COMPLETE year it has been on the watchlist

+2 if underwatched

+2 if it belongs to an underrepresented genre

+1 if highly rated

Default definitions:

underwatched = bottom 25% by watch count

underrepresented genre = at least one genre in the bottom quartile of genre frequency

highly rated = rating >= 4.0

If a metric is unavailable, simply do not award that particular bonus rather than inventing it.

Perform a weighted random draw.

Store/expose the ticket calculation for debugging.

#### The Anti-Draft Lottery

Start from the same transparent ticket framework.

Films should receive FEWER tickets when:

- very recently added;
- highly similar to the user's normal taste.

Implement transparent, configurable penalties.

Suggested starting rule:

recently added within 30 days: -2 tickets

strongly similar to established user taste: -2 tickets

Never allow fewer than 1 ticket.

Taste similarity must use real available history and documented logic.

If adequate taste history is unavailable, omit that penalty rather than guessing.

Unit-test the scoring.

---

## ACTIVE DRAFT PAGE

Once a draft exists create a dedicated Active Draft page.

Prominently show:

DAYS

- days remaining as a number;
- percentage of time remaining/completed;
- progress bar.

FILMS

- watched count;
- total count;
- watched percentage;
- progress bar.

Use exact deadline timestamps internally but present human-readable days.

Handle:

- just created;
- final day;
- expired;
- completed early;
- timezone boundaries.

### Progress Bar Visual

Progress bars stay elegant but must not read as barely-there: visible
contrast between the track and its fill, an obvious filled portion, a
restrained FDraft accent color for the fill (not a bright/neon treatment),
a subtle animated transition when the value changes, and readable
percentage text alongside the bar rather than relying on the bar's width
alone.

The primary film area should resemble a clean responsive Letterboxd watchlist.

Cards need:

- poster;
- title;
- year;
- average rating if available;
- genres if available;
- challenge badge if applicable;
- watched eye control.

Clicking the film itself opens the corresponding Letterboxd film page.

Do not make the eye control trigger navigation.

When watched:

- mark draft item complete;
- mark film watched;
- remove it from active global watchlist;
- retain draft history.

Optionally move completed draft cards into a collapsed/completed section rather than simply making all evidence of them disappear.

The watched action above is undoable for the remainder of the current
session, including reversing an early archive it caused — see "WATCHED FILM
UNDO".

---

## EXPIRY / POST-DRAFT FLOW

When a draft's deadline passes, or all relevant completion handling is ready, show a results/postmortem flow.

For each film the user DID NOT watch show:

"Why didn't you watch these?"

The user answers PER FILM.

Options:

### "I didn't get time, but I wanted to!"

Effect:

Increase the film's future selection weight.

Keep it in the watchlist.

The weight increase persists until the film leaves the active watchlist.

### "Actually, I don't think I want to watch this at all"

Effect:

Remove/deactivate the film from the watchlist.

Keep historical records.

### "I just didn't"

Effect:

No watchlist/weight change.

Keep it on the watchlist.

Persist responses.

The flow needs to survive refresh and must not apply the same mutation twice.

Once resolved, mark the draft complete/archived and show results.

---

## HISTORY PAGE REDESIGN

The History page has TWO clearly separated sections — never one
undifferentiated feed.

### Section one — Recently Watched

Heading: "Recently Watched". Shows the user's 5 most recently watched
films, most recently watched first. Fewer than 5 shows however many exist;
none shows a polished empty state.

For each, show: poster where available; title; release year; runtime
where available; the exact watched date; optional challenge/draft origin
where relevant.

Use the actual watched timestamp/history, never Date Added.

#### Watched date format

Readable, local-profile-timezone formatting — e.g. "9 August 2026" — never
a raw ISO date.

### Section two — Previous Drafts

Heading: "Previous Drafts". Shows completed/expired/finalised drafts. Each
should retain and clearly display:

- difficulty;
- time mode (Calendar or Timer);
- started date;
- deadline (date range);
- number of films;
- completed films;
- completion percentage;
- generated via random/challenge;
- challenge names;
- postmortem responses;
- Freeform achieved rank where applicable.

Allow the user to open (expand) a previous draft.

Each finalised draft's film list has the same general sorting control the
Watchlist page has — see "SORTING FOR FINALISED / HISTORICAL DRAFTS" below.

#### Historical draft films

Within an opened previous draft, show ALL films that were drafted, always
clearly split into two groups: Watched and Not Watched. Where a film was
watched as part of that draft, show its watched date if available.

Do not lose an unwatched historical film just because it remained on, or
was later removed from, the current watchlist — historical drafts are
snapshots.

### History data integrity

Do not infer historical state from the current watchlist. Use persisted
draft/history records. A film may later be removed, watched later,
re-imported, or metadata-refreshed — none of that may silently rewrite
what actually happened during an old draft.

Historical data must remain stable even if a film later leaves the watchlist.

---

## SORTING FOR FINALISED / HISTORICAL DRAFTS

When viewing a completed/finalised draft, provide the same general sorting
control as the Watchlist page's — sort only, no filters; a historical
draft's small, fixed film list doesn't need narrowing.

Relevant options:

- Original Draft Order (the default — see below)
- Watched / Unwatched
- Title
- Release Year
- Runtime
- Rating
- Challenge / Random
- Watched Date, where applicable

The default MUST be Original Draft Order.

Historical draft data must never be destructively reordered in the
database. Sorting is presentation-only — it operates on a copy of the
item list for display and never writes back to any stored field,
`orderIndex` included. The original generated draft position must always
be preserved and recoverable: switching back to "Original Draft Order"
(or reloading the page, since the chosen sort isn't itself persisted)
must always restore exactly the same order the draft was actually
generated in.

---

## STATE / CONSISTENCY

Do not let important state live only in React component state.

Draft creation must be transactional enough that refreshes cannot create half a draft.

Interactive challenges must be resumable.

Prevent duplicate submission where possible.

Use optimistic UI only where safe.

Handle concurrent sessions reasonably.

---

## RANDOMNESS ENGINEERING

Create reusable utilities for:

- uniform random selection;
- weighted selection;
- random sample without replacement;
- seeded test RNG;
- percentile subsets;
- ties;
- shuffled candidates.

Production can use secure/native randomness appropriate for the platform.

Tests should use deterministic seeded randomness.

---

## EDGE CASES

Explicitly handle:

- empty watchlist;
- fewer watchlist films than difficulty requires;
- missing runtime;
- missing rating;
- missing genre;
- missing country;
- missing director;
- missing collection;
- missing community metrics;
- no candidate satisfying a challenge;
- challenge reroll exhaustion;
- same film selected twice;
- watchlist import during an active draft;
- film removed while included in an active draft;
- expired draft opened on another device;
- timezone change;
- duplicate imports;
- malformed CSV;
- provider outage;
- metadata enrichment partial failure;
- interactive challenge refresh;
- one remaining watchlist film;
- percentage division by zero.

Never enter infinite loops.

---

## TEST REQUIREMENTS

Testing is mandatory.

Challenge rules are domain logic and should receive especially strong unit coverage.

At minimum test:

- difficulty counts;
- slider invariant;
- Calendar deadline calculation;
- Timer deadline calculation;
- stale-import threshold;
- watchlist import parsing;
- deduplication;
- random selection excludes inactive films;
- weight calculations;
- weighted selection;
- every challenge;
- challenge ineligibility;
- rerolls;
- bounded rerolls;
- challenge metadata;
- duplicate film prevention;
- watched state;
- postmortem effects;
- progress calculations;
- Freeform ranking;
- lottery ticket calculations;
- palette-cleanser distance;
- interactive challenge state transitions.

Add integration tests for:

- create draft;
- generate draft;
- mark watched;
- expire draft;
- postmortem;
- import watchlist.

Add Playwright coverage for the critical happy path:

Login
→ import watchlist
→ create Medium draft
→ configure random/challenge split
→ generate
→ view active draft
→ mark film watched
→ complete/expire
→ answer postmortem
→ view archived draft

If external metadata providers make E2E unreliable, mock the provider boundary rather than skipping domain behaviour.

---

## QUALITY GATES

At the end of EACH implementation phase:

1. Run formatter if configured.
2. Run lint.
3. Run TypeScript/typecheck.
4. Run unit tests.
5. Run relevant integration tests.
6. Run relevant E2E tests where practical.
7. Build the application.
8. Fix regressions.
9. Review the UI at mobile and desktop widths.
10. Check browser console for errors.

Report:

- what you changed;
- schema/migration changes;
- assumptions;
- tests actually run and their result;
- anything genuinely blocked.

Do not say "should work".

Verify it.

---

## IMPLEMENTATION STYLE

Before coding:

1. Inspect the repository.
2. Summarise its architecture privately/briefly.
3. Determine which existing conventions to preserve.
4. Make a plan.
5. Implement the requested phase fully.

Avoid rewriting the entire codebase unnecessarily.

Prefer domain modules such as:

domain/drafts/
domain/challenges/
domain/watchlist/
domain/stats/
domain/import/

rather than embedding all logic in page components.

Challenge definitions should ideally register through a catalogue/registry.

Separate:

challenge selection

from

challenge execution

from

candidate filtering

from

presentation.

This matters because the challenge catalogue will grow.

---

## DEFINITION OF DONE

The app is not "done" merely because pages render.

It is done when:

- watchlist data persists;
- imports are reliable;
- the stale import warning works;
- drafts have real persisted state;
- deadlines are accurate;
- random/challenge splitting works;
- challenge generation is robust;
- unavailable data does not produce fake results;
- all challenge failure paths reroll safely;
- skipped challenges produce useful developer logs;
- watched films update both watchlist and draft state;
- postmortem choices have their specified consequences;
- cross-device state stays synchronised;
- the UI works well on desktop and mobile;
- the major flows are tested;
- lint/typecheck/tests/build pass.

Treat this specification as the product source of truth unless a later instruction explicitly changes it.

---

## Implementation log

This section is a running index of decisions made and assumptions taken during
implementation, kept up to date phase by phase. It is _not_ part of the original
specification — it is the project's memory of how the spec has been interpreted.

### Phase 1 — Architecture, foundation and project setup

- Scaffolded with Next.js 16 (App Router, Turbopack, React 19), TypeScript strict,
  Tailwind CSS v4. Chosen as the current stable, repository-appropriate stack per the
  spec's recommended stack — this was a greenfield repository so no migration
  constraints applied.
- Next.js 16 renames the `middleware.ts` convention to `proxy.ts` (Node runtime only).
  Supabase session-refresh logic lives in `src/proxy.ts` exporting `proxy()`.
- Cache Components (`cacheComponents: true`) was left **off**. Every page in this app
  is per-user and auth-gated, so there is no meaningful static shell to prerender;
  the simpler request-time dynamic rendering model is the correct default here.
- Schema is authored as plain versioned SQL migrations under `supabase/migrations/`,
  applied to and verified against a real local Postgres via the Supabase CLI
  (`supabase start`, Docker was available in this environment) rather than just
  reviewed by eye. `Database` types in `src/lib/supabase/types.generated.ts` are
  generated from that live schema via `supabase gen types typescript --local`, with
  `src/lib/supabase/types.ts` as a thin hand-written wrapper adding app-friendly
  aliases — regenerate the `.generated.ts` file after every migration change.
- Recent Supabase projects no longer auto-grant `anon`/`authenticated`/`service_role`
  privileges on newly created tables (RLS policies alone are necessary but not
  sufficient — Postgres checks base table GRANTs first). This was discovered via a
  live smoke test, not by inspection, and fixed in
  `20260810000800_grants.sql`, which also corrected two tables
  (`draft_challenge_attempts`, `selection_weight_adjustments`) that had been
  over-restricted to admin-only writes when they should allow the owning user to
  insert their own rows, same as `draft_items`.
- Full challenge catalogue, import pipeline, and draft generation are explicitly out
  of scope for Phase 1. Only framework-independent interfaces were created
  (`FilmMetadataProvider`, `ChallengeDefinition`, `ChallengeResult`, difficulty
  registry) so later phases can implement against a stable contract.

### Phase 2 — Letterboxd importing and metadata enrichment

- CSV parsing (`src/domain/import/*-csv.ts`) uses `papaparse` for RFC-compliant
  quoting/escaping rather than naive `split(",")`. ZIP extraction
  (`src/domain/import/export-zip.ts`) uses `fflate`, a pure-JS zero-native-dep
  library, matching to filenames (`watchlist.csv`, `ratings.csv`, `watched.csv` /
  `watched-films.csv`, `diary.csv`) anywhere in the archive so a nested export
  folder structure still works. Only `watchlist.csv` is required; the rest are
  imported when present.
- Watchlist ordinal position is **derived from CSV row order** — Letterboxd's export
  format has no explicit position column, and row order is the only ordering signal
  available. Documented as an assumption in `src/domain/import/plan.ts`.
- Film identity/deduplication (`src/domain/import/film-key.ts`) prefers the
  Letterboxd URL slug (reliable, Letterboxd's own identifier) and falls back to a
  normalized title+release-year key only when a row has no URI — a heuristic that
  can theoretically collide for two different films sharing a title and year,
  explicitly documented as such rather than presented as authoritative.
- Import idempotency is implemented as a pure diff (`src/domain/import/plan.ts`):
  given parsed rows plus snapshots of existing films/watchlist entries, it computes
  create/reactivate/update/no-op per row without touching a database, which is what
  makes "repeated imports" and "date preservation" cheaply unit-testable. The
  orchestration layer (`src/lib/import/`) loads the snapshots and applies the plan.
- Film metadata enrichment now has a real, working provider — TMDB
  (`src/domain/import/providers/tmdb-provider.ts`) — behind the same
  `FilmMetadataProvider` interface from Phase 1, selected automatically when
  `TMDB_API_KEY` is set (`configured-provider.ts`) and falling back to the Phase 1
  null provider otherwise, so imports work identically either way, just with or
  without enrichment. TMDB does not expose Letterboxd-specific community metrics
  (watch/fan/list counts) — those stay null rather than being approximated. TMDB's
  own `vote_average` (0–10) is linearly rescaled to this app's 0–5 star convention
  and stored with `provider: "tmdb"` for provenance; it is a real, attributed
  external rating, not Letterboxd's, and is documented as such in code.
- Per-film enrichment failures (provider outage, one bad lookup) are caught and
  counted (`enrichment_failures`) without rolling back the watchlist import —
  verified directly against a live database in the integration test (a provider
  that throws for one specific film out of three still leaves all three
  watchlist_entries/films committed).
- `films`/`film_metadata` writes go through the admin (service-role) client
  (`src/lib/import/resolve-films.ts`, `enrich-films.ts`) because they are shared,
  non-user-owned catalog data — consistent with the Phase 1 grants design.
  `watchlist_entries`/`watchlist_imports`/`user_ratings`/`watched_history` writes go
  through the normal user-scoped client so RLS remains the enforcement boundary for
  anything actually owned by the signed-in user.
- Discovered and fixed a second missing-constraint gap while wiring up idempotent
  history import: `watched_history` was missing the `(user_id, film_id,
watched_date)` unique constraint its own Phase 1 design comment promised — added
  in `20260810000900_watched_history_unique_constraint.sql`. Rows without a
  watched_date (only `watched.csv` lacks one) are de-duplicated in application code
  instead, since Postgres treats every `NULL` as distinct.
- Added a genuine integration test suite
  (`src/lib/import/run-watchlist-import.integration.test.ts`, `pnpm
test:integration`) that runs against the real local Supabase stack — creates a
  throwaway auth user via the admin API, runs the actual import pipeline, asserts
  on real database state, and deletes the user afterward. Kept in a separate Vitest
  project (`vitest.integration.config.mts`) from the fast offline unit suite so
  `pnpm test` never depends on Docker being available.
- The stale-import warning banner (Phase 1) now has a working "Import again" link;
  the watchlist empty state and header now link to a real `/watchlist/import` page
  instead of a "coming soon" placeholder.
- Two pre-existing (Phase 1) UI defects were found via live browser testing this
  phase and fixed for every affected component, not just the new ones:
  `DropdownMenuLabel` needs a `DropdownMenuGroup` ancestor (Base UI throws
  otherwise) — `src/components/layout/user-menu.tsx`; and every `Button` rendered
  as a `next/link` `<Link>` via the `render` prop needs `nativeButton={false}` or
  Base UI logs an accessibility warning about non-native button semantics — fixed
  across `not-found.tsx`, `watchlist/page.tsx`, `stale-import-warning.tsx`, and
  `import-result-card.tsx`.
- **Known non-blocking issue, still present:** the same local-Supabase-only
  intermittent `"JWT issued at future"` PostgREST rejection documented in the Phase
  1 log recurred during this phase's live browser testing (roughly 1-in-3 runs).
  Investigated substantially further this time: ruled out real clock skew (host,
  every container, and Postgres `now()` all agree to well under a second);
  confirmed a manually replayed copy of the exact same access token that a failing
  request used succeeds against PostgREST every time; confirmed it does not
  reproduce via plain `@supabase/supabase-js` (no Next.js/cookies/SSR layer)
  under the same concurrency; confirmed the automated integration suite (same
  pipeline code, plain `supabase-js`, no SSR layer) has never reproduced it across
  many runs. It appears specific to `@supabase/ssr`'s per-request server client
  creation pattern combined with this local Docker stack, not to application logic,
  RLS, or the import pipeline itself. Simplified `watchlist/page.tsx` from three
  concurrent `Promise.all` queries to sequential ones, which reduces but does not
  eliminate it. It is caught cleanly by the existing error boundary with a working
  "Try again" button, and does not occur in the Vitest integration suite. Treat any
  future recurrence as this same known issue unless new evidence points elsewhere.

### Phase 3 — Watchlist UI, watched state, random picker and stats

- "Mark watched" is a single Postgres function, `mark_watchlist_entry_watched`
  (`supabase/migrations/20260810001000_mark_watched_function.sql`), not sequential
  `.from()` calls from the app. It atomically logs `watched_history`, deactivates
  the `watchlist_entries` row, and completes a matching item in the user's active
  draft if one exists — one transaction instead of three independent writes that
  could partially fail. `security invoker` (the default): it runs as the calling
  `authenticated` role, so RLS still governs every write; the function only adds
  atomicity, not elevated privilege. Like every function in this project (see the
  Phase 1 grants log entry), it needed an explicit `grant execute ... to
authenticated` — the "no auto-expose" behavior applies to functions too, not
  just tables.
- The eye control is a **sibling** of the card's `<a>`, not a descendant —
  `<button>` nested inside `<a>` is invalid HTML and behaves inconsistently across
  browsers. Both are absolutely/normally positioned within a `position: relative`
  card container so the button visually overlaps the link's poster region; because
  they're siblings, a click in that region hits whichever element has the higher
  stacking context (the button) and never reaches the anchor underneath, with no
  `stopPropagation`/`preventDefault` needed.
- The random film picker fetches the full active-watchlist candidate list
  server-side (including `selection_weight`) but performs the actual weighted
  pick, and every reroll, client-side — rerolling should feel instant, not incur a
  round trip. The **first** pick is computed server-side and passed down as a
  prop (`initialPickId`) rather than picked independently on the client: picking
  with `Math.random()` on both sides would produce different results and trigger
  a React hydration mismatch (the exact "Math.random() which changes each time
  it's called" case React's own hydration-mismatch warning names). Only rerolls
  after that first paint use client-side randomness, where there's no SSR output
  left to mismatch against.
- Watchlist stats (`src/domain/stats/watchlist-stats.ts`) draw a hard line per
  field: `remainingCount` and `watchedCount` are always "available" (zero is a
  real answer, not missing data), while everything derived from optional
  provider-supplied metadata (runtime, genres, ratings, countries, languages,
  directors) is marked unavailable — and the corresponding card omits itself
  entirely — the moment zero active films carry that field. "Total remaining
  runtime" sums only films with a _known_ runtime and is documented as a lower
  bound, not a true total, whenever any film's runtime is unknown, rather than
  silently understating it with no caveat.
- Draft-completion/challenge-performance stats are **not implemented yet** —
  Monthly Watchlist Drafts don't exist until that feature phase ships, so
  `drafts` is structurally always empty for every user right now. Building that
  calculation against data that cannot exist yet would mean shipping an
  untestable code path; the stats page has a code comment explaining the
  deferral rather than a card that can only ever show zero.
- Distribution "charts" (decades/genres/ratings/directors/countries/languages)
  are deliberately minimal single-hue horizontal bar lists
  (`src/components/stats/distribution-bars.tsx`), not a charting library: per
  the dataviz skill, each is one series (a ranked count per category, not
  multiple series needing persistent per-category color identity), so a single
  accent hue plus always-visible direct labels (never hover-only, this app
  targets touch as a first-class input) is the correct level of visual
  investment — full categorical color assignment would be over-built for what
  the data actually is.
- Reused and extended the Phase 2 integration-test pattern: extracted the
  duplicated "create a throwaway confirmed auth user, sign in, return an
  authenticated client" setup into `src/lib/testing/integration-helpers.ts` so
  both the import and mark-watched integration suites share it. Discovered
  while writing the new suite that `service_role` has no grant on
  `watchlist_entries`/`drafts`/`draft_items` (by design — only `authenticated`
  should ever write user-owned tables; `service_role` is scoped to the shared
  `films`/`film_metadata` catalog per the Phase 1 grants design) — the test's
  seeding helper was fixed to seed through the user's own client, matching how
  the real app writes these tables, rather than loosening the grants to make a
  shortcut work.
- Fixed a real, reproducible accessibility bug found via live testing (not just
  code review): the Base UI `Button` component, when overridden via `render` to
  render as something other than a real `<button>`, needs `nativeButton={false}`
  or it silently keeps native-button ARIA semantics on an element that isn't
  one — this affects any interactive control rendered through `render`, so it
  will keep coming up as new UI is added, not just the cases fixed so far.
- Known non-blocking issue from Phases 1–2 (`"JWT issued at future"` on this
  local Supabase Docker stack) was observed again during this phase's live
  smoke testing, unchanged in character — still environment-specific, still
  caught cleanly by the existing error boundary, still absent from the
  integration suite. No new information this phase; see the Phase 2 entry.

### Phase 4 — Draft creation, difficulty modes and deadlines

- Draft creation is transactional via two Postgres functions,
  `create_draft` and `add_draft_films`
  (`supabase/migrations/20260810001100_draft_creation_functions.sql`), following
  the Phase 3 `mark_watchlist_entry_watched` pattern: `security invoker`, each
  wraps multiple related writes in one statement so a double-click or a
  refresh mid-request cannot produce a duplicate or half-created draft.
  Duplicate-draft protection is the pre-existing `one_active_draft_per_user`
  partial unique index — a concurrent second `create_draft` call for the same
  user fails with Postgres `23505`, which `src/lib/drafts/create-draft.ts`
  turns into a friendly "you already have an active draft" message rather
  than a raw database error. Both functions needed the same explicit
  `grant execute ... to authenticated` as every other function in this
  project (Phase 1/3 grants log entries).
- `p_challenge_mode` on `create_draft` needed `default null` in the SQL
  signature — without it, the Supabase CLI's generated TypeScript `Args` type
  makes the parameter required (`p_challenge_mode: DraftChallengeMode`)
  instead of optional, forcing a real enum value to be passed even when no
  challenge slots exist for the draft. Confirmed empirically (a throwaway
  test function, since discarded) that `default null` on a plain function
  parameter is what flips the generator's optionality inference, and that
  Postgres requires defaulted parameters to be trailing, which fixed the
  parameter order.
- **Challenge film selection is explicitly out of scope for this phase and
  was not faked.** The numbered prompt for Phase 4 asks for difficulty
  selection, the random/challenge slider split, deadlines, and Freeform —
  it does not mention the challenge catalogue/engine, and its own unit-test
  list has no challenge-selection tests. `challenge_film_count` and
  `challenge_mode` are recorded on the `drafts` row so the configuration
  survives, but no `draft_items` are fabricated for those slots — there is
  no challenge engine yet to generate real ones, and inventing placeholder
  challenge films would violate the "no fake/mock production behavior"
  instruction. To keep this honest end-to-end, the `/drafts` summary reports
  `{completed}/{items.length} films completed` (only real items) plus a
  separate "N challenge films coming soon" note, rather than implying a
  10-film Medium draft has 10 playable items when only the random slots do.
  The random slots themselves are fully real: they're immediately filled
  from the user's actual active watchlist via weighted random selection.
  A difficulty is disabled in the picker (and rejected server-side as a
  defensive check in `createDraft()`) whenever the active watchlist doesn't
  have enough films for its random count, so a draft can never be created in
  a structurally half-filled state.
- Freeform sidesteps the `drafts.total_films > 0` check constraint by having
  `create_draft` generate its first batch (up to `FREEFORM_BATCH_SIZE = 5`,
  clamped to however many watchlist films actually exist) atomically as part
  of creation, rather than creating an empty draft and generating batch one
  as a separate follow-up call. Freeform has zero challenge slots per spec,
  so it needed none of the challenge-deferral caveat above — it is fully
  functional immediately.
- Random selection (`pickRandomFilms` / `weightedSampleWithoutReplacement`,
  `src/domain/watchlist/random-pick.ts` and `src/domain/shared/rng.ts`) picks
  candidates without replacement to guarantee a film never appears twice in
  the same draft, and reuses the Phase 3 injectable `Rng` interface
  (`createDefaultRng`/`createSeededRng`) so this is deterministically
  unit-tested rather than only checked statistically at runtime.
  `generateFreeformBatch` (`src/lib/drafts/generate-freeform-batch.ts`)
  excludes watchlist entries already present as `draft_items` on that draft
  before sampling the next batch, so repeated "generate more" calls never
  reintroduce a film already in the list.
- Server-derived timestamps: `createDraft()` calls `new Date()` itself,
  inside orchestration code that only ever runs in a Server Action/Component
  context, and passes it into the pre-existing `calculateDraftDeadline()` —
  the browser clock is never consulted for Calendar or Timer mode deadlines.
- Found and fixed a real, reproducible bug in the shadcn/Base UI `Slider`
  wrapper (`src/components/ui/slider.tsx`) via live browser testing, not code
  review: its thumb-count fallback only checked `Array.isArray(value)`, so a
  single-thumb slider passed a plain `number` (as both linked sliders here
  do) fell through to the _range_-slider default of `[min, max]` — two
  elements — and silently rendered **two** overlapping, independently
  interactive thumbs bound to the same value. Confirmed via a DOM dump during
  smoke testing (`getByRole("slider", ...)` resolved two elements for one
  visible thumb) before fixing the fallback to check `typeof value ===
"number"` first. Also fixed, same file: `aria-label` passed to `Slider` was
  only reaching the non-interactive Root wrapper element, not the actual
  focusable Thumb — Base UI's `SliderRoot` only forwards `aria-labelledby`
  to thumbs, not `aria-label` — so the accessible name never reached the
  keyboard-operable control. Both bugs affect any future use of this shared
  component, not just the linked sliders that surfaced them.
- Browser smoke-tested end-to-end with Playwright against the real local dev
  server and real local Supabase (two throwaway seeded users, deleted
  afterward): Medium difficulty with a manually-adjusted slider split,
  Calendar/Timer toggle, transactional create, the active-draft summary, and
  Freeform's first batch plus a "generate more" batch — at both a 1280×900
  desktop viewport and a 390×844 mobile viewport. This is what caught both
  Slider bugs above; a code-review pass alone had not surfaced either one.
- Unit tests for difficulty counts, the linked-slider invariant, calendar/
  timer deadlines (including end-of-month, leap years, and timezone
  boundaries), and Freeform ranking already existed from the Phase 1
  domain-layer skeleton (`src/domain/drafts/*.test.ts`) and needed no
  changes — this phase added tests only for the genuinely new logic:
  `weightedSampleWithoutReplacement` (`src/domain/shared/rng.test.ts`) and
  `pickRandomFilms` (`src/domain/watchlist/random-pick.test.ts`), plus new
  integration suites for `create_draft`/`add_draft_films` against the real
  database (`src/lib/drafts/*.integration.test.ts`): duplicate-draft
  rejection, insufficient-watchlist rejection, Freeform's first-batch
  behavior, cross-batch no-reuse, and the non-Freeform rejection path.

### Phase 5 — Challenge engine foundation + age/runtime/rating challenges

- Phase 1 had already scaffolded the engine's shape (`src/domain/challenges/
types.ts`, `registry.ts`, `logger.ts`) with zero challenges registered —
  this phase filled that in rather than redesigning it: `ChallengeDefinition`
  (id/name/description/category/requiredCapabilities/interactive/isEligible/
  attempt), the `success | ineligible | requires_user_choice | failure`
  result union, and the `[DraftChallenge]` structured logger were all reused
  as-is.
- Two randomness utilities the engine needed didn't exist yet and were added
  to `src/domain/shared/rng.ts` alongside the Phase 3/4 ones
  (`pickUniform`/`shuffle`/`sampleWithoutReplacement`/`pickWeighted`/
  `weightedSampleWithoutReplacement`): `filterByExtreme` (tie _detection_ —
  every film exactly tied for a min/max key, e.g. shortest runtime or oldest
  release year) and `percentileSubset` (takes a fraction of the front of an
  already-ordered list, e.g. "oldest 20%" or "top 10% by rating", returning
  `[]` for an empty input or non-positive fraction rather than computing
  `Math.ceil(0 * fraction)` and mishandling it — the explicit "percentage
  division by zero" edge case). Tie _resolution_ stays the caller's choice
  between `pickUniform` (extreme-defined-winner challenges — a tie among
  true winners shouldn't be weight-biased) and the existing `pickWeighted`
  (challenges that pick "randomly" among a pool with no single defined
  winner), per "Selection Weights"'s "unless the challenge explicitly
  defines a winner" carve-out.
- Built `generateChallengeFilms` (`src/domain/challenges/generate.ts`), the
  automatic ("Decide My Challenge For Me") generation algorithm: for each of
  `slotCount` slots, shuffle the eligible challenges (preferring ones not
  yet used elsewhere in this draft — "avoid duplicate challenges ... where
  possible" — falling back to reuse only once the unused pool is exhausted),
  try up to `maxAttemptsPerSlot` of them in that order, and log every
  attempt via the existing structured logger. Termination is structural, not
  best-effort: the outer loop is bounded by the fixed `slotCount`, the inner
  reroll loop is bounded by `min(maxAttemptsPerSlot, eligible.length)`, and
  the loop also breaks early the moment zero challenges are eligible for a
  slot (logged with a synthetic `__no_eligible_challenges__` marker id, since
  no real challenge is being blamed) — there is no path to an infinite loop.
  A successful film is spliced out of the shared candidate pool immediately,
  which is what makes "never produce duplicate draft films" hold even when
  two different challenges could otherwise have picked the same film.
- **Wiring this into live draft creation is explicitly out of scope for this
  phase and was not attempted.** The numbered prompt asks for the engine,
  the randomness utilities, the generation algorithm's properties (bounded,
  no duplicates, no infinite loop, structured logs), and three specific
  challenge families with dedicated tests — it does not mention updating
  `create-draft.ts`, `add_draft_films`, the drafts page, or the "CHALLENGE:
  X" display treatment from "Challenge Display". Only 3 of the spec's ~10
  challenge categories exist after this phase (age/time, runtime, ratings —
  popularity, genres, directors, country/language, collections, contextual,
  and meta are all still unbuilt), so wiring "Decide For Me" into the real
  create-draft flow now would let a Hardcore draft's challenge slots draw
  from a catalogue that's intentionally still a third finished, and there is
  still no candidate-film mapper turning DB rows into `ChallengeCandidateFilm`
  (a Phase 4 follow-on, once more of the catalogue exists). This mirrors the
  Phase 1 decision to scaffold challenge interfaces with nothing registered,
  and the Phase 4 decision to record `challenge_film_count` without
  fabricating challenge films — each phase ships a complete, fully-tested
  slice of domain logic, and wiring happens once the slice it depends on is
  ready.
- Every reason code returned by an `ineligible` result is a specific,
  greppable string (`no_films_with_known_release_year`,
  `no_oldest_quartile_films_rated_4_plus`, `no_valid_runtime_pairing_under_200`,
  etc.), matching the spec's own worked example
  (`reason=no_films_rating_gte_4` for Prestige Pick, used verbatim). No
  challenge ever invents a value for missing metadata — a challenge that
  needs `runtime`/`average_rating`/a previous draft pick and doesn't have it
  returns `ineligible` with a reason naming exactly what's missing.
- A few underspecified rules needed an explicit, documented decision:
  - **The 100 Club**'s "ordinal positions 100, 200, 300..." are 1-indexed
    from the user's perspective, but `watchlist_entries.position` is stored
    0-indexed (Phase 2's CSV-row-order convention) — implemented as
    `(position + 1) % 100 === 0`, so the 100th film in the list (stored
    position 99) is the first milestone.
  - **Decade Roulette** and **Temporal Opposite**'s "oldest eligible decade"
    branch choose a decade with `pickUniform` over the _distinct decades_
    represented, not weighted by how many films are in each — confirmed by
    a statistical test that a single-film decade gets picked about as often
    as a 20-film decade, matching "equal probability between decades".
  - **Runtime Roulette**'s "if category has no candidates, reroll" is
    implemented as an internal shuffle-and-scan over the (always exactly 4)
    runtime bands within that one challenge's own `attempt()`, not a call
    back into the outer engine's reroll/logging — the outer engine rerolls
    between _challenges_, not between a single challenge's internal
    sub-choices, so this stays a self-contained, structurally bounded loop.
  - **Double Feature Half**'s "defer until later in generation" needed no
    special deferral mechanism: its `isEligible` simply returns `false` when
    `previousPicks` is empty, so the generator naturally skips it on early
    slots and reconsiders it once later slots have grown `previousPicks` —
    the existing reroll-to-another-challenge behavior _is_ the deferral.
  - **Rating Roulette**'s half-star bands use `Math.min(Math.floor(rating *
2), 9)` to get 10 clean, non-overlapping bands covering exactly `[0,
5.0]` — without the `min(..., 9)` clamp, a perfect 5.0 rating would
    compute bucket index 10 and fall outside every band.
  - Forgotten Middle Child's "either can be selected" (even-length
    watchlist) and Decade Survivor's "ties can be resolved randomly"
    (explicit in the spec) are both implemented with weighted/uniform
    selection respectively, matching whether the tie is between specific
    films (weighted, no defined winner) or between decades (uniform, spec
    says "randomly").
- Dedicated unit tests were written for all 32 implemented challenges
  (`src/domain/challenges/families/*.test.ts`, 126 tests) covering a
  successful pick, zero eligible candidates, ties where the challenge can
  produce one, missing required metadata, and boundary values (exact
  threshold edges like rating 4.0, runtime 90/150, year 1999/2001, 30-year
  gaps, half-star band edges) for every single challenge. Combined with 14
  tests for the generation engine, 6 for the catalogue's registration
  integrity, and 11 for the two new `rng.ts` utilities, this phase added 157
  new tests (372 total, up from 215).

### Phase 6 — Popularity, genre, director and geography challenges

- Continued the same engine from Phase 5 — no second architecture. All 32
  new challenges are `ChallengeDefinition`s registered through the same
  `challengeRegistry`/`catalogue.ts` idempotent-registration pattern, and
  reuse the same `families/shared.ts` helpers (`filterByExtreme`,
  `countOccurrences`, `filmsContaining`, `groupBy`, `pickWeightedFilm`),
  extended rather than duplicated.
- Several director challenges (Finish the Job, New Blood, Old Friend, Second
  Chance) and one genre challenge (Genre Collision) need the user's watch
  history and/or their own star ratings — data Phase 5's `ChallengeContext`
  had no field for at all (`candidates`/`previousPicks` are both watchlist
  state, not watch history). Added `ChallengeWatchedFilmRecord`
  (filmId/directors/genres/userRating/watchedAt, all nullable except filmId)
  and a required `watchedFilms: ChallengeWatchedFilmRecord[]` array to
  `ChallengeContext` (types.ts) — empty, never fabricated, when a user has
  no watch history yet. This is additive to the existing context shape, not
  a parallel one; every existing context builder (test helpers, `generate.ts`
  callers) was updated to pass `watchedFilms: []`.
- **"No English Allowed" surfaced a real data-honesty question, resolved by
  adding a field rather than reusing one.** The existing `languages: string[]
| null` is TMDB's `spoken_languages` — every language spoken in the film,
  in no particular "primary" order. The spec asks for the film's
  "primary/original language" specifically. Reading `languages[0]` would
  have been exactly the "substitute unrelated metadata to force a challenge
  to work" the prompt explicitly forbids, since TMDB's array order carries
  no guarantee about which language is the original one. Added a distinct
  `primaryLanguage: string | null` field and a new `"primary_language"`
  `DataCapability`, documented as unpopulated by any current provider (TMDB
  exposes a separate `original_language` field this app doesn't map yet) —
  same situation as `watchCount`/`fansCount`/`listAppearances` since Phase 2,
  and equally honest: the challenge is correctly, permanently ineligible
  until a future phase adds that provider mapping, rather than silently
  producing a plausible-looking but unjustified answer.
- **Genre Roulette's manual-selection support** ("Choose My Challenge")
  needed a way for a challenge's `attempt()` to receive a UI-driven choice,
  which nothing in the engine had a slot for yet. Added an optional
  `manualSelections?: ChallengeManualSelections` field to `ChallengeContext`
  (currently just `{ genre?: string }`) rather than a generic untyped bag —
  concrete enough to type-check today, and any future challenge needing its
  own manual-selection input just adds a field to the same interface. Genre
  Roulette checks `context.manualSelections?.genre` first and only falls
  back to picking a random represented genre when it's absent; a manually
  chosen genre with zero matching films is reported as ineligible rather
  than silently falling back to the automatic path, so the user's explicit
  choice is never quietly overridden.
- **Double Agent's bounded reroll** enumerates every distinct pair of
  represented genres up front, shuffles them, and scans at most
  `min(10, pairCount)` pairs for the first with a matching film — the same
  self-contained, structurally-bounded-loop pattern Runtime Roulette used in
  Phase 5 for its band reroll, not a call back into the outer engine's
  challenge-level reroll (which rerolls between _challenges_, not within
  one challenge's internal sub-choices).
- **World Cup** stores the full draw in `displayValue`
  (`{ countries: string[], winner: string }`) — all four drawn countries
  plus which one survived — satisfying "store/show the four countries and
  winner in challenge metadata if practical" the same way Minute Match's
  `displayValue.targetMinutes` already worked in Phase 5. Requires at least
  4 _distinct_ represented countries to draw four without repeats; fewer
  than that is `ineligible` with reason `fewer_than_four_countries_represented`
  rather than drawing fewer than four and calling it a "World Cup".
- **Second Chance** needed the most interpretation: "a director whose
  previous film the user rated poorly and from whom they have watched
  nothing since" requires chronological ordering, which only exists where
  `watchedAt` is known. Implemented as: for each director, find their
  most-recently-watched film using only watched records with a known date
  (an unknown date can't participate in "most recent" and is excluded
  outright, never guessed); that director qualifies only if their most
  recent watch was rated `<= secondChanceMaxPoorRating` (default 2,
  configurable on `ChallengeEngineConfig` exactly like Phase 5's
  `featureLengthMinutesThreshold`). "Old Friend"'s "rated highly" threshold
  is `oldFriendMinUserRating`, default 4, same pattern.
- Every "most common X" / "least common X" / "director with the most films"
  challenge (Watchlist Infestation, Extinction Event, Dominant Species,
  Director Monopoly) breaks ties with `pickUniform` over the tied group,
  matching Phase 5's Decade Survivor precedent — a count tie has no
  "explicit winner" to protect from weight bias, but ties are still resolved
  deterministically-testably rather than by array order. Minority Report's
  "three smallest genres" goes one step further: when a count-tie sits
  exactly at the boundary of the three (e.g. four genres tied for
  2nd-smallest), `sampleWithoutReplacement` picks which of the tied group
  fill the remaining slots, so the boundary member isn't always the same
  one by insertion order.
- Provider-specific metrics (`popularity`, `watchCount`, `fansCount`,
  `listAppearances`) are each read by exactly one dedicated narrowing helper
  in `shared.ts` (`withKnownPopularity`, `withKnownWatchCount`, etc.) and
  never cross-substituted — e.g. Main Character is ineligible for a film
  with a sky-high watch count but no popularity score, verified by a
  dedicated test, per this phase's explicit instruction not to force a
  challenge to work with unrelated metadata.
- Dedicated unit tests were written for all 32 new challenges
  (`src/domain/challenges/families/{popularity,genres,directors,
country-language}.test.ts`, 115 tests) covering a successful pick, zero
  eligible candidates, missing required metadata (including the
  metric-substitution guards above), ties, and boundary values. Total unit
  tests: 487 (up from 372).

### Phase 7 — Collection, contextual, lottery and interactive challenges

This phase finishes the challenge catalogue (collections, contextual, meta —
77 challenges total across all ten categories) and adds the one genuinely
new piece of infrastructure the earlier catalogue phases didn't need: real
**persisted** state for interactive challenges.

- **Interactive challenges are pure state machines, persistence is a
  separate layer — same separation of concerns as everywhere else in this
  engine.** `src/domain/challenges/interactive/battle-royale.ts` and
  `three-doors.ts` are framework/DB-free: `beginBattleRoyale`/
  `beginThreeDoors` generate the initial state, `selectMostAnticipated`/
  `selectLeastAnticipated`/`selectDoor` are pure `(state, input) ->
{ok,state}|{ok:false,error}` transitions, fully unit-tested (40 tests)
  without touching a database. A new table,
  `draft_challenge_interactions` (migration
  `20260810001200_draft_challenge_interactions.sql`, columns: `draft_id`,
  `challenge_id`, `status`, a `state jsonb` snapshot, `updated_at`), plus a
  thin repository (`src/lib/challenges/interactive-state.ts`:
  `createInteraction`/`getLatestInteraction`/`updateInteractionState`) is
  what makes "survives a page reload" concretely true — a fresh
  `getLatestInteraction` read is a completely independent query from
  whatever created the state, exactly what a reloaded page would do.
  Followed the same RLS/GRANT pattern as every other table in this project
  (Phase 1's grants log entry): `for all` policy scoped to the owning
  draft's `user_id`, plus an explicit `grant select, insert, update`.
  Verified with 6 integration tests against the real local Supabase
  (create → independent read-back, a full transition-then-resolve sequence,
  `not_found` on a bogus id, cross-user RLS isolation, and two interactive
  challenges on the same draft staying independent) — not just unit tests
  on the pure functions.
- **This still doesn't wire into a live page.** Exactly like Phases 5/6's
  scope calls, there is no "Active Draft Page" yet for a user to actually
  click through Battle Royale or Three Doors — that page is its own future
  phase (see "ACTIVE DRAFT PAGE" in the spec). What exists now is a
  complete, tested vertical slice: pure state transitions, a persistence
  layer that round-trips them correctly, and `ChallengeDefinition.attempt()`
  wiring that returns `requires_user_choice` with the right `interactionId`
  and initial payload. A future phase's server actions call
  `beginBattleRoyale`/`selectDoor`/etc. and this repository directly; no
  redesign needed.
- **Battle Royale Underdog's user-facing title is literally "Battle
  Royale"** (`name: "Battle Royale"` on the `battle-royale-underdog`
  challenge) — the internal id is the only place the distinction lives, per
  "the user-facing title must simply be: Battle Royale... Do NOT include
  'Fake' anywhere in the visible challenge title." A test asserts `name`
  and `description` both exclude "fake" case-insensitively — literal on the
  title as specified, and applied to the description too since a twist
  explained via a forbidden word in the description would defeat the point
  just as much.
- **Palette Cleanser's distance function is its own module**
  (`src/domain/challenges/distance.ts`), not folded into the challenge
  itself, because the prompt asked for it as "a tested, reusable" utility
  in its own right. The formula (documented in full in the module's doc
  comment): release-year distance and runtime distance are each min-max
  normalized against the _actual spread present in the relevant comparison
  pool_ (computed once via `computeDistanceRanges`, not per pair, and not a
  hardcoded universal range) so a 20-year gap means something different in
  a watchlist spanning a century than one spanning a decade; genre
  dissimilarity is Jaccard distance (`1 - |intersection|/|union|`), already
  naturally on `[0,1]`. The final score is the mean of _only the components
  both films have data for_ — a film missing runtime doesn't silently
  count as "0 runtime difference" or get excluded entirely, its runtime
  component is just skipped for that comparison, per "if required metadata
  is unavailable... rather than inventing values." 16 dedicated tests cover
  each component in isolation, missing-data skipping, the zero-range
  divide-by-zero guard, and that normalization actually equalizes
  differently-scaled dimensions (a proportionally-equal gap in years vs.
  minutes scores the same after normalization, which would be wildly
  different before it).
- **The Draft Lottery and The Anti-Draft Lottery share one ticket function**
  (`src/domain/challenges/lottery.ts`, `calculateLotteryTickets`), not two
  parallel implementations — the anti-lottery's
  `calculateAntiLotteryTickets` calls it and layers penalties on top,
  matching "start from the same transparent ticket framework" literally in
  code, not just in spirit. Both expose the full per-film breakdown array
  as `displayValue.tickets` (baseline, each bonus, and — for the
  anti-lottery — each penalty and whether it was omitted), satisfying
  "store/expose the ticket calculation for debugging" directly rather than
  only exposing the final winner.
- **"Established taste" for the anti-lottery's taste-similarity penalty
  needed a concrete, documented definition the spec left open.** Defined as:
  the genre(s) most frequent among the user's own watched films rated
  `establishedTasteMinUserRating` (default 4) or higher, but _only_ once at
  least `minHighRatedWatchesForTasteSignal` (default 5) such films exist —
  below that, the penalty is omitted entirely (`tasteSimilarityPenaltyOmitted:
true`) rather than drawing a conclusion from a handful of data points, per
  "if adequate taste history is unavailable, omit that penalty rather than
  guessing." Both thresholds are configurable on `ChallengeEngineConfig`,
  same pattern as every other tunable default since Phase 5
  (`featureLengthMinutesThreshold`, `oldFriendMinUserRating`, etc.).
  Tickets are floored at 1 via `Math.max(1, rawTotal)` after every bonus and
  penalty is applied, never before.
- Two `ChallengeContext`/type extensions, both additive to the existing
  Phase 5/6 shapes: `ChallengeWatchedFilmRecord` gained `releaseYear` (for
  Decade Detox's decade comparison) and `collectionId` (for Finish What You
  Started / Gateway Drug's "started this collection?" checks) —
  straightforward additions of fields several new challenges needed that
  simply hadn't been needed before. More structurally: `ChallengeContext`
  gained an optional `manualSelections` field two phases ago for Genre
  Roulette; no new challenge in this phase needed a manual-selection input,
  so nothing changed there — mentioned only to note the mechanism was
  already in place and didn't need touching.
- Loosened `countOccurrences`/`filmsContaining` in `families/shared.ts` from
  `<T extends ChallengeCandidateFilm>` to a plain `<T>` generic — the
  function bodies never actually touched a `ChallengeCandidateFilm`-specific
  field (only whatever `valuesFn` extracts), and `lottery.ts` needed to
  reuse `countOccurrences` for `ChallengeWatchedFilmRecord` genre tallies
  (established-taste genres) without a parallel duplicate implementation.
  Backward-compatible: every existing call site with a `ChallengeCandidateFilm[]`
  still type-checks unchanged.
- Dedicated unit tests for all 13 new challenge definitions (4 collections +
  3 contextual + 6 meta, 3 of the latter interactive) —
  `src/domain/challenges/families/{collections,contextual,meta}.test.ts`,
  54 tests — plus the distance function (16), the lottery framework (23),
  and the two interactive state machines (26 combined) — 119 new unit tests
  this phase (606 total, up from 487) — and 6 new integration tests for
  interactive-state persistence (27 total, up from 21).

### Phase 8 — Complete draft generation UX

This phase is what finally connects three phases' worth of unused challenge
engine (Phases 5-7) to real draft creation — the missing piece every one of
those phases explicitly called out and deferred.

- **The missing link was a DB-row-to-domain-object mapper, and nothing
  else was structurally blocking this.** `src/lib/challenges/
candidate-mapper.ts` (`toChallengeCandidateFilm`/`toChallengeWatchedFilmRecord`)
  is the only genuinely new translation layer — everything downstream
  (the engine, the 77 challenges, the randomness utilities) already existed
  and needed zero changes to be wired up. `src/lib/challenges/
fetch-context.ts` fetches watchlist + watch-history + ratings (watch
  history and ratings are separate tables — a film can be watched without
  ever being rated — merged by film id) and hands the engine real data for
  the first time.
- **`createDraft()` now runs the engine as a second step after
  `create_draft`, not inside it.** The RPC still atomically creates the
  draft and its random `draft_items` exactly as before (Phase 4); a new
  `add_draft_challenge_items` Postgres function
  (`20260810001300_add_draft_challenge_items_function.sql`, same
  ownership/active-status checks and `on conflict do nothing`
  duplicate-film guard as `add_draft_films`) appends whatever the engine
  produces. If challenge generation only partially succeeds, the draft
  itself — with its random films intact — still exists; the shortfall
  becomes a `challengeWarning` string surfaced on `/drafts` via a query
  param and an inline banner, not a failure of the whole creation.
- **"Choose My Challenge" needed a different algorithm from "Decide For
  Me", not a mode flag on the same one.** `generateChallengeFilms` (Phase 5) rerolls to a _different_ challenge when one fails — correct for
  automatic generation, wrong for a user's explicit picks. Built
  `attemptChosenChallenges` (`src/domain/challenges/choose.ts`) instead:
  attempts each chosen challenge, in the order picked, exactly once — a
  failure leaves that slot unfilled rather than silently substituting a
  challenge the user didn't choose. It still guarantees no duplicate films:
  a success is removed from the pool immediately, and — new in this
  phase — every film _shown_ by an interactive challenge (all 8 Battle
  Royale candidates, all 3 Three Doors) is removed the moment it's
  generated, before the user has even chosen, since those films are now
  "spoken for" by that pending interaction.
- **Interactive challenges are real now, end to end, not just a domain
  state machine sitting unused.** Chosen interactively in "Choose My
  Challenge" (never selected automatically — see below), an interactive
  challenge's `attempt()` persists its initial state via `createInteraction`
  (Phase 7) and creates no `draft_items` row yet. A new
  `resolve_draft_challenge_interaction` Postgres function
  (`20260810001400_resolve_interactive_challenge_function.sql`) is the
  single atomic point where a resolving choice becomes a real draft item:
  it takes the _final_ state computed by the pure `selectLeastAnticipated`/
  `selectDoor` transition plus the winning watchlist entry, and in one
  transaction inserts the `draft_items` row and marks the interaction
  resolved — "compute the winner" and "save it" can never observe a
  reload in between. `/drafts/challenges/[interactionId]` is the resolution
  page (`BattleRoyaleFlow`/`ThreeDoorsFlow` client components,
  `chooseMostAnticipatedAction`/`chooseLeastAnticipatedAction`/
  `chooseDoorAction` server actions); every choice re-reads the interaction
  fresh from the database rather than trusting client state, so a reload
  mid-flow resumes exactly where it left off — the concrete, working
  version of the "must survive refresh" requirement Phase 7 could only
  build the storage for.
- **Automatic generation still never selects an interactive challenge on
  its own — this is an unchanged Phase 5 behavior, not a new decision.**
  `generateChallengeFilms` logs `requires_user_choice` as a non-success and
  rerolls to a different challenge, exactly like Phase 5 already did before
  Battle Royale/Three Doors existed. The numbered prompt's own structure
  confirms this split — "handle interactive challenges properly" appears
  under "Choose My Challenge", never under "Decide My Challenge For Me".
- **"Choose My Challenge"'s disabled-with-explanation list is computed,
  not hand-written.** `src/lib/challenges/list-availability.ts` checks,
  for each challenge, which of its `requiredCapabilities` have _zero_
  evidence anywhere in the user's real watchlist/watch-history, and turns
  the missing ones into a generic sentence ("Needs collection/franchise,
  watch history data, which isn't available yet.") — one mechanism serving
  disabled-reason text for all 77 challenges rather than 77 hand-written
  messages that would drift out of sync as the catalogue grows. A
  challenge with all its capabilities present but still ineligible for a
  narrower structural reason (Battle Royale needing 8 specific candidates)
  falls back to a generic "not enough eligible films right now."
- **Genre Roulette's manual genre picker is one dropdown, populated from
  the user's actual watchlist genres** (`availableGenres`, computed
  alongside the availability list), passed through
  `config.manualGenre` → `ChallengeContext.manualSelections.genre` — the
  mechanism Phase 6 built for exactly this, unused until now.
- **The CHALLENGE badge reuses the existing eye-button lesson, not a new
  one:** it's a `<span>` `TooltipTrigger` (`render`) sibling-safe inside
  the card's `<a>`, never a `<button>`, for the same "no interactive
  element nested in an anchor" reason documented since Phase 3. Base UI's
  Tooltip opens on focus as well as hover, and focus fires on tap for
  touch devices, satisfying "hover/focus/tap" without a separate
  mobile-only affordance. Generated values (Minute Match's target, World
  Cup's countries) go through a new, deliberately conservative formatter
  (`src/domain/challenges/format-display-value.ts`) that only renders
  plain scalars and short scalar arrays — the two lottery challenges stuff
  a full per-film ticket-breakdown array into `displayValue` for
  debugging, and that must never end up rendered on a film card.
- **No artificial loading delay was added, and none was needed.**
  Generation runs synchronously inside the existing server action; the
  redirect to `/drafts` happens the moment the database work finishes.
  "Visually satisfying but fast" was interpreted as "don't make it slower
  than it already is," not as a cue to add motion for its own sake.
- The hardest integration-test problem this phase was making "challenge
  rerolls" deterministic rather than probabilistic. With 77 real
  challenges, the ones needing almost no data (the watchlist-age/time
  family, both lottery challenges, "No Homework") are so abundant that a
  random shuffle over a real, unconstrained watchlist essentially never
  reaches a failing challenge before succeeding — three consecutive real
  runs against a "sparse metadata" watchlist produced zero rerolls,
  purely by chance. Fixed by engineering the eligible set's _size_, not
  hoping for a lucky draw: seeding films with no release year at all
  narrows the automatically-succeeding pool to a small, countable set
  (≈10 challenges), then requesting notably more challenge slots than
  that. Because Battle Royale/its underdog variant are "eligible" (only
  need 8 candidates) but never succeed automatically, and the engine's
  "prefer challenges not yet used" rule keeps offering them once every
  real challenge has already succeeded once, this deterministically forces
  at least one slot into a reroll — confirmed non-flaky across three
  consecutive runs, unlike the original version.
- Added 8 integration tests against the real database, covering every
  combination named in the prompt: Baby 5/0, Baby 0/5, Medium 4/6,
  Hardcore mixed, insufficient eligible films (draft still succeeds with a
  reported shortfall), challenge rerolls (above), a redundant "never
  infinite-loops" sanity check under a near-empty watchlist, and a full
  interactive Battle Royale round-trip (pending interaction → resolve →
  real draft item, with RLS confirmed via the existing test-user pattern).
  35 integration tests total, up from 27. Browser-verified end to end at
  desktop and mobile widths: difficulty → linked sliders → Choose My
  Challenge search/select/disabled-reasons → Genre Roulette's genre picker
  → generation → the pending-interaction banner and button → the full
  Battle Royale flow → the resolved CHALLENGE badges, including the
  hover tooltip revealing a challenge's description.

### Phase 9 — Active Draft and post-draft flow

- **No background worker exists anywhere in this app, so expiry is
  detected lazily, on read.** `expire_draft_if_due` (Postgres function,
  `20260810001500_expiry_postmortem_functions.sql`) transitions
  `active` → `expired` only when `deadline_at <= now()`, and `/drafts`
  calls it unconditionally on every load before rendering. Because the
  function's own `where` clause makes a call against an already-expired
  or still-active draft a safe no-op, there is no separate "is it due"
  check in application code and no risk of a duplicate transition from a
  page double-load.
- **Time progress and film progress are two independent, pure domain
  functions (`src/domain/drafts/progress.ts`), not one combined view
  model.** `calculateDraftTimeProgress` takes `now`/`startedAt`/
  `deadlineAt`/`timezone` and returns days remaining (rounded up, never
  negative), percent elapsed (clamped 0-100, with a zero-duration guard),
  `isExpired`, and `isFinalDay`. "Final day" is a _local calendar date_
  comparison (`isSameDay` after `toZonedTime` on both `now` and the
  deadline) — deliberately not a UTC comparison, since a deadline at
  23:00 UTC is already "tomorrow" in some timezones and still "today" in
  others, and the spec explicitly calls out timezone boundaries as a case
  to handle. `calculateDraftFilmProgress` is unrelated and simpler —
  watched/total/percent from plain counts. 13 unit tests cover both,
  including the exact edge cases the spec names: just-created, midway,
  final-day, expired, the exact-deadline-instant boundary, and a UTC-vs-
  America/Los_Angeles case where the two timezones disagree about
  `isFinalDay` for the identical instant.
- **Three new Postgres functions, each an atomic transaction boundary,
  mirroring the established `create_draft`/`add_draft_films` pattern
  rather than doing multi-step read-then-write from the TypeScript
  layer:** `expire_draft_if_due` (above); `archive_draft_if_resolved`,
  which archives a draft only when zero `draft_items` remain both
  incomplete and unanswered, and — for freeform only — persists a
  caller-supplied `freeform_achieved_rank` (computed in TypeScript via
  the existing `calculateFreeformRank`, never recomputed in SQL, per the
  domain-logic-stays-in-TypeScript rule this codebase has followed since
  Phase 1); and `submit_draft_postmortem_response`, which records one
  film's postmortem answer and applies that answer's side effect (weight
  bump or watchlist deactivation) in the same transaction as the insert.
- **Idempotency is a database constraint, not an application-level
  check.** `draft_postmortem_responses.unique(draft_item_id)` plus
  `on conflict (draft_item_id) do nothing` means a resubmission — whether
  a genuine retry or a user re-clicking after a slow response — physically
  cannot insert a second row. `submit_draft_postmortem_response` reports
  whether its insert actually landed (`returning id into ...`) as an
  `applied` boolean, so the very first answer for a given film always
  wins and every later call for the same film is a confirmed no-op,
  including one that names a _different_ response than the first.
  Verified by both the "second identical response is a no-op" and
  "second, contradictory response is also a no-op" integration tests.
- **Chose +1.0 as the default selection-weight increase** for "I didn't
  get time, but I wanted to!" since the spec names no exact number —
  applied against a baseline weight of 1.0 and exposed as
  `submit_draft_postmortem_response`'s `p_weight_increase` parameter
  (default, not hardcoded) so it can be tuned later without a schema
  change. Every weight change is also logged to the pre-existing
  `selection_weight_adjustments` audit table with a
  `draft_postmortem_response_id` back-reference, so a future "why is this
  film's weight higher" question has a real answer.
- **Auto-archival has two independent trigger points that both call the
  same idempotent function, rather than each re-implementing "is
  everything resolved."** Marking the last remaining film watched
  (`mark_watchlist_entry_watched`, extended this phase to call
  `archiveDraftIfResolved` after a successful watch) covers "completed
  early"; answering the last unresolved postmortem film covers the
  expired path. Both funnel into `archive_draft_if_resolved`, which is
  the single place that decides whether a draft is actually done —
  avoiding two slightly-different definitions of "resolved" drifting
  apart over time.
- **The eye button is reused directly from the watchlist page, not
  reimplemented for drafts.** `EyeButton` (`src/components/watchlist/
eye-button.tsx`) was already page-agnostic — it takes an entry id and a
  callback and calls the shared `markWatchedAction`, which already
  revalidates `/drafts` — so `DraftFilmCard` imports it as-is, rendered
  as a sibling of the card's `<a>` (never nested inside it, the same
  "interactive element can't nest in an anchor" rule the CHALLENGE badge
  tooltip already follows since Phase 8).
- **Film progress needed to feel instant; time progress didn't, so only
  one of them is a client component.** `ActiveDraftFilms` tracks a local
  set of "just watched" item ids and recomputes
  `calculateDraftFilmProgress` from it immediately on an eye-button
  click, before the server round-trip/revalidation completes — the same
  optimistic-update pattern `WatchlistGrid` has used since Phase 3. Time
  progress has nothing that changes it from a client action, so
  `DraftTimeProgress` stays a plain server-rendered component.
- **Completed films move into a collapsed `<details>` section rather
  than disappearing**, on both the active-draft view and the expired/
  postmortem view, so a user can still see what they've already watched
  without it crowding out what's left to do — the spec calls this out as
  optional, and it was implemented since it's what the reference
  Letterboxd-inspired layout is already assumed to look like.
- **Decided against a DB-level status gate requiring `status = 'expired'`
  before a postmortem response can be submitted.** The UI never exposes
  the postmortem flow before expiry, so it's already gated in practice;
  adding a rigid DB-side gate wasn't asked for and even a hypothetical
  premature call produces a safe, sensible result. Noted here as a
  deliberate scope decision, not an oversight.
- **`/drafts` now queries `status in ('active', 'expired')`, not just
  `'active'`**, so the same route can render both the live countdown view
  and the post-expiry postmortem view without a separate URL — the
  `one_active_draft_per_user` unique index only constrains `status =
'active'`, so there is normally at most one non-archived draft at a
  time; a lingering unresolved expired draft blocking new-draft creation
  indefinitely was noted as an edge case explicitly out of scope for this
  prompt, not handled.
- Added 26 new tests: 13 unit tests for the two progress functions, and
  13 integration tests against the real database — 4 for expiry
  (transitions when due, doesn't transition early, idempotent,
  RLS-blocked across users), 8 for postmortem (all three responses and
  their exact consequences, resubmission idempotency including the
  contradictory-second-answer case, archival on the last postmortem
  answer, the Freeform achieved-rank persisting correctly on archival,
  and RLS), and 1 for mark-watched's "completed early" auto-archive path.
  48 integration tests total, up from 35 before this phase. `pnpm lint`,
  `pnpm typecheck`, `pnpm test` (651 passing), and `pnpm build` all pass.
  No interactive browser click-through was possible
  this phase — this sandbox has no browser automation tool available —
  so verification instead relied on the integration suite exercising
  every real code path against a live local Supabase instance, plus
  confirming via `curl` against the dev server that `/drafts` and
  `/drafts/history` render (redirecting unauthenticated requests to
  `/login` correctly) with no server-side errors. This is a materially
  weaker check than an actual click-through and should be treated as
  such — a manual pass through the full Active Draft → expiry →
  postmortem → history flow in a real browser is still recommended
  before considering this phase fully verified end to end.

### Phase 9.5A — Audit and create the local-first data architecture

This phase does not touch a single routed page or Supabase migration from
Phases 1-9 — everything they built keeps working exactly as before. It
instead builds a complete, parallel local-first stack underneath the
existing domain layer, proves it works with its own test suite, and
explicitly stops short of cutting the live app over to it. That boundary is
deliberate, not a shortcut — see "What this phase does NOT do" below.

- **The audit's headline finding: `src/domain/**` was already 100% free of
  Supabase/auth dependencies**, confirmed by grepping the entire tree for
  `supabase/server`, `auth.getUser`, `session.user`, and equivalents —
  every hit lived in `src/app/**` (pages/actions) or `src/lib/**`
  (Supabase-backed persistence glue), never in `src/domain`. This is a
  direct payoff of the Phase 1 rule "keep core business logic
  framework-independent" and meant "REMOVE AUTH DEPENDENCY FROM DOMAIN
  LOGIC" required zero changes to the challenge engine, the 77 challenges,
  the draft/freeform/deadline/progress calculators, or the stats engine —
  the actual work was building the new repository/persistence layer
  _underneath_ that already-clean domain layer, not touching it.
- **New architecture, exactly as specified:** `src/repositories/*.ts`
  defines pure TypeScript interfaces (`ProfileRepository`,
  `FilmRepository`, `WatchlistRepository`, `DraftRepository`,
  `HistoryRepository`, `SettingsRepository`) plus domain-shaped record
  types (`records.ts`) mirroring the old Postgres tables' shapes closely
  enough that nothing downstream needed to change — every `user_id` column
  becomes an explicit `profileId` parameter instead. `src/infrastructure/
local-db/*.ts` is the only place that imports Dexie: a schema
  (`schema.ts`), a typed `FDraftLocalDatabase` (Dexie subclass), and one
  local implementation per repository interface. `src/application/**`
  holds the new application-service layer the prompt's diagram calls for
  (profiles, watchlist, drafts, import) — the thing that replaces
  `challengeEngine(indexedDb.getCurrentProfile())`-style coupling with
  `challengeEngine(profileContext)`, persistence handled elsewhere.
- **`dexie` (well-maintained, TypeScript-first, built-in versioned-
  migration API) was chosen for local storage**, with `fake-indexeddb` as a
  dev dependency so the entire local-first suite runs in the same fast,
  offline `pnpm test` run as everything else — no browser, no Docker.
  `vitest.setup.ts` now imports `fake-indexeddb/auto` globally; harmless
  for tests that never touch IndexedDB, required for the ones that do.
- **A LOCAL PROFILE is a name, a timezone, and nothing else** —
  `src/domain/profiles/profile.ts`'s `LocalProfile`: stable id, display
  name, created/last-opened timestamps, timezone, a small `settings`
  object, and a `dataVersion` stamp. `dataVersion` is deliberately a
  _different_ number from the local database's own `SCHEMA_VERSION`
  (`src/infrastructure/local-db/schema.ts`) — the schema version describes
  the object stores' shape; `dataVersion` is a per-profile record of which
  schema version that profile's data was last migrated against, so a
  future migration could in principle touch one profile without
  re-touching every profile on the install. `resolveAutoOpenProfileId`
  (`src/domain/profiles/select-active-profile.ts`) is the one-line pure
  function encoding "auto-open the only profile; with several, only
  auto-open a remembered one; otherwise show the picker" — the exact rule
  the prompt states.
- **Exactly one deliberate `localStorage` use, everything else in
  IndexedDB.** `active-profile-pointer.ts` stores a single string — which
  profile was last open — behind an `ActiveProfilePointer` interface
  (`LocalStorageActiveProfilePointer` for real use,
  `InMemoryActiveProfilePointer` for tests). Every actual dataset (films,
  watchlist entries, imports, watched history, ratings, drafts, draft
  items, postmortem responses, selection-weight adjustments, settings)
  lives in Dexie tables instead.
- **Schema versioning is one array, not scattered numbers.**
  `SCHEMA_MIGRATIONS` in `schema.ts` is the single ordered list of
  `{version, stores, upgrade?}` entries; `SCHEMA_VERSION` is derived from
  its last entry, never hardcoded separately. `applySchema()` replays every
  entry against a fresh Dexie instance in order — which is also exactly
  how Dexie expects a real schema change to be added in the future (append
  a new version with its full store map and an `upgrade` callback for any
  data transform, never edit a shipped version's entry). A synthetic
  two-version test (`schema.test.ts`) proves the _mechanism_ end to end —
  data written at v1 correctly transforms during the v1→v2 upgrade — since
  the real schema is still only at v1.
- **A real, previously-undiscovered bug caught by testing against actual
  fake-indexeddb instead of a mock: IndexedDB has no `boolean` key type.**
  A record whose indexed field holds a JS boolean (`isActive`,
  `isCompleted`) is silently excluded from that index by the spec — not an
  error, just an empty result set, which would have read as "watchlist
  is empty" bugs with no stack trace. Caught immediately by
  `create-local-repositories.test.ts` actually exercising a compound
  `[profileId+isActive]` index against real fake-indexeddb. Fixed by never
  putting a boolean in an index key — repositories index on `profileId`/
  `draftId` alone and filter the boolean in JS afterward — and documented
  inline in `schema.ts` so it isn't rediscovered the hard way again.
- **Every Postgres RPC that used to be an atomic transaction boundary got
  a direct TypeScript port** in `src/application/drafts/
local-draft-service.ts`: `createLocalDraft` (`create_draft` +
  `add_draft_challenge_items`, reusing the _exact same_
  `generateChallengeFilms`/`attemptChosenChallenges` engine calls
  unchanged — proof the Phase 1 architecture bet paid off), plus
  `expireLocalDraftIfDue`, `archiveLocalDraftIfResolved`, and
  `submitLocalPostmortemResponse` (direct ports of the three Phase 9
  functions). `markLocalFilmWatched`
  (`src/application/watchlist/local-watchlist-service.ts`) ports
  `mark_watchlist_entry_watched`. The Freeform achieved-rank calculation
  still happens exactly where Phase 9 put it — `calculateFreeformRank` in
  TypeScript, computed by the caller and passed in, never duplicated into
  a repository method.
- **Idempotency moved from a Postgres `unique` constraint to a Dexie
  `&`-prefixed unique index** — `draftPostmortemResponses: "id,
&draftItemId, draftId"` in `schema.ts` — so a resubmitted postmortem
  answer still can't physically produce two rows, the same guarantee Phase
  9 relied on, just enforced by IndexedDB instead of Postgres.
- **One honestly-documented regression: `create_draft`'s atomicity around
  `one_active_draft_per_user` is now a plain check-then-act**, not a
  transactional guarantee. Postgres could reject a concurrent duplicate
  draft insert at the unique-index level; IndexedDB doesn't have an
  equivalent "read-then-conditionally-insert" primitive spanning an
  `await` boundary without a hand-rolled `Dexie.transaction(...)`, which
  this phase didn't add. Documented inline in
  `createLocalDraft`'s/`markLocalFilmWatched`'s doc comments as a real,
  accepted gap for a single-profile, single-tab local-first app — not
  something silently swept under the rug — and a reasonable next
  hardening step rather than a Prompt 9.5A requirement.
- **A `Clock` interface (`src/domain/time/clock.ts`) replaces scattered
  `new Date()` calls** at every new local application-service call site —
  `SystemClock` for real use, `FixedClock` (with `advance()`/`set()`) for
  tests. Existing domain functions that already took `now` as an explicit
  parameter (`calculateDraftTimeProgress`, `calculateDraftDeadline`,
  `calculateWatchlistStats`) needed no changes; `Clock` is what the new
  _callers_ of those functions use instead of calling `new Date()`
  directly. A dedicated test proves rewinding the device clock after a
  draft has already expired can never un-expire it or move its persisted
  `deadlineAt` — the local-first equivalent of "never trust the client
  clock for calendar math" now that the client clock is the only clock.
- **A local CSV-only import service was built**
  (`src/application/import/local-import-service.ts`), reusing
  `parseWatchlistCsv`/`planWatchlistImport` (pure domain, unchanged)
  against local `FilmRepository`/`WatchlistRepository` instead of
  `resolveFilms`/`applyWatchlistPlan`'s Supabase clients. Deliberately
  narrower than the Supabase path: no ratings/diary/watched-history files,
  no metadata enrichment. Enrichment specifically was cut for a real
  reason, not just time — a browser-side TMDB call would mean shipping an
  API key to the client, a genuine security question this phase doesn't
  attempt to answer. An unenriched film is an already-supported, honest
  state (see "DATA PROVIDER RULE" — "NEVER invent missing data"), not a
  broken one.
- **Migration path: read-only export script + a tested pure migration
  function, no import UI** (exactly what the prompt asks for and
  explicitly defers). `scripts/export-supabase-data.ts` dumps one user's
  complete data to JSON, read-only, safe to run any time.
  `src/migration/migrate-from-supabase-export.ts` writes that JSON into
  local repositories — keeping every original Supabase id (profile,
  films, entries, drafts, items, ...) as the new local record's id
  directly, rather than generating fresh ids and remapping every foreign
  key, per "Keep IDs stable." `docs/local-first-migration.md` documents
  the manual two-step process (export, then a one-off console snippet
  calling `migrateFromSupabaseExport`) until a real Import button exists.
  `draft_challenge_attempts`/`draft_challenge_interactions` are
  deliberately excluded from the export — an append-only debug log and an
  in-progress interactive-challenge state have no meaningful way to
  "resume" across a storage-engine change; a migrated draft with a
  mid-interaction challenge slot simply comes through unfilled, a state
  the app already understands.
- **A minimal `ProfileProvider`/`ProfilePicker` were built and tested, but
  deliberately NOT wired into the app's routed layout.** "Alex / Sam / +
  Create Profile," no password/email field anywhere — verified by a
  React Testing Library test asserting exactly that. This is real,
  working, independently-testable code, not a stub — but cutting the
  live app's Supabase-authenticated layout over to it is a bigger,
  separate decision than this prompt's "establish the architecture
  safely" scope, and doing it inline here would have meant rewriting
  Phases 1-9's working login-gated app in the same breath as introducing
  brand-new, freshly-written persistence code. Kept as two separate,
  independently-revertible changes instead.
- **What this phase does NOT do, on purpose:** no existing page, server
  action, or Supabase migration was touched or removed; the routed app is
  still 100% Supabase-authenticated exactly as Phase 9 left it; interactive
  challenge (Battle Royale/Three Doors) resolution was not ported to the
  local path (the repository interface has room for it —
  `DraftChallengeInteractionRecord` and the interaction methods on
  `DraftRepository` — but `submitBattleRoyale*`/`submitThreeDoors*`'s
  local equivalents don't exist yet); Freeform's "generate another batch"
  (`add_draft_films`) has no local port yet either. All three are natural,
  bounded next steps against the architecture this phase established, not
  gaps discovered by accident.
- Added 74 new tests, entirely additive (nothing existing was modified to
  make them pass): 17 pure unit tests for the new domain pieces (Clock,
  LocalProfile, active-profile selection); 57 tests against a _real_
  `fake-indexeddb` backend (never mocked) covering repository behavior,
  cross-profile isolation (profile A structurally cannot read profile B's
  watchlist/drafts/history/settings — the property the prompt calls out
  explicitly), the schema migration mechanism, the profile application
  service (creation/switching/auto-open/deletion), the local watchlist and
  draft services (including the timezone-boundary and clock-rewind cases),
  the local import service, the Supabase-export migration function, and
  the ProfileProvider/ProfilePicker component pair. 725 unit tests total,
  up from 651. The pre-existing 48 Supabase integration tests were run
  unchanged and still pass, confirming nothing in Phases 1-9 regressed.
  `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict), `pnpm test`,
  `pnpm test:integration`, and `pnpm build` all pass. No relevant E2E
  tests exist yet (unchanged from Phase 9 — still just a wired-up, unused
  script).

### Phase 9.5B — Remove login/signup and make FDraft fully local

This is the cutover Phase 9.5A explicitly deferred: every page now runs
against local repositories, authentication is gone entirely, and the
Supabase backend has been physically removed from the repository, not
just unused.

- **Opening FDraft launches straight into the app — no route guard exists
  anywhere.** `src/proxy.ts` (the old auth-redirect middleware),
  `src/app/login/`, `src/app/signup/`, and `(app)/layout.tsx`'s
  `auth.getUser()` check are all deleted, not disabled. The new
  `(app)/layout.tsx` is three lines rendering `<AppShell>`
  (`src/components/app-shell.tsx`), a client component that decides
  between three states purely from local IndexedDB state: no profile has
  ever existed → `FirstRunScreen`; several profiles exist with none
  remembered → `ProfilePicker` (from 9.5A); otherwise → the real app,
  immediately. An `app-shell.test.tsx` proves this directly — rendering
  `<AppShell>` shows real page content with zero navigation and zero
  password/email fields anywhere in the tree.
- **`FirstRunScreen`** (`src/components/profiles/first-run-screen.tsx`) is
  the literal "Welcome to FDraft / Create your local profile to get
  started / Profile name / Create Profile" the prompt describes — reusing
  9.5A's `createProfile`/`switchToProfile` through `useProfileContext()`,
  deliberately distinct from `ProfilePicker` (which handles the
  multiple-existing-profiles case and doubles as the "clean switcher").
- **`ProfileProvider` now exposes the app's one shared `Repositories` bag**
  alongside `activeProfile`, plus `renameProfile`/`deleteProfile` — every
  page reads both from `useProfileContext()` instead of constructing its
  own repositories or touching Supabase.
- **Deleting a profile is now actually destructive, not just a pointer
  removal.** 9.5A's `ProfileService.deleteProfile` only removed the
  profile record, leaving every watchlist entry/draft/history/settings row
  orphaned forever. Added a new `DataErasureRepository` (one method,
  `eraseProfileCompletely`) with a local implementation running one Dexie
  transaction across every table the profile could own — watchlist
  entries, imports, drafts and everything a draft references (items,
  challenge attempts, interactions, postmortem responses), watched
  history, ratings, selection-weight adjustments, settings, then the
  profile itself. `ProfileService.deleteProfile` now requires this
  repository and calls it. The Settings UI (`ProfileRow`) gates the actual
  call behind a real `AlertDialog` (`src/components/ui/alert-dialog.tsx`,
  a new Base UI wrapper) — a single click opens a dialog describing
  exactly what's about to be erased; only clicking "Delete permanently"
  inside it calls the erasure. `data-erasure-repository.test.ts` and
  `settings-view.test.tsx` both prove the confirmation gate and the
  cross-profile blast radius (deleting one profile never touches
  another's data).
- **Every page that used to be a Server Component querying Supabase is
  now a Client Component reading local repositories** — the direct
  consequence of "IndexedDB only exists in the browser": watchlist,
  watchlist/random, watchlist/import, drafts (new/active/history), and
  stats. A new tiny shared hook, `useAsyncData` (`src/hooks/
use-async-data.ts`), replaced the boilerplate every one of these needed
  ("load from local repos on mount, reload after a mutation") — no
  caching/retry sophistication, because every read is a local IndexedDB
  query, not a network request.
- **Watchlist import is now genuinely local, not just "doesn't call
  enrichment."** The old Server Action always round-tripped the raw file
  to the Next.js server process before parsing it — technically fine when
  that process runs on the same machine, but a real violation of "must
  NOT upload the user's import to a remote server" the moment this app is
  ever deployed anywhere. `ImportView` (`src/app/(app)/watchlist/import/
import-view.tsx`) now reads the `File` directly in the browser and calls
  `extractLetterboxdExportZip`/`parseWatchlistCsv` — both already pure,
  portable domain code — client-side; the bytes never leave the tab.
  `importLocalWatchlistCsv` (9.5A, CSV-only) was extended this phase to
  handle a full export zip's ratings/watched/diary files too, resolving
  identities across all four files in one pass exactly like
  `run-watchlist-import.ts` did, before local import test coverage grew
  from 6 to 8 cases (full zip, and the cached-vs-awaiting metadata split).
- **The metadata queue/cache architecture from the spec's diagram, built
  for real:** `src/app/api/metadata/route.ts` is a stateless Next.js
  Route Handler — no database, no session, no persisted state — that
  proxies to whatever `FilmMetadataProvider` is configured (TMDB,
  unchanged from Phase 2) using the server-only `TMDB_API_KEY`. This is
  deliberately NOT the browser calling TMDB directly: that would ship the
  API key to every visitor's bundle. `remote-metadata-client.ts` is the
  browser-side caller, wrapping every network failure (offline, provider
  outage, non-2xx) in a `MetadataNetworkError` the queue treats as an
  expected, per-film outcome, never a crash. `local-metadata-service.ts`
  is the queue itself: `getMetadataStatusSummary` (cached/missing/old
  counts), `downloadMissingMetadata`, and `refreshOldMetadata` — all
  reading/writing only `FilmRepository`, all bounded to 4 concurrent
  lookups like Phase 2's `enrichFilms`, and all reporting a `likelyOffline`
  flag (true only when _every_ attempted lookup failed for network
  reasons — a lone success alongside other failures means the network
  demonstrably works and those are separate per-film issues, not "you're
  offline"). Nothing calls any of this automatically — no startup refresh,
  no polling — only the Settings page's two explicit buttons do.
- **Challenges and stats needed zero changes to only ever read cached
  metadata.** They already only called `FilmRepository`/local
  `fetch-context` (9.5A) — this phase didn't touch the challenge engine or
  `calculateWatchlistStats` at all, just proved it via the offline E2E
  test creating a Baby draft with zero network access.
- **Settings** (`src/app/(app)/settings/`) replaces the old Account page:
  a Profiles card (list, rename inline, switch, destructive delete) and a
  Metadata card (the counts above, the two download/refresh buttons, and
  an offline-aware "N films need metadata — connect to the internet when
  convenient" message mirroring the spec's example text exactly).
- **A genuinely useful discovery from testing this offline, not just a
  test-infrastructure footnote:** with every page now a pure Client
  Component and zero per-route server data-fetching left anywhere, `pnpm
build`'s route table changed from all-dynamic (`ƒ`) to all-static (`○`)
  except `/api/metadata` — Next prerenders every page at build time now.
  That's not incidental to the offline story: a statically-prerendered
  route's client-router cache entry is far more durable than a dynamic
  one's near-zero default `staleTime`, which is what actually makes
  revisiting an already-open page work with zero network once the app is
  loaded. The offline E2E suite (below) runs against a real production
  build (`next build && next start`), not `next dev`, specifically
  because dev mode recompiles routes on demand and doesn't reflect this.
- **Interactive challenges (Battle Royale, its Underdog variant, Three
  Doors) are not offered locally yet — a deliberate, disclosed gap, not an
  oversight.** `listLocalChallengeAvailability`
  (`src/application/challenges/`) filters `interactive: true` challenges
  out of what "Choose My Challenge" shows; "Decide My Challenge For Me"
  already never auto-selects one (unchanged Phase 5 behavior). The old
  `/drafts/challenges/[interactionId]` route and its Supabase-backed
  actions were deleted outright rather than left dead, since a local draft
  can now never produce a pending interaction to resolve. The
  `DraftRepository` interface still carries full interaction-storage
  methods (`createInteraction`/`updateInteraction`/`getLatestInteraction`/
  `getInteractionById`/`listPendingInteractions`) from 9.5A, so porting
  `resolve-interactive.ts`'s logic — itself a thin wrapper around already
  -pure `selectMostAnticipated`/`selectDoor` transitions — remains a
  bounded, well-scoped next step rather than an architectural gap.
  Freeform's "generate another batch" (`add_draft_films`), left unported
  in 9.5A, WAS ported this phase (`generateLocalFreeformBatch`) and is
  wired to the "Generate 5 more" button on the active draft page.
- **Removed, not just stopped calling:** `src/app/login/`, `src/app/
signup/`, `src/proxy.ts`, `src/components/auth/`, `src/app/(app)/
account/`, `src/app/(app)/drafts/challenges/`, `src/app/(app)/
timezone-sync.tsx` + its Server Action, and the entire pre-9.5B
  Supabase-backed orchestration layer — `src/lib/challenges/`, `src/lib/
drafts/`, `src/lib/import/`, `src/lib/watchlist/`, `src/lib/supabase/`,
  `src/lib/testing/` — along with every `.integration.test.ts` that
  exercised them, the `supabase/` directory (migrations, `config.toml`,
  the local dev stack), `vitest.integration.config.mts`/`.setup.ts` and
  the `pnpm test:integration` script, the `vitest-stubs/server-only.ts`
  shim and its `vitest.config.mts` alias, and the `next.config.ts`
  `serverActions.bodySizeLimit` override that existed only for the old
  file-upload Server Action. `@supabase/ssr` was removed from
  `package.json` entirely; `@supabase/supabase-js` was moved from a
  dependency to a devDependency, since the only thing left that imports it
  is `scripts/export-supabase-data.ts` (the 9.5A migration tool, kept —
  see below) — the running app itself never imports it. `server-only` was
  removed too: nothing left in the app runs exclusively server-side.
  Eight files that imported plain string-union types
  (`DraftDifficulty`/`DraftTimeMode`/`DraftChallengeMode`/
  `ChallengeAttemptStatus`/`FreeformRank`) from the now-deleted
  `@/lib/supabase/types` were repointed to the identical types already in
  `@/repositories`. `domain/watchlist/film-view.ts` (a Supabase-row-shaped
  `mergeFilmMetadata`) was deleted outright — its provider-neutral
  `MergedFilmMetadata` type moved into `merge-local-film-metadata.ts`,
  which already had the local-record-shaped equivalent from 9.5A, leaving
  exactly one merge implementation instead of two.
- **What's still required, documented rather than assumed:** the only
  remaining remote dependency is TMDB, reached exclusively through
  `src/app/api/metadata/route.ts` using a server-only `TMDB_API_KEY` —
  optional; unset, imports simply carry no enrichment (unchanged honest
  behavior since Phase 1). `.env.example` was rewritten to reflect this;
  the old `NEXT_PUBLIC_SUPABASE_*`/`SUPABASE_SECRET_KEY` variables are
  documented as needed only by the (kept, devDependency-only) migration
  script against an old, externally-hosted Supabase project, never by the
  running app. `scripts/export-supabase-data.ts` and `src/migration/
migrate-from-supabase-export.ts` were deliberately NOT removed — "do not
  remove a dependency if another active feature genuinely requires it"
  applies to them directly: anyone still holding data in an old,
  externally-hosted Supabase project needs exactly this path in, and nothing
  about removing this app's own backend affects a _different_, externally
  hosted one.
- **Docker.** Already true after 9.5A's repository layer existed, now
  actually load-bearing: this repository contains no `supabase/` directory
  at all anymore, so there is no local Supabase stack to start, and
  `server_setup.md` (the old Docker-based dev guide) is kept only as
  marked-obsolete historical context, pointing to `local_setup.md`. Normal
  use — `pnpm install && pnpm dev`, or `pnpm build && pnpm start` — never
  touches Docker.
- **Network failure handling was tested for real, not just reasoned
  about.** `local-metadata-service.test.ts` covers: a provider returning
  no match (not a failure), a batch where every lookup fails with a
  network error (`likelyOffline: true`, nothing written), and a mixed
  batch with one success alongside failures (`likelyOffline: false`,
  since a successful call proves the network isn't actually down). None
  of these ever touch or clear previously-cached metadata — a failed
  refresh leaves existing `FilmMetadataRecord`s exactly as they were.
- **The offline E2E suite is real, not aspirational — a genuine Next.js
  App Router lesson came out of making it pass.** A `page.goto()` always
  needs the network (it's a full document load), so a naive "warm up every
  route with `goto()`, then go offline" approach fails: each `goto()`
  starts a fresh SPA instance with an empty client-router cache, so the
  very next in-app click to a "warmed" route still needs a network fetch
  for its RSC payload. The working pattern (`e2e/offline-core.spec.ts`):
  warm up by _clicking_ through the exact journey once, in the same tab,
  while online — populating that tab's router cache for real — then
  repeat the same click-through with `context.setOffline(true)`, doing
  the actual mutations this time. `playwright.config.ts` runs against
  `next build && next start`, not `next dev`, for the static-rendering
  reason above. Four tests: first launch shows no login page, a second
  launch with one profile auto-opens with no picker, and two full offline
  journeys — import → browse → create a Baby draft → mark a film watched
  → see it reflected in Stats, and a second confirming an offline import
  reports "N awaiting download" rather than blocking.
- Added roughly 23 new test cases this phase across unit, component, and
  E2E levels — `AppShell` (3), `DataErasureRepository` (2), `SettingsView`
  (5), 4 new offline Playwright E2E tests, `local-metadata-service` (a new
  file, 8), the extended local import service (+2, full zip and
  cached-vs-awaiting-metadata cases), and `generateLocalFreeformBatch`
  (+3) — while also removing every test file tied to the deleted Supabase
  orchestration layer (`mark-watched.test.ts`, `film-view.test.ts`, and
  the whole `.integration.test.ts` suite this phase deleted alongside the
  code it tested), for a net unit-suite change from 725 to 728 passing
  tests. 4/4 Playwright E2E tests pass against a production build;
  `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict), and `pnpm build`
  are all clean. There is no more `pnpm test:integration` — the concept it
  represented (hit a real backend) no longer applies to an app with no
  backend; the local repository tests already run against real
  `fake-indexeddb`, not mocks, which is this architecture's equivalent
  integration boundary.
- **What this phase does NOT do, on purpose:** interactive challenge
  resolution has no local UI (disclosed above, well-scoped for later);
  there is still no real "Import my old Supabase account" button — the
  9.5A migration path remains a documented manual/console procedure
  (`docs/local-first-migration.md`); and no PWA/service-worker layer
  exists, so the very first load of any given route in a fresh browser
  tab still needs one network fetch for its JS — genuine offline use
  means opening the app once while online, exactly as `local_setup.md`
  now describes to end users.

### Phase 9.5C — Portable profile export, import, backup and restore

This phase is the local-first replacement for cloud-account portability:
moving a complete FDraft profile between installations/devices via a single
downloadable `.fdraft` file, with no server involved at any point.

- **Backup format.** Plain JSON, not a ZIP/container — deliberately, since
  this app has never stored any binary blob anywhere (see "Poster/image
  handling" below), so a container format would exist purely to wrap JSON
  that doesn't need wrapping. `.fdraft` is a UX-only file extension
  (`suggestBackupFilename` → `My-FDraft-Alex-2026-08-11.fdraft`); nothing
  about validating a backup ever reads the filename — `parseAndMigrateBackup`
  (`src/domain/backup/backup-migrations.ts`) works from file _contents_
  only. Every shape is a real Zod schema
  (`src/domain/backup/backup-schema.ts`), including a recursive,
  prototype-pollution-hardened `jsonValueSchema` for the handful of
  genuinely free-form fields (film metadata's `raw`/`externalIds`, a draft
  item's `challengeDisplayValue`) — verified empirically (not just
  reasoned about) that a `"__proto__"` key surviving `JSON.parse` never
  actually pollutes `Object.prototype`, and that Zod's own `z.record()`
  parsing silently drops a `"__proto__"` key while a `.refine()` is still
  needed to catch `"constructor"`/`"prototype"`, which survive Zod's
  parsing unchanged.
- **Poster/image handling — decided, not deferred.** `FilmMetadataRecord.posterUrl`
  has only ever been a remote URL string, never a stored binary blob, in
  this app's local-first storage or its old Supabase-backed storage before
  it. There is no image blob anywhere to make an export decision about — a
  backup carries the URL, and a poster reloads from the network the next
  time its card renders online, exactly like a fresh install would.
- **Version migration framework exists now, even with only v1 to migrate.**
  `BACKUP_MIGRATIONS: BackupMigrationStep[]` is an empty, typed list today
  and `CURRENT_BACKUP_FORMAT_VERSION = 1`; `runMigrationChain` is the
  generic forward-walking runner, tested synthetically with fake migration
  steps (mirroring how 9.5B's Dexie `SCHEMA_MIGRATIONS` mechanism was
  tested) so the mechanism is proven independent of there being a real v2
  yet. An unsupported newer version is rejected with the exact
  prompt-specified message ("This backup was created by a newer version of
  FDraft. Update FDraft before importing it."), never a generic parse
  error.
- **Referential integrity is a separate check from schema validation, on
  purpose.** `validateBackupReferentialIntegrity`
  (`src/domain/backup/backup-integrity.ts`) catches what Zod structurally
  cannot: every record's _shape_ can be valid while the _collection_ is
  internally inconsistent (a draft item pointing at a film id absent from
  the same backup's own `films` array). Checked for every relationship in
  the format, including the ones easy to miss — `watchlistEntry.importId`,
  `draftItem.watchedHistoryId`, `draftItem.challengeAttemptId` — and
  reports every violation found, not just the first.
- **Films/metadata are deduplicated against the existing local catalog on
  import, everything else is always given a fresh id.** Films are a shared,
  profile-agnostic catalog on one device (established in 9.5A/9.5B — see
  `DataErasureRepository` never touching them), so
  `LocalBackupRestoreRepository` matches a backup's films against what
  already exists locally by Letterboxd slug (falling back to title+year)
  and reuses the existing row rather than duplicating it. Every
  profile-owned record (watchlist entries, drafts, draft items, history,
  ratings, postmortem responses, selection-weight adjustments, ...) gets a
  brand-new id on import, in BOTH "Import as New Profile" and "Replace
  Existing Profile" modes, with every internal reference (a draft item's
  `watchlistEntryId`, a postmortem response's `draftItemId`, ...) remapped
  alongside it — never reusing the backup's original ids, since profile
  isolation on one device is enforced by `profileId` filtering within one
  shared IndexedDB database, not separate databases per profile, so a
  backup's ids could otherwise collide with an unrelated existing
  profile's rows.
- **Transactional restore, actually proven, not just structured to look
  atomic.** Both import modes run inside one `db.transaction("rw", ...)`
  spanning every table a profile owns — the same pattern
  `DataErasureRepository` already established. `replaceProfile` reuses
  `LocalDataErasureRepository` for its erase step via Dexie's documented
  nested-transaction reuse (a `db.transaction()` call from inside an
  already-open transaction on the same tables joins it rather than
  starting a second one), so erase-then-restore commits or rolls back as
  one unit. Proven with a real corrupted-backup test that can't be caught
  by schema/integrity validation — two postmortem responses pointing at
  the same draft item, which only fails at the storage layer's own
  `&draftItemId` unique index — asserting the previous profile data is
  byte-for-byte unchanged after the throw.
- **Import modes are deliberately just two, no automatic record-level
  merge.** "Import as New Profile" (recommended/default) and "Replace
  Existing Profile" (destructive, behind an explicit confirmation dialog,
  always builds and downloads a safety backup of the profile being
  overwritten before/alongside the replace) — exactly per
  docs/product-spec.md's own instruction not to build an unreliable
  automatic merge algorithm.
- **Settings → "Data & Backups".** Shows the active profile's display name,
  a "Last backup: Never / N days ago" indicator (a plain profile setting,
  `backup.lastExportedAt`, refreshed only at fetch time to satisfy the
  React "components must be pure" rule rather than calling `Date.now()`
  during render), the recommended "Export FDraft Backup" button, an
  advanced "Export Readable JSON" option (identical data, pretty-printed),
  and the full "choose file → summary → pick a mode → confirm → result"
  import flow. A quiet, non-blocking reminder line appears once a backup
  is more than 30 days old or has never been taken — no popups, no
  repeated toasts. The privacy language is deliberately plain, not
  oversold: "created on this device... not uploaded anywhere by FDraft"
  and "processed locally", never a stronger claim than that.
- **A UI gap this phase surfaced and fixed: `ProfileProvider` had no way to
  notice a profile written directly through `repositories`.** Every
  existing mutation (`createProfile`, `switchToProfile`, `renameProfile`,
  `deleteProfile`) went through `ProfileService` methods that always
  refreshed the provider's own `profiles` React state afterward — but
  `commitBackupImport`'s "Import as New Profile" path writes a profile row
  straight through `repos.backupRestore`, bypassing all of them. Without a
  fix, an imported profile existed correctly in IndexedDB but stayed
  invisible in the Profiles list and profile switcher until something
  unrelated happened to reload them (caught by the E2E lifecycle test, not
  a unit test, since unit tests exercise the repository directly rather
  than through the React context). Fixed by adding a
  `refreshProfiles(): Promise<void>` method to `ProfileContextValue`,
  called by the Settings import flow right after a successful new-profile
  import.
- **Testing.** 70 new unit/component tests this phase (backup schema: 14;
  migration framework: 15; referential integrity: 14; export service: 11;
  restore repository — new profile, replace, film dedup, cross-profile
  isolation, two independent storage-level rollback/atomicity tests: 8;
  import orchestration service: 8) plus 3 new Playwright E2E tests, for a
  net unit-suite change from 728 to 798 passing tests and an E2E suite
  change from 4 to 7 passing tests. The highest-priority scenario from the
  prompt — create profile → import a Letterboxd watchlist → create a draft
  → mark a film watched → export a backup → wipe all local data (delete
  the IndexedDB database and clear `localStorage`, then reload) → import
  the backup as a new profile → verify the watchlist, draft, and watched
  count are all exactly as they were — is `e2e/backup-restore.spec.ts`'s
  first test, driven through real browser file downloads/uploads, not
  simulated. A second E2E test drives the full "Replace Existing Profile"
  confirmation dialog and asserts the automatic safety-backup download
  fires before the replace completes. A third repeats export+import with
  the browser context fully offline (same warm-up-then-`setOffline(true)`
  technique as `offline-core.spec.ts`). Postmortem responses/challenge
  attempts/selection-weight adjustments are deliberately NOT driven
  through the browser in these E2E tests — triggering them for real
  requires a draft to actually expire, which means manipulating wall-clock
  time mid-test — but that full relational chain through export, import,
  and id-remapping is exhaustively covered against a real (fake-indexeddb)
  database in `backup-restore-repository.test.ts`, which is a deliberate,
  documented scope split rather than a gap. `pnpm format`, `pnpm lint`,
  `pnpm typecheck` (strict), and `pnpm build` are all clean.

### Phase 9.5D — PWA/offline hardening, migration cleanup and final verification

The final release-hardening phase for the local-first conversion. See
"CANONICAL ARCHITECTURE" near the top of this document for the resulting
canonical statement of what FDraft now is; this entry is the record of how
it got verified and what changed getting there.

- **PWA: real installability, not just a manifest.** `app/manifest.ts`
  (name "FDraft", `display: "standalone"`) plus three generated icon
  sizes (192, 512, and a 512 "maskable" variant with a padded safe zone)
  — all rendered from `next/og`'s `ImageResponse`, reusing the exact same
  `lucide-react` Clapperboard glyph and (an sRGB approximation of) the
  brand green already used in the app header, per this prompt's own "using
  existing project assets" instruction — no external favicon generator, no
  new artwork. `favicon`/`apple-icon` use Next's special icon file
  conventions (auto-wired into `<head>`); the three manifest icons are
  plain Route Handlers instead, specifically because the manifest's
  `icons` array needs a URL it can write down verbatim, and the special
  convention's served path includes a Next-generated cache-busting query
  string that isn't meant to be hand-predicted. All three needed `export
const dynamic = "force-static"` — without it, a plain Route Handler
  doesn't get the special icon convention's automatic build-time caching,
  and Satori would re-render the PNG on every single request, including
  every offline-precache fetch.
- **Full offline application shell via Serwist, not a hand-rolled service
  worker.** Next.js 16 ships its own official "Progressive Web Apps" guide
  recommending exactly this for full service-worker-based offline caching
  when the built-in `experimental.useOffline` isn't enough — and it isn't
  here, since that feature only covers soft navigations within an
  already-loaded tab; its own docs state plainly that "a full page reload
  while offline still fails because the browser needs the network to
  deliver the HTML... would need a service worker." A genuine "Offline
  Reload: disable network → reload → core UI still launches" requirement
  cannot be met any other way.
  - **`@serwist/next`'s default `withSerwist` (a webpack plugin) does not
    work here.** Next.js 16 defaults to Turbopack for `next build`
    itself, not just `next dev` — confirmed directly from this project's
    own build output ("▲ Next.js 16.3.0 (Turbopack)") — and a
    webpack-config-hooking plugin is simply never invoked under a
    Turbopack build. `@serwist/next` prints its own console warning
    saying exactly this and pointing at "configurator mode" as the
    Turbopack-compatible alternative.
  - **Configurator mode**, used instead: `serwist.config.mjs` (a separate,
    bundler-agnostic build step run via `@serwist/cli` — `pnpm build` is
    now `next build && serwist build serwist.config.mjs`) scans `.next`'s
    real build output, including every prerendered page's HTML, and
    bundles `src/app/sw.ts` into `public/sw.js` with a real, versioned
    precache manifest baked in via esbuild — never a fragile hand-rolled
    cache-list. `runtimeCaching: defaultCache` (from `@serwist/next/worker`)
    is that package's own recommended policy for a Next.js app —
    NetworkFirst for documents/RSC payloads (fresh when online, last-cached
    the instant it isn't), CacheFirst/StaleWhileRevalidate for hashed
    static assets — intercepting GET only, so `POST /api/metadata` passes
    through untouched and this service worker never interferes with
    `local-metadata-service.ts`'s own real-fetch-failure-based offline
    detection. `skipWaiting`/`clientsClaim` mean a fresh deploy's new
    precache manifest takes over on a returning visitor's very next load,
    not a stale cached shell stuck forever — satisfying "offline caching
    must not interfere with normal deployment updates. Use sensible cache
    versioning" directly. One addition on top of the default policy: a
    `/~offline` navigation fallback for the one case it doesn't cover — a
    route this exact device has never opened before, requested while
    offline — replacing the browser's native "no internet" error page,
    never shown for any route that's actually been visited before.
  - **`playwright.config.ts`'s `webServer` command had to change alongside
    this** — it previously ran `next build` directly, bypassing the new
    combined `pnpm build` script entirely, which produced a `public/sw.js`
    precaching a completely different build's hashed asset filenames than
    the one actually being served. The resulting service worker's
    `install` step hung indefinitely (every precache fetch 404ing, never
    resolving) — caught directly by watching a real `ServiceWorkerRegistration`
    stay stuck in `"installing"` state via Playwright, not inferred.
  - `SerwistProvider` (from `@serwist/next/react`) is wired into the root
    layout with `disable={process.env.NODE_ENV !== "production"}` (so
    `next dev` never registers a service worker referencing a
    `public/sw.js` that dev mode never builds) and, deliberately,
    `reloadOnOnline={false}` — that prop's default force-reloads the whole
    page the instant connectivity returns, which for an app with
    meaningful in-progress local state (a half-filled draft-creation
    wizard, a file mid-import) would be a genuinely bad surprise completely
    unrelated to anything the network actually did.
- **Network request audit: only one real network call exists in the entire
  client bundle.** `fetchFilmMetadataViaApi` (POST `/api/metadata`),
  itself only ever reached from the explicit "Download Missing
  Metadata"/"Refresh Old Metadata" buttons — confirmed by grep, not
  assumed, and independently re-confirmed by `e2e/metadata-reconnection.spec.ts`
  actually counting requests through a full draft-creation-and-completion
  flow. Fonts (`next/font/google`'s `Geist`/`Geist_Mono`) are self-hosted
  at build time — this was already true before this phase, but is now
  explicitly verified as compliant with "no CDN-only runtime assets" rather
  than assumed. No `next/image` usage anywhere (posters are plain `<img>`
  tags), so no `next.config.ts` remote-image allowlist is needed either.
  Nothing found that needed fixing — the local-first architecture Phases
  9.5A–9.5C already built turned out to have no accidental network
  dependencies to begin with.
- **Legacy cleanup — smaller than expected, because 9.5B already did the
  heavy lifting.** No Docker files, no `supabase/` directory, no
  `src/lib/supabase/`, no auth middleware existed to remove — a full audit
  confirmed this rather than assuming it. What was actually cleaned up:
  `server_setup.md` (the old Docker/Supabase dev guide, self-flagged
  obsolete since Phase 9.5B and now genuinely providing zero value — see
  the note left in its place in this document's Phase 9.5B entry, kept
  unedited as the historical record of that decision); three dead
  `globalIgnores` entries in `eslint.config.mjs` pointing at paths that no
  longer exist; a `.env.local` still holding live-looking local Supabase
  dev-stack values the running app has never read since Phase 9.5B;
  `README.md`, previously untouched `create-next-app` boilerplate,
  rewritten to actually describe FDraft; `package.json`'s `name` field
  (`monthly-watchlist` → `fdraft`) and the app's `<title>`/mobile-nav
  branding (`Monthly Watchlist` → `FDraft`) for consistency with the PWA
  manifest's own name. **Deliberately kept, not removed:**
  `src/migration/migrate-from-supabase-export.ts`, `scripts/export-supabase-data.ts`,
  and the `@supabase/supabase-js` devDependency they share — this is a
  small, clearly-scoped, already-documented one-off import path for
  anyone who used the old, externally-hosted pre-9.5B Supabase version and
  hasn't yet moved their data into a local profile; removing it would make
  that migration permanently impossible for those users, which is a
  materially different thing from "a large dead system kept just in case."
- **User-facing wording audit: nothing to fix.** A dedicated audit of
  every screen, toast, and heading for account/auth/cloud language found
  zero misleading instances — every place that could plausibly read as a
  login flow already explicitly disclaims it (`first-run-screen.tsx`:
  "no account, no sign-in"), and backup/profile terminology is already
  consistent throughout (`Profile`, `Export FDraft Backup`, `Import
Backup`, `Switch Profile`). The one inconsistency found was branding,
  not wording — see "Legacy cleanup" above.
- **Settings: data safety made explicit and discoverable.** The "Data &
  Backups" card now opens with a plain-language explanation — "FDraft
  stores your data on this device. Export a backup if you want to move
  your profile to another device, or to protect it from browser or
  site-data deletion" — directly in the card description, not buried in a
  footnote, per this prompt's "useful rather than frightening" framing.
- **Persistent browser storage, requested respectfully.** `navigator.storage.persist()`
  is called at most once, ever, per browser (a `localStorage` flag — the
  second deliberate use of it in the app, alongside `ActiveProfilePointer`)
  and only once a real profile is active, never on the bare first-run
  screen — see `PersistentStorageRequester`. Skips the call entirely if
  storage is already persisted, and swallows rather than surfaces any
  failure from an unsupported or restrictive browser. Backups remain the
  canonical safety mechanism regardless of whether persistence was granted
  — this is a best-effort improvement layered on top, never a replacement.
- **Final test matrix — the genuine gaps, not the parts already covered.**
  Profile isolation, backup portability, and destructive restore were
  already thoroughly covered by Phases 9.5B/9.5C's own test suites; this
  phase's new coverage targeted what wasn't yet proven:
  - **Offline Reload** (`pwa-offline-shell.spec.ts`, 3 tests) — a real
    `context.setOffline(true)` + `page.reload()`, proven to render the
    real page (not the offline fallback) for any previously-visited route,
    which is only possible now that the service worker exists.
  - **Offline Postmortem** (`offline-postmortem.spec.ts`) — the one flow
    this document's own Phase 9.5C entry explicitly deferred to unit tests
    because it "requires manipulating wall-clock time." Solved here with
    Playwright's `page.clock.setFixedTime()`, which fakes the _browser's_
    `Date` — the same one `SystemClock`/`expireLocalDraftIfDue` actually
    reads at runtime — fast-forwarded 31 days, combined with real
    `context.setOffline(true)`, driving a real expiry → postmortem → auto-archive
    cycle end-to-end.
  - **Metadata Reconnection** (`metadata-reconnection.spec.ts`) —
    `/api/metadata` intercepted via `page.route()` (this repo correctly
    has no real `TMDB_API_KEY` for tests to depend on) with a counter,
    proving enrichment fires exactly once per film on explicit request and
    never again during subsequent draft creation, marking watched, or
    viewing stats — the actual request count, not just code inspection.
  - **Corrupt Backup** (2 new tests in `backup-restore.spec.ts`) — a
    genuinely malformed file and a well-formed-but-wrong-format file, both
    driven through the real file-picker UI (not just the underlying
    parser directly, which Phase 9.5C's unit tests already covered),
    asserting a specific, useful error and zero impact on existing data.
  - **Application Refresh** (`application-refresh.spec.ts`, 5 tests) —
    watchlist, an active draft's watched-progress, a partially-answered
    postmortem, and Settings all proven to survive a hard refresh. Two
    honest, deliberately-investigated exceptions, neither a regression:
    the multi-step "new draft" wizard holds its in-progress selections in
    ordinary `useState` with no persistence before final submit (confirmed
    by reading `new-draft-form.tsx` directly — a refresh mid-wizard
    resets cleanly to an unstarted wizard, which the test asserts, rather
    than restoring or corrupting anything); and "interactive challenge"
    (Battle Royale/Three Doors) has no live local UI to test refresh
    survival _of_ at all — already disclosed as a deliberate gap in this
    document's own Phase 9.5B entry, re-confirmed here by tracing
    `DraftChallengeInteractionRecord`'s repository methods to their one
    production caller and finding `listLocalChallengeAvailability`
    explicitly filters `interactive: true` challenges out of what's ever
    offered.
  - A refresh-survival investigation also surfaced (and fixed) a genuine
    bug in `ProfileProvider`: importing a backup as a new profile writes
    directly through `repositories.backupRestore`, bypassing every
    `ProfileService` method that normally refreshes the provider's own
    React state afterward — the imported profile existed correctly in
    IndexedDB but stayed invisible in the Profiles list and switcher until
    something unrelated happened to reload them. Fixed with a new
    `refreshProfiles()` method on `ProfileContextValue`, called by the
    Settings import flow right after a successful new-profile import; this
    was Phase 9.5C's regression, caught and closed in 9.5D.
  - Manual browser console inspection (network failures, service worker
    errors, IndexedDB errors, React warnings, uncaught promise rejections)
    across a full import → draft → watch → stats → offline-reload
    → back-online sweep found exactly one category of console noise: four
    failed `?_rsc=...` prefetch requests for nav-bar links whose prefetch
    happened to be in-flight right as the browser context went offline —
    Next's own router-prefetch mechanism (already documented as expected
    behavior in `offline-core.spec.ts`'s own comments from Phase 9.5B),
    not a functional problem; nothing else logged anything at all.
- **Testing.** 12 new Playwright E2E tests this phase (3 PWA offline-shell,
  1 offline postmortem, 5 application refresh, 1 metadata reconnection, 2
  corrupt-backup-via-file-picker), plus 5 new unit tests
  (`PersistentStorageRequester`), for a net unit-suite change from 798 to
  803 passing tests and an E2E suite change from 7 to 19 passing tests.
  `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict), `pnpm test`,
  `pnpm test:e2e`, and `pnpm build` (now `next build && serwist build`,
  producing a real `public/sw.js`) are all clean.
- **New dependencies**: `serwist`, `@serwist/next` (runtime —
  `dependencies`, since `SerwistProvider` and `sw.ts` both ship as real
  client/worker code, not build tooling), `@serwist/cli`, `esbuild`
  (build-only — `devDependencies`).
- **What this phase does NOT do, on purpose:** it does not build any form
  of cloud sync — see the new "Optional cloud sync between devices" entry
  in `docs/updates/major-updates.md`, deliberately NOT promoted into this
  specification; it does not persist the in-progress draft-creation wizard
  across a refresh (a disclosed, low-severity characteristic, not fixed
  this phase — see "Final test matrix" above); and it does not build any
  local UI for interactive challenges (Battle Royale/Three Doors), which
  remains exactly the Phase 9.5B-disclosed gap it always was.

### Phase 9.5E — Watched film undo

Adds a session-scoped "undo" to marking a film watched — see the new
"WATCHED FILM UNDO" section above for the canonical rule this phase
implements. Previously, clicking the watched control marked the film
watched and immediately hid or moved its card with no way back short of
re-importing.

- **Session-only undo state, kept entirely out of the local database.**
  `WatchUndoProvider` (`src/components/watch-undo/watch-undo-provider.tsx`)
  is a plain React context holding an in-memory
  `Map<watchlistEntryId, WatchSessionUndoRecord>` — no field on any
  persisted record tracks "can this still be undone." It's mounted in
  `AppShell` ABOVE the routed page (`{children}`), keyed by
  `activeProfile.id`, so: switching profiles starts a clean map; navigating
  between FDraft pages preserves it (the provider itself never unmounts on
  a route change, only the page below it does); and a hard reload drops it
  along with the rest of the JS heap — the entire mechanism behind "the
  undo opportunity lasts until the application reloads," with no timer, no
  expiry timestamp, nothing to clean up.
- **`markLocalFilmWatched` extended additively.** Its success outcome now
  also reports `watchedHistoryId`, `draftId`, and
  `draftArchivedByThisAction` (whether this exact call is what just
  archived the draft, from `archiveLocalDraftIfResolved`'s own return
  value) — everything a `WatchSessionUndoRecord` needs to reverse this
  specific call later. The function's existing behavior and signature are
  unchanged.
- **New `undoLocalFilmWatched`, the other half.** Reactivates the
  watchlist entry (only when it's inactive for reason `"watched"` — never
  blindly), reverts the matching draft item to incomplete (only when that
  item's `watchedHistoryId` still matches the one recorded — proving it's
  the same completion, not a later, different one), reverts the draft back
  to `"active"` (clearing `completedAt`/`freeformAchievedRank`) only when
  `draftArchivedByThisAction` was true AND the draft is currently
  `"archived"`, and deletes exactly the named watched-history record via a
  new `HistoryRepository.deleteWatchedHistory(id)` — the one deliberate,
  narrowly-scoped exception to "watched history is append-only," used only
  to reverse a same-session action, never to edit or clean up older,
  legitimate history.
- **`WatchToggle` replaces `EyeButton`.** One control, two faces, chosen by
  whether `useWatchUndo()` has a live record for that watchlist entry: the
  plain eye (marks watched) or "Undo" (reverses it). Used by `FilmCard`
  (Watchlist grid, Random Film picker) and `DraftFilmCard` (Active Draft
  page) alike. A watched-this-session card stays mounted exactly where it
  was — faded poster/text, a "Watched" label — instead of disappearing;
  on the Active Draft page specifically, a still-undoable completed film
  stays in the main film grid rather than jumping into the collapsed
  "Completed" section the way an already-completed-from-an-earlier-session
  film does.
  - "Keep it visible after navigating away and back" needed one addition
    per page. The Watchlist page's normal query
    (`listActiveEntries`) correctly stops returning a film the moment it's
    marked watched — so `WatchlistView` also fetches any watchlist entry
    named by `useWatchUndo().listPendingEntryIds()` that query missed, and
    renders it as a normal "ghost" card (still faded/undoable). The Active
    Draft page's normal query (`getActiveOrExpiredDraft`) correctly
    excludes archived drafts — so `drafts/page.tsx` falls back to
    `useWatchUndo().getPendingArchivedDraftId()` when that comes back
    empty, fetching that specific draft directly so completing its last
    film, navigating away, and coming back still shows it (and lets the
    user undo the completion) instead of "No active draft."
- **`useAsyncData` gained `reloadSilently()`** — re-runs the same loader
  but never flips `isLoading`, so a page gating its render on that (every
  page in this app does) doesn't blank for a frame on every single
  mark-watched/undo click the way calling the existing `reload()` would.
  The Active Draft page calls it from a `useEffect` keyed on the
  `useWatchUndo()` context value itself, not an inline callback fired
  right after `registerWatched`/`clearUndo` — an inline call there races
  ahead of React's own state commit and still sees the pre-update map (a
  real bug caught by the E2E suite before it shipped, not just reasoned
  about); an effect only re-runs once React has actually committed the new
  context value.
- **Testing.** 12 new unit tests (7 for `undoLocalFilmWatched`'s reversal
  semantics — including "never removes an older, unrelated watched-history
  record" and "does not revert a draft item completed by a different
  action" — and 5 for `WatchUndoProvider`'s register/clear/list behavior),
  plus 3 new Playwright E2E tests
  (`e2e/watch-undo.spec.ts`): fade-and-undo-reverses-it on the Watchlist
  page; the undo opportunity surviving a page navigation but not a hard
  reload; and completing a Baby draft's last film, navigating away and
  back to confirm the archived draft is still reachable, then undoing that
  exact completion and confirming the draft is genuinely active again
  after a refresh. `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict),
  `pnpm test`, and `pnpm test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** no countdown timer or
  toast-with-a-deadline — the undo window is exactly "until reload," full
  stop; no cross-session undo (a reload is a hard, deliberate boundary,
  not a bug); and no change to the append-only rule for any watched-history
  record other than the one a same-session undo is explicitly reversing.

### Phase 9.5F — Watchlist sort/filter control

Adds the "Sort & Filter" control described in "WATCHLIST SORT / FILTER
CONTROL" above. Previously the Watchlist page had no way to reorder or
narrow its poster grid at all — always whatever order the local database
happened to return.

- **New pure domain module, `src/domain/watchlist/sort-filter.ts`.**
  `sortWatchlistFilms` handles all 11 sort options; `compareNullsLast` is
  the one function every metadata-dependent sort (runtime, rating, release
  year) routes through, so "unknown values group at the end regardless of
  direction" is implemented exactly once, not re-derived per field.
  `filterWatchlistFilms` handles genre/decade/runtime-range/metadata
  availability, AND-combined; `collectAvailableGenres`/
  `collectAvailableDecades` compute each filter's option list from the
  watchlist actually on screen, never a hardcoded list. All pure, and unit
  tested directly — including the specific "never NaN, never crashes"
  cases the prompt called out (an entirely-unknown-runtime watchlist still
  sorts to a stable, defined order).
- **Shuffle without ever persisting a result.** `sortWatchlistFilms("shuffle", rng)`
  reuses the existing `shuffle()` Fisher-Yates helper from
  `src/domain/shared/rng.ts` (previously only used by the challenge
  engine) — it takes an `Rng`, not a seed, so the CALLER controls when a
  fresh shuffle happens. `WatchlistView` tracks a `shuffleNonce` bumped
  every time "Shuffle" is (re-)chosen, and only recreates the `Rng` (via
  `useMemo`) when that changes — so the resulting order is stable across
  unrelated re-renders (marking a film watched elsewhere, an unrelated
  context update) but genuinely fresh every time the user deliberately
  asks for one, including re-picking "Shuffle" while it's already active.
- **Sort persistence via `SettingsRepository`, not a new `LocalProfile`
  field.** `getWatchlistSortPreference`/`setWatchlistSortPreference`
  (`src/application/watchlist/watchlist-sort-preference.ts`) read/write the
  `"watchlist.sort"` key — the same small-profile-scoped-preference
  mechanism `export-backup.ts` already uses for "last backup exported at."
  Only the MODE string is ever persisted (`"shuffle"` included) — never a
  resulting order. A stale/corrupted stored value falls back to the
  default rather than crashing.
- **New `Popover` UI primitive** (`src/components/ui/popover.tsx`), not
  `DropdownMenu` — a `Menu` closes on every item selection, which is right
  for a one-shot action but wrong for a control where someone is likely to
  adjust several filters in the same sitting; Base UI's `Popover` doesn't
  auto-close on internal interaction the way `Menu` does. `SortFilterControl`
  is a controlled view — every choice reports upward via
  `onSortChange`/`onFiltersChange` — so `WatchlistView` stays the one place
  that persists the sort and recomputes the visible list.
- **`WatchlistFilmCardView` gained `dateAdded`, `runtimeMinutes`, and
  `hasMetadata`** (both call sites — the main grid and the Random Film
  picker, which shares the same card type — updated to populate them).
  `hasMetadata` is true when ANY of posterUrl/genres/averageRating/
  runtimeMinutes came back from a provider — the "Metadata available/missing"
  filter's key.
- **A third empty state.** `WatchlistGrid` already distinguished "never
  imported" from "imported, and everything's watched" — filtering down to
  zero results needed its own distinct "No films match your filters" state
  with a one-click Reset, so it's never confused with either of those (a
  real gap caught by walking through the "Metadata: Available" filter with
  no metadata downloaded yet, which would otherwise have falsely read as
  "you've watched everything").
- **The watchlist's header film count is genuinely live**, computed at
  render time from the current session-undo context rather than the
  (deliberately non-reactive) initial fetch — the same reasoning Phase
  9.5E already established for not calling a hard `reload()` on every
  watch/undo click, applied here so the count doesn't lag behind the
  fade/undo treatment it sits right next to.
- **Testing.** 34 new unit tests (`sort-filter.test.ts`,
  `watchlist-sort-preference.test.ts`) plus 6 new Playwright E2E tests
  (`e2e/watchlist-sort-filter.spec.ts`): the default order, choosing a sort
  and seeing the grid genuinely reorder with a visible active-indicator,
  Reset restoring the default, the choice surviving a real reload, Shuffle
  producing more than one distinct order across repeated invocations
  (including after a reload, proving nothing "froze" a result), the
  distinct empty state when a filter matches nothing, and the Genre filter
  correctly disabling itself when the watchlist has no genre metadata yet.
  `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict), `pnpm test`, and
  `pnpm test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** no saved/named filter
  presets, no multi-select filters (one genre/decade/runtime-range at a
  time, not a boolean query builder), and filters themselves are not
  persisted across a reload — only the sort is (see "WATCHLIST SORT /
  FILTER CONTROL" above for why that split is deliberate).

### Phase 9.5G — Sorting for finalised/historical drafts

Adds the sort control described in "SORTING FOR FINALISED / HISTORICAL
DRAFTS" above to the Draft History page. Previously each archived draft's
film list only ever rendered in whatever order `listItemsForDraft`
happened to return (`orderIndex` ascending, incidentally — never
guaranteed by anything the page itself enforced).

- **Extracted `compareNullsLast` into a new shared home,
  `src/domain/shared/sort.ts`**, taking the ascending comparator as a
  parameter instead of being hardcoded to numeric subtraction — the exact
  same "missing metadata always sorts to the end, regardless of
  direction" rule Phase 9.5F built for the Watchlist now also drives
  historical drafts' Release Year/Runtime/Rating/Watched Date sorts
  (`Watched Date` needed a _string_ comparator, which is why the
  parameterized version replaced `sort-filter.ts`'s original
  number-only one rather than duplicating similar logic a second time).
- **New pure domain module, `src/domain/drafts/history-sort.ts`.**
  `sortHistoricalDraftItems` handles all 8 listed options; `"original_order"`
  — the required default — is simply `orderIndex` ascending, which is
  exactly the position the draft was actually generated into, always
  intact and recoverable underneath whatever sort happens to be showing.
  `"watched_status"` and `"source"` group by a boolean condition (watched
  first; challenge picks first) while relying on `Array.prototype.sort`'s
  stability to keep each group's own relative order exactly as generated,
  rather than needing an explicit secondary sort key.
- **Structurally presentation-only, not just by convention.** The Draft
  History page's loader fetches each draft's items once, and
  `sortHistoricalDraftItems` (like every other sort function in this
  codebase) returns a new array, never mutating its input — nothing in
  the render path ever calls `DraftRepository.updateItem` for a
  cosmetic reorder, so there is no code path through which choosing a
  sort here could touch the stored `orderIndex` at all.
- **"Watched Date" resolves through `WatchedHistoryRecord`, the only way
  to get it.** A `DraftItemRecord` only stores the id of the
  watched-history entry its completion created
  (`watchedHistoryId`), not a date — the loader fetches the whole
  profile's watched history once (one indexed query, reused across every
  draft on the page) and looks each item's date up by that id, `null` for
  an item never watched ("where applicable").
- **New, smaller `HistoricalDraftSortControl`** — the same `Popover` +
  radiogroup pattern as the Watchlist's `SortFilterControl`, without the
  filter section (a finalised draft's small, fixed film list doesn't need
  narrowing). Sort state is local to each draft's own collapsible entry,
  always starts at the required default, and is deliberately NOT
  persisted (unlike the Watchlist's remembered sort) — there's no
  "SORT PERSISTENCE" requirement for this control, and resetting on every
  page load is what makes "Original Draft Order" a genuinely reliable
  default to fall back on, not one a stale preference could quietly
  override.
- **Testing.** 18 new unit tests (`history-sort.test.ts`,
  `sort.test.ts` for the extracted shared comparator) plus 1 new Playwright
  E2E test (`e2e/historical-draft-sort.spec.ts`) that builds one real
  archived draft (two films watched, three resolved via forced-expiry
  postmortem) and drives the control end to end: the default really is
  Original Draft Order, "Title" produces a genuinely alphabetized order,
  "Watched / Unwatched" correctly groups the two films actually marked
  watched away from the three that weren't, switching back to "Original
  Draft Order" restores the exact original sequence, and a real page
  reload confirms that sequence was never actually altered in storage.
  `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict), `pnpm test`, and
  `pnpm test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** no filters (only the
  Watchlist's control has those — see "WATCHLIST SORT / FILTER CONTROL"
  for why a historical draft's list doesn't need them), and no persistence
  of the chosen sort — every finalised draft's list always opens in
  Original Draft Order.

### Phase 9.5H — Default start page setting

Adds the "Default page" control described in "DEFAULT START PAGE SETTING"
above. Previously "/" always did a hardcoded server `redirect("/watchlist")`
— no setting, no per-profile behavior.

- **`ProfileSettings` gained `defaultPage`, on the profile record itself —
  not the generic `SettingsRepository` key-value store** Phase 9.5F/9.5G
  used for the sort preferences. Deliberate: the prompt's own wording
  ("Persist this in the local profile," "Default-page preference belongs
  to the profile") tracks `profile.ts`'s existing `ProfileSettings`
  framing (`reducedMotion` already lives there as a small, structural,
  per-profile preference) rather than the "arbitrary, doesn't belong on
  the core record" framing `SettingsRepository`'s own doc comment uses for
  the sort preferences. New pure domain module,
  `src/domain/profiles/default-page.ts`: the `DefaultPage` type, its 4
  options, `defaultPagePath()` (the one place a page's route can change
  without touching more than this file), and `resolveDefaultPage()` — the
  ONLY sanctioned way to read this setting anywhere, which is what makes
  "missing or invalid -> Watchlist" hold even for a profile record created
  before this phase ever existed, no data migration required.
- **`ProfileService.updateSettings()` and `ProfileContextValue.updateProfileSettings()`
  are genuinely new** — there was no existing way to change ANY
  `ProfileSettings` field before this phase (`reducedMotion` had been a
  typed field with no UI or update path behind it since it was added).
  Both merge a partial update rather than replacing `settings` wholesale,
  so this setting's addition can't accidentally reset `reducedMotion` or
  vice versa for whatever's added next.
- **Backward-compatible backup schema.** `profileSettingsSchema` gained
  `defaultPage` as `.optional()`, not required — a backup exported before
  this phase has no such key at all and must still validate; restoring one
  runs the recovered value through `resolveDefaultPage()` before writing
  it into the restored profile, the same normalization every other reader
  uses, rather than restoring a literal `undefined` into a field the rest
  of the app assumes is always a real `DefaultPage`.
- **Root routing moved into the `(app)` route group.** `src/app/page.tsx`
  (previously a plain Server Component doing `redirect("/watchlist")`, a
  sibling of `(app)/layout.tsx` rather than a child of it) became
  `src/app/(app)/page.tsx` — route groups add no URL segment, so this is
  still exactly "/", but now rendered underneath `AppShell`/
  `ProfileProvider` the way every other real page already is. That's what
  makes it possible to read the active profile's setting at all: it lives
  in IndexedDB, browser-only, so there's no server-side profile a plain
  Server Component redirect could ever have read regardless. The new
  `RootPage` is a client component that reads `activeProfile.settings.defaultPage`
  and calls `router.replace(defaultPagePath(...))` — `AppShellContent`
  only ever renders it once `activeProfile` is a real, resolved profile
  (the loading/first-run/picker states are their own earlier branches), so
  this never has to guard against a still-resolving or absent profile in
  practice.
- **"Do not interfere with direct links" falls out structurally, not from
  an added check.** This phase touches exactly one route (`/`, i.e.
  `(app)/page.tsx`) — every other page's own route file is untouched, so a
  direct link/bookmark to `/drafts/history` renders that page directly and
  never passes through the root-routing logic at all.
- **Testing.** 10 new unit tests (`default-page.test.ts` for the domain
  module's guard/fallback/path-mapping logic, 3 new `ProfileService` tests
  for `updateSettings`) plus 2 new Playwright E2E tests
  (`e2e/default-page.spec.ts`): a fresh profile's "/" opens Watchlist and
  the Settings select shows it as selected; changing it to Drafts redirects
  "/" to Drafts, survives a reload, and a direct link to
  `/drafts/history` still opens History regardless; and two profiles
  (Alex -> Drafts, Sam -> Stats) each keep their own setting across
  switching between them. `pnpm format`, `pnpm lint`, `pnpm typecheck`
  (strict), `pnpm test`, and `pnpm test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** no device-wide/global
  default (it's per-profile, deliberately, per "MULTIPLE LOCAL PROFILES"),
  and no change to any route other than "/" itself.

### Phase 9.5I — History page redesign

Splits the History page into the two sections described in "HISTORY PAGE
REDESIGN" above. Previously it was "Previous Drafts" alone, with no way to
see what you've actually watched recently without opening a draft.

- **New application module, `src/application/history/recently-watched.ts`.**
  `listRecentlyWatchedFilms` is built entirely from
  `WatchedHistoryRecord`/`FilmRecord`/`FilmMetadataRecord` — its
  dependency type doesn't even ACCEPT a `WatchlistRepository`, so
  "HISTORY DATA INTEGRITY" ("do not infer historical state from the
  current watchlist") is a compile-time guarantee here, not a rule to
  remember. Orders by `createdAt` (the watched-history record's real
  timestamp), never `watchedDate` (a plain calendar-day string that can't
  break same-day ties) — proven directly by a unit test seeding two
  same-day watches at different times. "Optional challenge/draft origin"
  is resolved via the existing `findItemsByWatchlistEntryId` (already used
  by `markLocalFilmWatched`) matched against the exact `watchedHistoryId`,
  never just "any item referencing this watchlist entry."
- **`formatReadableDate` in `src/lib/utils.ts`** — a small shared
  formatter (`"long"` by default — "9 August 2026"; `"medium"` reproduces
  the Draft History page's existing date-range style exactly) alongside
  `cn()`, replacing that page's own local `formatDate` helper. Uses the
  browser's own locale/timezone via `toLocaleDateString(undefined, ...)`,
  the same convention every other date display in this app already uses
  (e.g. `additions-card.tsx`) — not a new, stricter one.
- **"Historical draft films" now always groups by Watched/Not Watched**,
  reconciling this phase's mandatory grouping with Phase 9.5G's sort
  control rather than replacing it: `HistoricalDraftEntry` still calls
  `sortHistoricalDraftItems` exactly once, on the full item list, and THEN
  partitions the already-sorted result into the two groups — since none of
  that function's comparators compare across group membership, this
  produces the identical per-group order as sorting each subset
  independently would, with far less code. Each watched film shows its
  watched date (via the same `watchedDateById` lookup the sort control
  already needed for its own "Watched Date" option); each unwatched film
  keeps showing its postmortem reason where one exists, exactly as before.
- **Testing.** 7 new unit tests (`recently-watched.test.ts` — including
  the createdAt-vs-watchedDate ordering proof and an explicit "mutating
  the watchlist entry afterward changes nothing about the reported
  result" integrity test) plus 3 new/updated Playwright E2E tests: two new
  (`e2e/recently-watched.spec.ts` — the empty state, most-recent-first
  ordering with a real readable date, and the draft-origin annotation) and
  one existing sort test (`e2e/historical-draft-sort.spec.ts`) rewritten
  to assert within each of the new Watched/Not Watched groups instead of
  one flat list. `pnpm format`, `pnpm lint`, `pnpm typecheck` (strict),
  `pnpm test`, and `pnpm test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** "Recently Watched" is
  profile-wide, not per-draft — it deliberately is not filtered to only
  draft-completed watches, since the prompt's own example includes an
  optional (not mandatory) draft-origin annotation, implying films watched
  directly from the Watchlist belong here too.

### Phase 9.5J — Calendar Mode time-progress bugfix and progress bar visual polish

Fixes the reported bug: a Calendar Mode draft created partway through the
month (e.g. 11 August, deadline 31 August) read "0% elapsed" — see "DRAFT
TIME MODE", "Calendar Mode Progress" above for the corrected canonical
behaviour.

- **`calculateDraftTimeProgress` (`src/domain/drafts/progress.ts`) now
  takes a `mode: DraftTimeMode` parameter** and derives its own progress
  window's start instant from it, rather than always using the draft's
  `startedAt`: Timer Mode keeps the original creation-to-deadline window
  unchanged (0% is the exact creation timestamp); Calendar Mode instead
  computes the start of the deadline's own calendar month, in the draft's
  stored timezone (`startOfMonth(toZonedTime(deadlineAt, timezone))`,
  converted back with `fromZonedTime` — the same zoned-date round-trip
  `calculateDraftDeadline` already uses), and measures elapsed time from
  there. `daysRemaining`/`isExpired`/`isFinalDay` are unaffected by this
  change — they were always measured from `now` to the deadline, never
  from the draft's creation instant, so nothing about deadline/expiry
  behaviour changes here, only the elapsed-percentage reading. A new
  `percentRemaining` field (`100 - percentElapsed`) is returned alongside
  the existing fields, since callers wanted it directly rather than
  deriving it themselves.
- **Progress bar visual polish (`src/components/ui/progress.tsx`).** The
  shared `Progress` primitive's track grew from `h-1` to `h-2` and gained a
  subtle `border-border/60` ring for definition against the page
  background; the indicator switched from the generic `bg-primary` to the
  more semantically correct `bg-watchlist-blue` (the same "primary
  interactive" accent `distribution-bars.tsx` already uses for data
  fills, identical color today but the intentionally correct token) and
  now transitions its width over 500ms rather than snapping instantly.
  This is the shared component behind all three of the app's progress
  bars — Active Draft's "Days" and "Films" bars, and the Settings
  metadata-download bar — so all three get more visible contrast
  consistently, per the prompt's own plural "the existing progress bars
  are extremely subtle... improve them." Readable percentage text was
  already present alongside each bar (e.g. "21 days left · 34% elapsed")
  and needed no further change.
- **Testing.** `calculateDraftTimeProgress`'s existing test suite was
  split into `describe` blocks per mode (all pre-existing cases now pass
  `mode: "timer"`, since they test that mode's exact semantics) plus a new
  `describe("... — calendar mode")` block: the exact partway-through-the-
  month regression from the bug report, August 1st/11th/31st reference
  points from the prompt's own examples, a proof that elapsed percentage
  depends only on the calendar month and `now` (not on when the draft was
  actually created), a timezone-awareness case (the same UTC instant
  yields different elapsed percentages under a different profile
  timezone, since "the calendar month" is evaluated locally), and a check
  that `daysRemaining`/`isExpired` are untouched by the mode change. Two
  new Playwright E2E tests
  (`e2e/calendar-draft-progress.spec.ts`) reproduce the bug end-to-end
  with a fixed clock (Calendar Mode created 11 August must not read "0%
  elapsed") and confirm Timer Mode's unchanged behaviour (a freshly
  created Timer Mode draft still reads exactly "0% elapsed" regardless of
  the calendar day). `pnpm format`, `pnpm lint`, `pnpm typecheck`
  (strict), `pnpm test`, and `pnpm test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** does not touch Calendar
  Mode deadline/eligibility calculation (`calculateDraftDeadline` in
  `deadline.ts` is untouched) — only the progress-bar's percentage
  reading changed, exactly as the prompt's own "IMPORTANT DISTINCTION"
  required. Does not give any progress bar a bright/neon treatment — the
  fill color is unchanged in hue, only track height/contrast and fill
  transition timing changed.

### Phase 9.5K — Runtime on Watchlist film cards

Adds runtime to the main Watchlist page's film cards, per "NORMAL
WATCHLIST PAGE", "Runtime Display" above.

- **`src/components/watchlist/film-card.tsx`.** `WatchlistFilmCardView`
  already carried `runtimeMinutes: number | null` (added in an earlier
  phase purely for sorting) and it was already being populated from
  `mergeLocalFilmMetadata(...)` at the call site — this phase only needed
  to render it. The previous year/rating row (a flex `div` with no visual
  separator between its two spans) was replaced with a single computed
  `metadataLine` string — `[year, runtime, rating].filter(Boolean).join(" · ")`
  — rendered as one `<p>`. This both adds runtime in the exact
  requested "1997 · 81 min" format and, as a side effect, fixes the
  missing "·" separator that previously existed between year and rating.
  Using a plain paragraph rather than a non-wrapping flex row also means
  the line wraps naturally on narrow cards instead of overflowing —
  addressing "Responsive Film Card Text" without any extra CSS. Because
  the Random Film picker's card (`random-film-view.tsx`) reuses this same
  `FilmCard` component and already passed `runtimeMinutes` through, it
  picked up the change with no changes of its own.
- **Format.** Always plain minutes (`104 min`), matching the one other
  place a single film's runtime was already shown in the app
  (`recently-watched-section.tsx`'s ` · ${runtimeMinutes} min`) —
  deliberately NOT the `Xh Ym` convention `formatRuntimeMinutes` in
  `src/domain/stats/format.ts` uses, since that one is scoped to
  aggregated multi-film totals on the Stats page, a different unit of
  meaning entirely.
- **Testing.** New `e2e/watchlist-runtime.spec.ts`: one film with a
  known runtime shows "104 min" (and never a converted "2h" form), a
  second film with no runtime yet shows its other metadata but omits
  runtime — and `"N/A"` never appears anywhere on the page. Verified
  visually via screenshots at both a wide desktop width and a 360px
  mobile width: the metadata line never overflows its card, genre badges
  wrap, titles truncate cleanly, and the watch-toggle eye control stays
  reachable in the card's top-right corner at every width tested. `pnpm
format`, `pnpm lint`, `pnpm typecheck` (strict), `pnpm test`, and `pnpm
test:e2e` are all clean.
- **What this phase does NOT do, on purpose:** does not add runtime to
  `draft-film-card.tsx` (the Active/historical Draft film cards) —
  `DraftFilmCardView` has no `runtimeMinutes` field today and the prompt
  scoped this to the Watchlist/home page specifically; left as a
  candidate for a future, explicitly-requested pass rather than
  speculatively extended here.
