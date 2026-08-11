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
