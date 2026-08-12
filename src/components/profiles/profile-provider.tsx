"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ProfileService } from "@/application/profiles/profile-service";
import type { LocalProfile, ProfileSettings } from "@/domain/profiles/profile";
import { LocalStorageActiveProfilePointer } from "@/infrastructure/local-db/active-profile-pointer";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { SCHEMA_VERSION } from "@/infrastructure/local-db/schema";
import type { Repositories } from "@/repositories";

interface ProfileContextValue {
  /** `undefined` while still resolving on first mount, `null` once resolved with no active profile (picker/create-profile UI should show). */
  activeProfile: LocalProfile | null | undefined;
  profiles: LocalProfile[];
  /**
   * Set when the initial load from IndexedDB itself failed — e.g.
   * `indexedDB.open()` rejecting (Firefox private browsing, Safari with
   * storage disabled, a corrupt database, a failed schema upgrade). Without
   * this, `activeProfile` would stay `undefined` forever and the app would
   * show "Loading…" permanently, at exactly the platform configurations
   * most likely to break a local-first app — see docs/product-spec.md,
   * "COMPLETE PRODUCT AUDIT". `AppShellContent` renders a real error state
   * (with `retryInit`) instead once this is set.
   */
  initError: Error | null;
  /** Re-runs the initial load after `initError` — most causes are environmental (browser storage settings) rather than transient, but a fresh attempt costs nothing and occasionally does help (e.g. the user freed up disk space). */
  retryInit: () => void;
  /** The one shared repository bag every application service call in the app should use — never construct a second one. */
  repositories: Repositories;
  createProfile: (
    displayName: string,
    timezone: string,
  ) => Promise<LocalProfile>;
  switchToProfile: (profileId: string) => Promise<void>;
  renameProfile: (profileId: string, displayName: string) => Promise<void>;
  /** Merges a partial update into the profile's settings — e.g. the Settings page's "Default page" select (see docs/product-spec.md, "DEFAULT START PAGE SETTING"). */
  updateProfileSettings: (
    profileId: string,
    settings: Partial<ProfileSettings>,
  ) => Promise<void>;
  /** Destructive. Callers are responsible for their own confirmation UI — this performs the deletion unconditionally. */
  deleteProfile: (profileId: string) => Promise<void>;
  /**
   * Re-reads the profile list from storage — needed after anything that
   * writes a profile row directly through `repositories` rather than
   * through this context's own methods (see
   * `src/application/backup/import-backup.ts`'s `commitBackupImport`,
   * called by the Settings "Import FDraft Backup" flow: importing as a
   * new profile creates one without ever calling `createProfile` here, so
   * without this the new profile would exist in IndexedDB but stay
   * invisible in the Profiles list and switcher until something else
   * happened to reload them).
   */
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Provides the active local profile — and the one shared local repository
 * bag — to the entire app (see docs/product-spec.md, "LOCAL PROFILES
 * REPLACE REMOTE ACCOUNTS", Prompt 9.5B). This is the app's real entry
 * point now: `(app)/layout.tsx` wraps every page in this, and pages read
 * `activeProfile`/`repositories` from `useProfileContext()` instead of ever
 * touching Supabase or constructing their own repositories.
 */
export function ProfileProvider({
  children,
  databaseName,
}: {
  children: ReactNode;
  databaseName?: string;
}) {
  // Only ever read once per mounted provider — a real screen never remounts
  // this with a different name, only tests do (one unique name per test, to
  // keep each test's IndexedDB state isolated from the others).
  const { service, repositories } = useMemo(() => {
    const repos = createLocalRepositories(
      databaseName ? new FDraftLocalDatabase(databaseName) : undefined,
    );
    const pointer = new LocalStorageActiveProfilePointer();
    return {
      repositories: repos,
      service: new ProfileService({
        profiles: repos.profiles,
        dataErasure: repos.dataErasure,
        pointer,
        currentSchemaVersion: SCHEMA_VERSION,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<
    LocalProfile | null | undefined
  >(undefined);
  const [initError, setInitError] = useState<Error | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setInitError(null);
      try {
        const [initial, list] = await Promise.all([
          service.resolveInitialProfile(),
          service.listProfiles(),
        ]);
        if (cancelled) return;
        setActiveProfile(initial);
        setProfiles(list);
      } catch (cause) {
        if (cancelled) return;
        setInitError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [service, initAttempt]);

  const retryInit = useCallback(
    () => setInitAttempt((attempt) => attempt + 1),
    [],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      activeProfile,
      profiles,
      repositories,
      initError,
      retryInit,
      async createProfile(displayName, timezone) {
        const profile = await service.createProfile(displayName, timezone);
        setProfiles(await service.listProfiles());
        return profile;
      },
      async switchToProfile(profileId) {
        const profile = await service.switchToProfile(profileId);
        setActiveProfile(profile);
        setProfiles(await service.listProfiles());
      },
      async renameProfile(profileId, displayName) {
        const updated = await service.renameProfile(profileId, displayName);
        setProfiles(await service.listProfiles());
        setActiveProfile((current) =>
          current?.id === profileId ? updated : current,
        );
      },
      async updateProfileSettings(profileId, settings) {
        const updated = await service.updateSettings(profileId, settings);
        setProfiles(await service.listProfiles());
        setActiveProfile((current) =>
          current?.id === profileId ? updated : current,
        );
      },
      async refreshProfiles() {
        setProfiles(await service.listProfiles());
      },
      async deleteProfile(profileId) {
        const wasActive = activeProfile?.id === profileId;
        await service.deleteProfile(profileId);
        const remaining = await service.listProfiles();
        setProfiles(remaining);
        if (wasActive) {
          // Re-run the same auto-open/picker decision resolveInitialProfile
          // makes on launch: one profile left -> open it; several with no
          // remembered choice, or none left -> show the picker again.
          setActiveProfile(await service.resolveInitialProfile());
        }
      },
    }),
    [service, repositories, activeProfile, profiles, initError, retryInit],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfileContext(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfileContext must be used within a ProfileProvider");
  }
  return context;
}
