/**
 * Remembers which profile was last open, so the app can reopen it on the
 * next launch instead of always showing the picker (see
 * docs/product-spec.md, "LOCAL PROFILES REPLACE REMOTE ACCOUNTS"). One of
 * two deliberate uses of `localStorage` in the app (the other is
 * `PersistentStorageRequester`'s one-time-ever flag) — a single string,
 * not user data, and losing it is harmless (worst case: the picker shows up
 * once more than strictly necessary). Everything that actually matters
 * (profiles, watchlists, drafts, history, settings) lives in the local
 * database instead (see docs/product-spec.md, "LOCAL DATABASE" — "Do NOT
 * store the main FDraft dataset in localStorage").
 *
 * Behind an interface, like everything else touching a browser API, so
 * application code (`src/application/profiles/profile-service.ts`) and its
 * tests never depend on `window.localStorage` existing.
 */
export interface ActiveProfilePointer {
  get(): string | null;
  set(profileId: string): void;
  clear(): void;
}

const STORAGE_KEY = "fdraft:last-active-profile-id";

export class LocalStorageActiveProfilePointer implements ActiveProfilePointer {
  get(): string | null {
    return window.localStorage.getItem(STORAGE_KEY);
  }

  set(profileId: string): void {
    window.localStorage.setItem(STORAGE_KEY, profileId);
  }

  clear(): void {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/** An in-memory stand-in for tests and any environment without `window` (e.g. server-rendered contexts that never call this in practice, but must still be able to import this module safely). */
export class InMemoryActiveProfilePointer implements ActiveProfilePointer {
  private profileId: string | null = null;

  get(): string | null {
    return this.profileId;
  }

  set(profileId: string): void {
    this.profileId = profileId;
  }

  clear(): void {
    this.profileId = null;
  }
}
