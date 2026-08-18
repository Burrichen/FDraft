import type { IdGenerator } from "@/domain/shared/id";
import {
  DEFAULT_PAGE_FALLBACK,
  type DefaultPage,
} from "@/domain/profiles/default-page";
import type { Clock } from "@/domain/time/clock";

/**
 * A LOCAL PROFILE — one person's FDraft data on this installation (see
 * docs/product-spec.md, "LOCAL PROFILES REPLACE REMOTE ACCOUNTS", Prompt
 * 9.5A). Deliberately NOT an account: no password, no email, no remote
 * service. Every other locally-stored record (watchlist entries, drafts,
 * history, settings) is keyed by `LocalProfile.id`, the same way rows used
 * to be keyed by `user_id` under Supabase auth — the profile id is the one
 * thing that replaces it.
 *
 * `dataVersion` is intentionally distinct from the local database's own
 * `SCHEMA_VERSION` (see `src/infrastructure/local-db/schema.ts`): the schema
 * version describes the shape of the object stores themselves, while
 * `dataVersion` is a per-profile stamp of which schema version this
 * profile's *data* was last migrated against. In practice they move
 * together today (one migration runner upgrades every profile at once), but
 * keeping the two concepts separate leaves room for a future migration that
 * only needs to touch one profile's records without re-touching every
 * profile on the install.
 */
export interface ProfileSettings {
  /** Mirrors the OS/browser-level accessibility preference (see docs/product-spec.md, "Design Direction" — "Animation should be subtle and functional"), but overridable per profile. */
  reducedMotion: boolean;
  /** Which page FDraft opens to for this profile — see docs/product-spec.md, "DEFAULT START PAGE SETTING". Always read through `resolveDefaultPage()` (never trusted directly), which is what makes an older profile record predating this field, or a stale value, fall back to Watchlist rather than breaking. */
  defaultPage: DefaultPage;
  /**
   * When true, a roll that lands on a later entry in a franchise/
   * collection is replaced with the earliest eligible unwatched entry in
   * that same franchise still on the watchlist (see
   * `src/domain/watchlist/franchise-order.ts`) — off by default, since it
   * changes what a draft actually contains. Read through
   * `resolveFranchiseChronologicalOrder()`, never trusted directly, so a
   * profile record predating this setting defaults to today's unchanged
   * behaviour rather than `undefined`.
   */
  franchiseChronologicalOrder: boolean;
  /**
   * Unlocks temporary/testing-only actions (currently: "Regenerate
   * Draft" on the Draft page — see docs/updates, v1.0.4 "God Mode") —
   * per-profile, not installation-level, since it's meant to be switched
   * on briefly for one profile's own testing rather than affecting every
   * profile on the device. Off by default; a profile record predating
   * this setting resolves to `false` via `resolveAdminMode()`, never
   * trusted directly. This setting itself, and everything it unlocks, is
   * intended to be removed once it's no longer needed for testing — see
   * its own Settings copy.
   */
  adminMode: boolean;
}

export interface LocalProfile {
  id: string;
  displayName: string;
  createdAt: string;
  lastOpenedAt: string;
  timezone: string;
  settings: ProfileSettings;
  dataVersion: number;
}

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  reducedMotion: false,
  defaultPage: DEFAULT_PAGE_FALLBACK,
  franchiseChronologicalOrder: false,
  adminMode: false,
};

/** A profile record predating this setting has no such property at all — resolves to the required default (`false`, unchanged drafting behaviour) rather than `undefined`. Every reader must route through this, never the stored value directly. */
export function resolveFranchiseChronologicalOrder(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

/** Same rationale as `resolveFranchiseChronologicalOrder` — a profile record predating this setting resolves to `false` (Admin Mode off) rather than `undefined`. */
export function resolveAdminMode(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

export interface CreateProfileParams {
  displayName: string;
  timezone: string;
  /** The schema version this profile is being created under — see `SCHEMA_VERSION` in `src/infrastructure/local-db/schema.ts`. Passed in explicitly rather than imported, so this module never depends on the storage layer. */
  currentSchemaVersion: number;
}

export class InvalidProfileNameError extends Error {
  constructor() {
    super("A profile needs a display name.");
    this.name = "InvalidProfileNameError";
  }
}

/** Builds a brand-new profile with a stable id, ready to be persisted. Pure — takes its id source and clock explicitly rather than reaching for `crypto`/`Date` itself, so it stays fully deterministic under test. */
export function createProfile(
  params: CreateProfileParams,
  deps: { idGenerator: IdGenerator; clock: Clock },
): LocalProfile {
  const displayName = params.displayName.trim();
  if (displayName.length === 0) {
    throw new InvalidProfileNameError();
  }

  const now = deps.clock.now().toISOString();
  return {
    id: deps.idGenerator.generate(),
    displayName,
    createdAt: now,
    lastOpenedAt: now,
    timezone: params.timezone,
    settings: { ...DEFAULT_PROFILE_SETTINGS },
    dataVersion: params.currentSchemaVersion,
  };
}

/** Returns a copy of the profile with `lastOpenedAt` bumped to now — called whenever a profile becomes the active one. */
export function touchLastOpened(
  profile: LocalProfile,
  clock: Clock,
): LocalProfile {
  return { ...profile, lastOpenedAt: clock.now().toISOString() };
}
