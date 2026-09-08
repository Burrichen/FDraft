# Event film lists

FDraft's curated Event film pools (Halloween's Horror/Kitsch, January's
`curated` list, Christmas's Classic/Adjacent) are simple **static
JSON files that ship with the app** — never fetched remotely, never synced
from a third-party site. Editing one requires a new FDraft build; there is
no live/automatic sync.

## Where

```
public/events/halloween/films.json
public/events/january/films.json
public/events/christmas/films.json
```

## Entry format

Every film is identified by **title + year** only — no provider id, no
Letterboxd slug:

```json
{ "title": "Halloween", "year": 1978 }
```

FDraft's existing metadata system resolves everything else (poster,
runtime, rating, genres, ...) the normal way, the first time each film is
actually needed. Year matters — it's what stops "Halloween (1978)" from
ever being confused with "Halloween (2007)".

## Categories per event

| Event     | File                   | Categories            |
| --------- | ---------------------- | --------------------- |
| Halloween | `halloween/films.json` | `horror`, `kitsch`    |
| January   | `january/films.json`   | `curated`             |
| Christmas | `christmas/films.json` | `classic`, `adjacent` |

- **Halloween** — `horror`/`kitsch` ARE the pool a Halloween Draft draws
  from; a listed film doesn't need to be on anyone's watchlist.
- **January** — `curated` IS January's entire candidate pool. Joining the
  event rolls exactly one random film from this list and that film becomes
  the January Event Draft (see docs/product-spec.md, "F* YOU, IT'S JANUARY
  EVENT"). Watchlist membership and average rating are both irrelevant to
  selection; a listed film nobody has imported is created locally the first
  time it's needed, exactly like Halloween's pools, and never added to
  anyone's watchlist. This REPLACED an earlier design in which `curated`
  was merely an additive eligibility route on top of a profile's own active
  watchlist alongside an "average rating ≤ 3.5" rule — both of which are
  gone.
- **Christmas** — `classic` (directly, recognisably Christmas films) and
  `adjacent` (Christmas/winter/holiday-season viewing that isn't
  necessarily a traditional Christmas film). Both ARE the pools a
  Christmas Draft draws from (see docs/product-spec.md, "CHRISTMAS
  EVENT"); a listed film doesn't need to be on anyone's watchlist. Add
  plenty — the largest difficulty (Hardcore) needs 20 films across the
  two categories in one Draft.

Category membership is entirely editorial — which list a film is in is
authoritative, never inferred from its genre metadata.

## How to update

1. Edit the relevant `films.json`.
2. Run `pnpm run test src/domain/events/event-film-content.test.ts` to
   validate it (schema, and no within-/cross-category duplicates in what
   you just edited).
3. Commit and ship the next FDraft build — that's the entire publish
   step.

A film appearing in more than one category of the same event is never
silently deduplicated — it's reported (a failed validation test, and a
console warning at app startup) so you can decide whether that's a
mistake, but the Draft generator's own cross-pool exclusion already
guarantees it's never drawn twice into the same Draft regardless.
