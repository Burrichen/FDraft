import type Dexie from "dexie";
import type { Transaction } from "dexie";

/**
 * Local database schema, versioned (see docs/product-spec.md, "STORAGE
 * SCHEMA VERSIONING" — Prompt 9.5A: "Do not scatter version numbers
 * throroughout the application... Create proper migration handling.").
 *
 * This is the ONLY file that should ever mention a schema version number.
 * Dexie's own migration model requires calling `.version(n).stores(...)`
 * once per version it needs to know how to reach — that's inherent to how
 * IndexedDB upgrades work and can't be fully hidden — but this file is
 * where all of those calls live, as a single ordered list applied by
 * `applySchema()`. Nothing outside this file ever writes a version number;
 * `SCHEMA_VERSION` (the latest one) is derived from the list itself.
 *
 * To add a schema change in the future: append a new entry with the next
 * version number, its full `stores` map (Dexie wants the complete schema
 * for that version, not just the diff), and an `upgrade` callback if
 * existing data needs transforming. Never edit an already-shipped version's
 * entry — that would corrupt anyone who already migrated past it.
 */
export interface SchemaVersion {
  version: number;
  /** Dexie's index-declaration mini-language: comma-separated, primary key first (`++` = auto-increment, `&` = unique index, no prefix = regular index, `[a+b]` = compound index). */
  stores: Record<string, string>;
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

export const SCHEMA_MIGRATIONS: SchemaVersion[] = [
  {
    version: 1,
    stores: {
      profiles: "id",
      films: "id, letterboxdSlug, [title+releaseYear]",
      filmMetadata: "id, filmId, [filmId+provider]",
      // NOTE: IndexedDB does not support `boolean` as an index key type
      // (only number/string/Date/binary/arrays thereof) — a record whose
      // indexed field holds a boolean is silently excluded from that index
      // rather than throwing, which reads as "the query returns nothing"
      // if you don't know to expect it. `isActive`/`isCompleted` are
      // therefore deliberately NOT part of any index below; repositories
      // fetch by the indexed key (profileId/draftId) and filter the
      // boolean in JS instead.
      watchlistEntries: "id, profileId, filmId, [profileId+filmId]",
      watchlistImports: "id, profileId, status",
      watchedHistory: "id, profileId, watchlistEntryId, filmId",
      userRatings: "id, [profileId+filmId], profileId",
      drafts: "id, profileId, [profileId+status]",
      draftItems: "id, draftId, watchlistEntryId",
      draftChallengeAttempts: "id, draftId",
      draftChallengeInteractions: "id, draftId, [draftId+challengeId], status",
      // `&draftItemId` is a UNIQUE index — the same idempotency guarantee
      // `draft_postmortem_responses.unique(draft_item_id)` gave us under
      // Postgres (see docs/product-spec.md Phase 9 implementation log). A
      // second insert for the same draft item throws ConstraintError rather
      // than silently succeeding, so "resubmitting never double-applies a
      // side effect" is enforced by the storage engine itself, not just by
      // application code remembering to check first.
      draftPostmortemResponses: "id, &draftItemId, draftId",
      selectionWeightAdjustments: "id, watchlistEntryId",
      settings: "[profileId+key], profileId",
    },
  },
<<<<<<< Updated upstream
=======
  {
    // Adds `unresolvedMetadata` — see docs/product-spec.md, "UNRESOLVED
    // METADATA RESOLUTION" (Prompt 10, Part 4). A brand-new, empty store:
    // no `upgrade` callback needed, since there's no existing data to
    // transform. `FilmMetadataRecord` also gained a new `matchMethod`
    // field in this same phase, but that's a plain (non-indexed)
    // property — Dexie/IndexedDB don't need a schema version bump for
    // that at all, only `resolveMatchMethod()` defaulting stale records
    // at the read boundary (see `src/domain/metadata/match-method.ts`).
    version: 2,
    stores: {
      profiles: "id",
      films: "id, letterboxdSlug, [title+releaseYear]",
      filmMetadata: "id, filmId, [filmId+provider]",
      watchlistEntries: "id, profileId, filmId, [profileId+filmId]",
      watchlistImports: "id, profileId, status",
      watchedHistory: "id, profileId, watchlistEntryId, filmId",
      userRatings: "id, [profileId+filmId], profileId",
      drafts: "id, profileId, [profileId+status]",
      draftItems: "id, draftId, watchlistEntryId",
      draftChallengeAttempts: "id, draftId",
      draftChallengeInteractions: "id, draftId, [draftId+challengeId], status",
      draftPostmortemResponses: "id, &draftItemId, draftId",
      selectionWeightAdjustments: "id, watchlistEntryId",
      settings: "[profileId+key], profileId",
      unresolvedMetadata: "id, filmId, [filmId+provider], status",
    },
  },
  {
    // First half of retiring the `[filmId+provider]` compound key — see
    // docs/product-spec.md, "COMPLETE PRODUCT AUDIT": a film that failed
    // once under one provider label (e.g. the "unknown" placeholder used
    // for a network error, which carries no real provider id) and later
    // failed or succeeded under a different one could accumulate multiple
    // rows for the SAME film, only one of which a later successful match
    // would ever delete — leaving the film permanently stuck in the
    // Unresolved queue with a duplicate React key. This version dedupes
    // any rows an install already accumulated under the old key, keeping
    // the most recently attempted one per film — `filmId` stays a
    // NON-unique index here deliberately. IndexedDB applies a store's
    // index changes (including a new unique constraint) before running
    // its `upgrade` callback, so declaring `&filmId` in this same version
    // would try to build the unique index against the still-duplicated
    // data and throw `ConstraintError` before the dedupe below ever runs.
    // Version 4 tightens `filmId` to unique once the data is guaranteed
    // clean.
    version: 3,
    stores: {
      profiles: "id",
      films: "id, letterboxdSlug, [title+releaseYear]",
      filmMetadata: "id, filmId, [filmId+provider]",
      watchlistEntries: "id, profileId, filmId, [profileId+filmId]",
      watchlistImports: "id, profileId, status",
      watchedHistory: "id, profileId, watchlistEntryId, filmId",
      userRatings: "id, [profileId+filmId], profileId",
      drafts: "id, profileId, [profileId+status]",
      draftItems: "id, draftId, watchlistEntryId",
      draftChallengeAttempts: "id, draftId",
      draftChallengeInteractions: "id, draftId, [draftId+challengeId], status",
      draftPostmortemResponses: "id, &draftItemId, draftId",
      selectionWeightAdjustments: "id, watchlistEntryId",
      settings: "[profileId+key], profileId",
      unresolvedMetadata: "id, filmId, status",
    },
    upgrade: async (tx) => {
      const table = tx.table("unresolvedMetadata");
      const rows = await table.toArray();
      const newestByFilmId = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const existing = newestByFilmId.get(row.filmId);
        if (!existing || row.lastAttemptedAt > existing.lastAttemptedAt) {
          newestByFilmId.set(row.filmId, row);
        }
      }
      await table.clear();
      if (newestByFilmId.size > 0) {
        await table.bulkAdd([...newestByFilmId.values()]);
      }
    },
  },
  {
    // Second half — now that version 3 has guaranteed at most one row per
    // `filmId`, `filmId` can safely become a UNIQUE index. There is only
    // ever one configured provider active at a time in this app, so "is
    // this film resolved" is fundamentally a per-film question, not a
    // per-(film, provider) one; `provider` is now just an informational
    // field on the row, not part of its identity. No `upgrade` callback
    // needed — no data transformation, just a stricter constraint.
    version: 4,
    stores: {
      profiles: "id",
      films: "id, letterboxdSlug, [title+releaseYear]",
      filmMetadata: "id, filmId, [filmId+provider]",
      watchlistEntries: "id, profileId, filmId, [profileId+filmId]",
      watchlistImports: "id, profileId, status",
      watchedHistory: "id, profileId, watchlistEntryId, filmId",
      userRatings: "id, [profileId+filmId], profileId",
      drafts: "id, profileId, [profileId+status]",
      draftItems: "id, draftId, watchlistEntryId",
      draftChallengeAttempts: "id, draftId",
      draftChallengeInteractions: "id, draftId, [draftId+challengeId], status",
      draftPostmortemResponses: "id, &draftItemId, draftId",
      selectionWeightAdjustments: "id, watchlistEntryId",
      settings: "[profileId+key], profileId",
      unresolvedMetadata: "id, &filmId, status",
    },
  },
>>>>>>> Stashed changes
];

export const SCHEMA_VERSION = SCHEMA_MIGRATIONS.at(-1)!.version;

/** Applies every declared schema version, in order, to a fresh Dexie instance — call this once, right after constructing it. */
export function applySchema(db: Dexie): void {
  for (const migration of SCHEMA_MIGRATIONS) {
    const versioned = db.version(migration.version).stores(migration.stores);
    if (migration.upgrade) {
      versioned.upgrade(migration.upgrade);
    }
  }
}
