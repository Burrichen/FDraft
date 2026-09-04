# Event film lists

FDraft's curated Event film pools (Halloween's Horror/Kitsch, January's
extra-eligibility list, Christmas's Classic/Adjacent) are simple **static
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
- **January** — `curated` is an ADDITIVE eligibility route on top of a
  profile's own active watchlist (alongside "average rating ≤ 3.5") — it
  never adds a film to anyone's watchlist.
- **Christmas** — `classic` (directly, recognisably Christmas films) and
  `adjacent` (Christmas/winter/holiday-season viewing that isn't
  necessarily a traditional Christmas film) — content-pack support only;
  no Christmas Draft mechanic exists yet.

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
