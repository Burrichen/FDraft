import {
  BACKUP_FORMAT_MARKER,
  type JsonValue,
} from "@/domain/backup/backup-schema";
import type { BackupV1 } from "@/domain/backup/backup-schema";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { LocalProfile } from "@/domain/profiles/profile";
import type { Repositories } from "@/repositories";

/** Bumped only if this app's own package version ever needs to be surfaced in a backup for support/debugging purposes — see docs/product-spec.md, "BACKUP FORMAT" manifest example's `appVersion` field. Not the same thing as the backup format version, which is versioned independently in `backup-migrations.ts`. */
export const APP_VERSION = "1.0.0";

/**
 * Repository records type their free-form JSON blobs (`externalIds`, `raw`,
 * `challengeDisplayValue`, interaction `state`) as `Record<string,
 * unknown>` — accurate for in-memory data nobody's handed a schema yet,
 * but the backup format's `JsonValue` is deliberately stricter (see
 * `backup-schema.ts`). Round-tripping through `JSON.stringify`/`JSON.parse`
 * both satisfies that stricter type and guarantees the value really is
 * plain, serializable JSON — not, say, a `Map` or a class instance that
 * happened to typecheck as `Record<string, unknown>`.
 */
function toJsonValue<T extends Record<string, unknown> | null>(
  value: T,
): JsonValue | null {
  return value === null
    ? null
    : (JSON.parse(JSON.stringify(value)) as JsonValue);
}

/**
 * Assembles a complete, portable backup of one local profile (see
 * docs/product-spec.md, "WHAT A PROFILE EXPORT MUST INCLUDE" — Prompt
 * 9.5C). Reads through the standard `Repositories` interface, same as any
 * other application service — export is a read-only operation, so it
 * doesn't need the cross-table transactional guarantees restore does (see
 * `backup-restore-repository.ts`).
 *
 * Only films/metadata this profile's own data actually *references* are
 * included — not the entire shared local catalog, which may hold films
 * belonging only to other profiles on this device (see
 * `docs/product-spec.md`, "CORE DATA MODEL" — films are shared, not
 * profile-owned). A restore rebuilds exactly the subset that matters to
 * this profile, and re-links it against whatever catalog already exists
 * on the destination device (see `backup-restore-repository.ts`'s
 * film-dedup logic).
 *
 * Poster images are never embedded — `FilmMetadataRecord.posterUrl` is
 * only ever a remote URL string (this app has never stored image blobs
 * anywhere, local-first or not); the backup carries that URL and a poster
 * reloads normally, from the network, the next time its card renders
 * online. See docs/product-spec.md implementation log for the explicit
 * "no blobs exist to decide about" note this satisfies.
 */
export async function buildProfileBackup(
  repos: Repositories,
  profileId: string,
  deps: { clock?: Clock } = {},
): Promise<BackupV1> {
  const clock = deps.clock ?? new SystemClock();

  const profile = await repos.profiles.getById(profileId);
  if (!profile) {
    throw new Error(`No profile found with id ${profileId}`);
  }

  const watchlistEntries = await repos.watchlist.listAllEntries(profileId);
  const watchlistImports = await repos.watchlist.listImports(profileId);
  const watchedHistory = await repos.history.listWatchedHistory(profileId);
  const userRatings = await repos.history.listRatings(profileId);
  const drafts = await repos.drafts.listAllForProfile(profileId);

  const draftItemLists = await Promise.all(
    drafts.map((draft) => repos.drafts.listItemsForDraft(draft.id)),
  );
  const draftItems = draftItemLists.flat();

  const challengeAttemptLists = await Promise.all(
    drafts.map((draft) => repos.drafts.listChallengeAttemptsForDraft(draft.id)),
  );
  const draftChallengeAttempts = challengeAttemptLists.flat();

  // No public "list every interaction for a draft" method exists (only
  // "pending" and "latest for one challenge") because nothing in the app
  // needs it outside of backup — draft items already carry a draft's real
  // outcome. Interactions are non-essential here for the same reason
  // `src/migration/migrate-from-supabase-export.ts` already excludes them:
  // an in-progress interactive challenge (Battle Royale/Three Doors) has
  // no meaningful way to "resume" after a restore, and the local path
  // doesn't even create new ones today (see Phase 9.5B). Left as an empty
  // collection rather than removed from the format, so a future phase
  // that *does* need them only has to start populating this array.
  const draftChallengeInteractions: BackupV1["draftChallengeInteractions"] = [];

  const postmortemResponseLists = await Promise.all(
    drafts.map((draft) =>
      repos.history.listPostmortemResponsesForDraft(draft.id),
    ),
  );
  const draftPostmortemResponses = postmortemResponseLists.flat();

  const weightAdjustmentLists = await Promise.all(
    watchlistEntries.map((entry) =>
      repos.history.listSelectionWeightAdjustments(entry.id),
    ),
  );
  const selectionWeightAdjustments = weightAdjustmentLists.flat();

  const settingsMap = await repos.settings.getAll(profileId);
  const settings = Object.entries(settingsMap).map(([key, value]) => ({
    key,
    value: value as BackupV1["settings"][number]["value"],
  }));

  const pointBalanceRecords = await repos.points.listBalances(profileId);
  const pointBalances = pointBalanceRecords.map(
    ({ currency, total, updatedAt }) => ({
      currency,
      total,
      updatedAt,
    }),
  );

  // Only films this profile's own records actually reference — see the
  // doc comment above for why this isn't "every film in the local catalog".
  const referencedFilmIds = new Set<string>();
  for (const entry of watchlistEntries) referencedFilmIds.add(entry.filmId);
  for (const record of watchedHistory) referencedFilmIds.add(record.filmId);
  for (const rating of userRatings) referencedFilmIds.add(rating.filmId);
  for (const item of draftItems) referencedFilmIds.add(item.filmId);

  const filmResults = await Promise.all(
    [...referencedFilmIds].map((filmId) => repos.films.getById(filmId)),
  );
  const films = filmResults.filter(
    (film): film is NonNullable<typeof film> => film !== null,
  );

  const metadataByFilmId = await repos.films.getMetadataForFilms([
    ...referencedFilmIds,
  ]);
  const filmMetadata = [...metadataByFilmId.values()].flat();

  // Same "only what this profile's own data references" scoping as
  // `filmMetadata` above — `unresolvedMetadata` is catalog-wide, not
  // profile-owned (see `UnresolvedMetadataRecord`'s doc comment).
  const allUnresolvedMetadata = await repos.unresolvedMetadata.listAll();
  const unresolvedMetadata = allUnresolvedMetadata.filter((record) =>
    referencedFilmIds.has(record.filmId),
  );

  const profileWithoutFunctions: LocalProfile = {
    id: profile.id,
    displayName: profile.displayName,
    createdAt: profile.createdAt,
    lastOpenedAt: profile.lastOpenedAt,
    timezone: profile.timezone,
    settings: { ...profile.settings },
    dataVersion: profile.dataVersion,
  };

  return {
    manifest: {
      format: BACKUP_FORMAT_MARKER,
      formatVersion: 1,
      exportedAt: clock.now().toISOString(),
      appVersion: APP_VERSION,
    },
    profile: profileWithoutFunctions,
    films,
    filmMetadata: filmMetadata.map((record) => ({
      ...record,
      externalIds: toJsonValue(record.externalIds) as Record<
        string,
        JsonValue
      > | null,
      raw: toJsonValue(record.raw) as Record<string, JsonValue> | null,
    })),
    watchlistEntries,
    watchlistImports,
    watchedHistory,
    userRatings,
    drafts,
    draftItems: draftItems.map((item) => ({
      ...item,
      challengeDisplayValue: toJsonValue(item.challengeDisplayValue) as Record<
        string,
        JsonValue
      > | null,
      eventRewardGrantedAt: item.eventRewardGrantedAt ?? null,
    })),
    draftChallengeAttempts,
    draftChallengeInteractions,
    draftPostmortemResponses,
    selectionWeightAdjustments,
    settings,
    unresolvedMetadata,
    pointBalances,
  };
}

/** Compact (minified) JSON — the recommended `.fdraft` backup file. Identical content to the "readable" variant, just without whitespace. */
export function serializeBackupCompact(backup: BackupV1): string {
  return JSON.stringify(backup);
}

/** Pretty-printed JSON for the optional "Export Readable JSON" advanced/debugging option (see docs/product-spec.md, "EXPORT UX") — same data, same importable format, just legible to a human opening it in a text editor. */
export function serializeBackupReadable(backup: BackupV1): string {
  return JSON.stringify(backup, null, 2);
}

function sanitizeForFilename(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "profile"
  );
}

/** `My-FDraft-Alex-2026-08-11.fdraft` — see docs/product-spec.md, "BACKUP FORMAT": "A format such as `My-FDraft-2026-08-11.fdraft` would be preferable from a user-experience perspective." The extension is a UX nicety only — nothing about validating a backup ever depends on it (see `parseAndMigrateBackup`, which reads file *contents*, never the filename). */
export function suggestBackupFilename(
  profile: Pick<LocalProfile, "displayName">,
  clock: Clock = new SystemClock(),
  extension = "fdraft",
): string {
  const datePart = clock.now().toISOString().slice(0, 10);
  return `My-FDraft-${sanitizeForFilename(profile.displayName)}-${datePart}.${extension}`;
}

/**
 * Backs the lightweight "Last backup: 47 days ago" indicator (see
 * docs/product-spec.md, "OPTIONAL AUTO-BACKUP REMINDER" — Prompt 9.5C:
 * "Do NOT require automatic cloud backup. However, add a lightweight local
 * indicator... Keep this simple. Do not nag the user constantly."). Stored
 * as an ordinary profile setting rather than a new table — it's a single
 * per-profile timestamp, not user data that needs its own backup entry
 * (recording it inside the very backup it describes would be circular).
 */
const LAST_BACKUP_EXPORTED_AT_KEY = "backup.lastExportedAt";

/** Call this once a backup file has actually been handed to the user (downloaded), not merely built in memory — a build that's never saved isn't a real backup yet. */
export async function recordBackupExported(
  repos: Repositories,
  profileId: string,
  clock: Clock = new SystemClock(),
): Promise<void> {
  await repos.settings.set(
    profileId,
    LAST_BACKUP_EXPORTED_AT_KEY,
    clock.now().toISOString(),
  );
}

/** `null` if this profile has never exported a backup — the "Last backup: Never" state. */
export async function getLastBackupExportedAt(
  repos: Repositories,
  profileId: string,
): Promise<string | null> {
  return repos.settings.get<string>(profileId, LAST_BACKUP_EXPORTED_AT_KEY);
}
