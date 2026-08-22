import {
  parseEventManifest,
  type EventManifest,
} from "@/domain/events/event-manifest-schema";

/**
 * The locally-cached copy of an event's remote manifest — deliberately
 * INSTALLATION-level, not per-profile (same rationale as
 * `update-preference-store.ts`/`active-profile-pointer.ts`: a global
 * curated-film list has nothing to do with which local profile is active,
 * and re-fetching per profile switch would be wasteful and pointless).
 * Losing this is harmless — worst case, FDraft re-fetches or falls back
 * to the bundled default (see `january-manifest-service.ts`).
 */
export interface CachedEventManifest {
  manifest: EventManifest;
  /** ISO 8601 — when this copy was fetched, for staleness checks. */
  fetchedAt: string;
}

export interface EventManifestCacheStore {
  get(eventId: string): CachedEventManifest | null;
  set(eventId: string, cached: CachedEventManifest): void;
}

const KEY_PREFIX = "fdraft:event-manifest-cache:";

export class LocalStorageEventManifestCacheStore implements EventManifestCacheStore {
  get(eventId: string): CachedEventManifest | null {
    const raw = window.localStorage.getItem(KEY_PREFIX + eventId);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as {
        manifest?: unknown;
        fetchedAt?: unknown;
      };
      const manifest = parseEventManifest(parsed.manifest);
      if (!manifest || typeof parsed.fetchedAt !== "string") {
        return null;
      }
      return { manifest, fetchedAt: parsed.fetchedAt };
    } catch {
      // Corrupted/foreign localStorage value — treated exactly like "no
      // cache yet," never a crash.
      return null;
    }
  }

  set(eventId: string, cached: CachedEventManifest): void {
    window.localStorage.setItem(KEY_PREFIX + eventId, JSON.stringify(cached));
  }
}

/** An in-memory stand-in for tests and any environment without `window`. */
export class InMemoryEventManifestCacheStore implements EventManifestCacheStore {
  private store = new Map<string, CachedEventManifest>();

  get(eventId: string): CachedEventManifest | null {
    return this.store.get(eventId) ?? null;
  }

  set(eventId: string, cached: CachedEventManifest): void {
    this.store.set(eventId, cached);
  }
}
