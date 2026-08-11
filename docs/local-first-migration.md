# Migrating from the old Supabase-backed FDraft

As of Prompt 9.5B, FDraft's only datastore is a local IndexedDB database on
the device (see `src/infrastructure/local-db`), organized around **local
profiles** instead of a remote, authenticated account (see
`docs/product-spec.md`, "LOCAL PROFILES REPLACE REMOTE ACCOUNTS"). The
Supabase backend, its Postgres schema, and every account/login page have
been fully removed from this repository (see "REMOVE UNNECESSARY REMOTE
INFRASTRUCTURE" in the implementation log) — this app no longer runs its
own Supabase instance at all.

If you used an earlier version of FDraft that had you sign in against a
real, externally-hosted Supabase project, this document is how to bring
that data into a local profile without losing anything. There is
deliberately no UI for this (see the Prompt 9.5A/9.5B notes — the
import/export UI is scoped to a later phase); what exists is a safe,
scriptable path.

## Current state

- `scripts/export-supabase-data.ts` — a read-only script that pulls one
  user's complete data out of that old, EXTERNAL Supabase project into a
  JSON file. Never writes to or deletes anything there.
- `src/migration/migrate-from-supabase-export.ts` — a pure, fully unit-tested
  function (`migrateFromSupabaseExport`) that takes that JSON and creates an
  equivalent local profile with all of its data, via the same
  `Repositories` interface the rest of the app uses.

Nothing calls these two together automatically yet — that wiring (a real
"Import my old account" button) is a future phase's job. Until then, running
the migration is a manual, two-step process.

## Exporting your existing Supabase data

```bash
pnpm dlx tsx scripts/export-supabase-data.ts your-email@example.com my-export.json
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` for that OLD,
externally-hosted Supabase project (see `.env.example`) — this app itself
no longer reads those variables for anything else, since it has no backend
of its own anymore.
This produces `my-export.json`, matching the shape described in
`src/migration/supabase-export-types.ts`: your profile, films and their
enrichment metadata, watchlist entries, watched history, ratings, every
draft and its items, postmortem responses, and selection-weight
adjustments.

Run this any time you still have access to that old project — it's
read-only and safe to run repeatedly, including as a periodic backup.

## Bringing it into the local database

Until a real "Import" button exists, open FDraft in your browser (any page
— `ProfileProvider` initializes the local database as soon as the app
loads), open the browser's developer console, and run:

```ts
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { migrateFromSupabaseExport } from "@/migration/migrate-from-supabase-export";
import { SCHEMA_VERSION } from "@/infrastructure/local-db/schema";

const repos = createLocalRepositories();
const exportData = /* the parsed contents of my-export.json */;
const result = await migrateFromSupabaseExport(repos, exportData, {
  currentSchemaVersion: SCHEMA_VERSION,
});
console.log(result); // { profileId, filmsImported, watchlistEntriesImported, draftsImported }
```

The migrated profile keeps its original Supabase user id as its local
profile id, and every film/entry/draft/item keeps its original id too — see
`migrate-from-supabase-export.ts`'s doc comment for why: preserving ids
means the relationships in the export data stay valid without a separate
remapping step, and matches the product spec's "keep IDs stable" rule for
local profiles.

This is a one-time operation per export — running it twice against the same
already-populated local database will fail (loudly, not silently) rather
than duplicating data, since the underlying repository writes are inserts,
not upserts.

## What's intentionally not migrated

`draft_challenge_attempts` (an append-only debug log) and
`draft_challenge_interactions` (in-progress Battle Royale/Three Doors state)
are not part of the export. Neither has a meaningful way to "resume" across
a storage-engine change — a migrated draft with a challenge slot that was
mid-interaction simply comes through with that slot unfilled, which the app
already knows how to represent (see docs/product-spec.md, "CHALLENGE
ARCHITECTURE").
