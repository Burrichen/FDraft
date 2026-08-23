# Event manifests

This folder holds the **globally curated film lists** for events that need
one:

- `fuck-you-its-january.json` — `F* You, It's January!`'s curated whitelist
  (see docs/updates, "GLOBAL CURATED JANUARY LIST"). A single `films` array.
- `halloween.json` — Halloween's two curated pools (see docs/updates,
  "PROMPT 19 — HALLOWEEN DRAFT MECHANICS"). Two arrays instead of one —
  see "Halloween's two lists" below for what each means.

Each file here is edited **directly in this repo** and serves two roles at
once:

1. **The bundled offline fallback.** It's imported directly into the app
   (see `src/application/events/january-manifest-service.ts`) and shipped
   in every FDraft build, so events work correctly even for a profile that
   has never been online.
2. **The live, remotely-fetched source.** Every online FDraft installation
   periodically fetches this exact file straight from GitHub at:

   ```
   https://raw.githubusercontent.com/Burrichen/FDraft/main/src/domain/events/manifests/fuck-you-its-january.json
   ```

   That means editing this file and pushing to `main` is the entire publish
   step — **no new FDraft release is required** for a manifest change to
   reach users.

## How to add a film

Add an entry to the `films` array. Prefer a real TMDB id (`tmdbId`) when you
have one — it's the most reliable match. If you don't, a Letterboxd slug or
a title/year pair both work as fallbacks (see
`src/application/events/resolve-manifest-film-ids.ts` for the exact match
order: `tmdbId` → `letterboxdSlug` → `title`+`year`).

```json
{
  "tmdbId": "603",
  "title": "The Matrix",
  "year": 1999
}
```

Only `title` is required — `tmdbId`/`letterboxdSlug`/`year` are all
optional, but include whichever you have; a bare title/year match is the
least reliable of the three.

A curated January film only ever becomes draft-eligible for a profile that
already has it on their own ACTIVE watchlist — adding a film here never
adds it to anyone's watchlist automatically (see docs/updates, "WHITELIST
MATCHING"). **Halloween's Horror/Kitsch films are different** — see below.

## Halloween's two lists (`halloween.json`)

Unlike January's whitelist (an eligibility bonus on top of the normal
watchlist pool), Halloween's `horror` and `kitsch` arrays ARE the pool a
Halloween Draft draws from — a film listed here does **not** need to be on
anyone's watchlist. Each entry uses the exact same shape as a January
entry (`tmdbId`/`letterboxdSlug`/`title`/`year` — only `title` required).

- **`horror`** — "Popular, iconic or otherwise on-brand Horror films
  suitable for the Halloween Event." Selected for the Draft's Horror pool.
- **`kitsch`** — "Halloween-themed, seasonal, campy, spooky, gothic or
  family Halloween films which are not necessarily Horror." Selected for
  the Draft's Kitsch pool.

A film listed in either array that doesn't already exist locally is
created automatically (title/year only, never fabricated metadata) the
first time it's needed, then enriched via the normal metadata provider
when online — see `resolve-or-create-halloween-films.ts`. Keep this file
small — a handful of genuinely iconic, uncontroversial titles per list is
enough for testing; it is not meant to be an exhaustive catalogue.

## Publishing a change

1. Edit `fuck-you-its-january.json` or `halloween.json` in this folder.
2. Bump `updatedAt` to the current time (informational only — nothing
   parses it for staleness; the app's own local cache has its own
   independent freshness check).
3. Commit and push to `main`.

Every FDraft installation refreshes its cached copy once a day (or sooner,
via Settings → "Refresh event data", useful for testing a change
immediately) — see `JANUARY_MANIFEST_STALE_AFTER_MS` in
`january-manifest-service.ts` (`HALLOWEEN_MANIFEST_STALE_AFTER_MS` in
`halloween-manifest-service.ts`) to adjust that interval.

If a fetch ever fails (no network, GitHub unreachable, malformed JSON), the
app falls back to its last good cached copy, or to this bundled file if it
has never fetched successfully at all. A manifest fetch failure can never
prevent FDraft from starting.
