/**
 * Deleting a local profile is destructive (see docs/product-spec.md, "LOCAL
 * PROFILE MANAGEMENT" — Prompt 9.5B: "Deleting a profile is destructive.
 * Require a clear confirmation. Do not allow accidental deletion."). That
 * only means something if it actually removes the profile's data —
 * watchlist entries, imports, drafts and everything they reference, watched
 * history, ratings, postmortem responses, selection-weight adjustments, and
 * settings — not just the profile record itself, which would otherwise
 * leave orphaned rows in every other table forever.
 *
 * Kept as its own small interface rather than a method on
 * `ProfileRepository` because it genuinely spans every other repository's
 * tables — a single local (Dexie) implementation running one transaction
 * across all of them, rather than `ProfileRepository` needing to know about
 * watchlist/draft internals it otherwise has no reason to.
 */
export interface DataErasureRepository {
  /** Irreversibly deletes every record this profile owns, across every table, including the profile record itself. */
  eraseProfileCompletely(profileId: string): Promise<void>;
}
