import {
  createProfile,
  touchLastOpened,
  type LocalProfile,
} from "@/domain/profiles/profile";
import { resolveAutoOpenProfileId } from "@/domain/profiles/select-active-profile";
import type { IdGenerator } from "@/domain/shared/id";
import { defaultIdGenerator } from "@/domain/shared/id";
import type { Clock } from "@/domain/time/clock";
import { SystemClock } from "@/domain/time/clock";
import type { ActiveProfilePointer } from "@/infrastructure/local-db/active-profile-pointer";
import type { DataErasureRepository } from "@/repositories/data-erasure-repository";
import type { ProfileRepository } from "@/repositories/profile-repository";

/**
 * Application service for local profiles (see docs/product-spec.md, "LOCAL
 * PROFILES REPLACE REMOTE ACCOUNTS", Prompt 9.5A). This is the boundary the
 * prompt asks for explicitly:
 *
 *   BAD:    challengeEngine(indexedDb.getCurrentProfile())
 *   BETTER: challengeEngine(profileContext)   // persistence handled elsewhere
 *
 * `ProfileService` is that "elsewhere" — it depends only on the
 * `ProfileRepository` interface and the `ActiveProfilePointer` interface,
 * never on Dexie or `window.localStorage` directly, so it can be
 * constructed identically in a test (with an in-memory pointer and a fake
 * repository) and in the real app.
 */
export class ProfileService {
  private readonly profiles: ProfileRepository;
  private readonly dataErasure: DataErasureRepository;
  private readonly pointer: ActiveProfilePointer;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly currentSchemaVersion: number;

  constructor(deps: {
    profiles: ProfileRepository;
    dataErasure: DataErasureRepository;
    pointer: ActiveProfilePointer;
    currentSchemaVersion: number;
    idGenerator?: IdGenerator;
    clock?: Clock;
  }) {
    this.profiles = deps.profiles;
    this.dataErasure = deps.dataErasure;
    this.pointer = deps.pointer;
    this.currentSchemaVersion = deps.currentSchemaVersion;
    this.idGenerator = deps.idGenerator ?? defaultIdGenerator;
    this.clock = deps.clock ?? new SystemClock();
  }

  async listProfiles(): Promise<LocalProfile[]> {
    return this.profiles.list();
  }

  async createProfile(
    displayName: string,
    timezone: string,
  ): Promise<LocalProfile> {
    const profile = createProfile(
      {
        displayName,
        timezone,
        currentSchemaVersion: this.currentSchemaVersion,
      },
      { idGenerator: this.idGenerator, clock: this.clock },
    );
    await this.profiles.create(profile);
    return profile;
  }

  async renameProfile(
    profileId: string,
    displayName: string,
  ): Promise<LocalProfile> {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      throw new Error("A profile needs a display name.");
    }
    const existing = await this.profiles.getById(profileId);
    if (!existing) {
      throw new Error(`No profile found with id ${profileId}`);
    }
    const updated: LocalProfile = { ...existing, displayName: trimmed };
    await this.profiles.update(updated);
    return updated;
  }

  /**
   * Destructive: irreversibly erases this profile's watchlist, drafts,
   * history, ratings, and settings, then the profile record itself (see
   * `DataErasureRepository`). Callers own their own confirmation UI —
   * this performs the deletion unconditionally.
   */
  async deleteProfile(profileId: string): Promise<void> {
    await this.dataErasure.eraseProfileCompletely(profileId);
    if (this.pointer.get() === profileId) {
      this.pointer.clear();
    }
  }

  /**
   * Marks a profile as the active one: bumps `lastOpenedAt`, persists it,
   * and remembers it as "the last opened profile" for next launch.
   */
  async switchToProfile(profileId: string): Promise<LocalProfile> {
    const profile = await this.profiles.getById(profileId);
    if (!profile) {
      throw new Error(`No profile found with id ${profileId}`);
    }
    const touched = touchLastOpened(profile, this.clock);
    await this.profiles.update(touched);
    this.pointer.set(profileId);
    return touched;
  }

  /**
   * What the app should do on launch: either open a profile automatically
   * (first-ever profile, or the single existing one, or a remembered one
   * among several) or show the picker (see docs/product-spec.md — "Do not
   * force users through a profile-selection screen every launch unless
   * multiple local profiles exist.").
   */
  async resolveInitialProfile(): Promise<LocalProfile | null> {
    const profiles = await this.profiles.list();
    const autoOpenId = resolveAutoOpenProfileId(profiles, this.pointer.get());
    if (!autoOpenId) {
      return null;
    }
    return this.switchToProfile(autoOpenId);
  }
}
