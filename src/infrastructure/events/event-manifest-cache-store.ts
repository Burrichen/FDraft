import type { EventManifest } from "@/domain/events/event-manifest-schema";
import { parseEventManifest } from "@/domain/events/event-manifest-schema";

/**
 * The locally-cached copy of an event's remote manifest — deliberately
 * INSTALLATION-level, not per-profile (same rationale as
 * `update-preference-store.ts`/`active-profile-pointer.ts`: a global
 * curated-film list has nothing to do with which local profile is active,
 * and re-fetching per profile switch would be wasteful and pointless).
 * Losing this is harmless — worst case, FDraft re-fetches or falls back
 * to the bundled default (see `january-manifest-service.ts`).
 *
 * Generic over `T` (see docs/updates, "PROMPT 19 — HALLOWEEN DRAFT
 * MECHANICS") so Halloween's differently-shaped two-list manifest
 * (`HalloweenManifest`) can reuse this exact storage mechanism instead of
 * a duplicate cache-store class — the eventId-keyed localStorage scheme
 * already has nothing January-specific about it. Defaults to
 * `EventManifest` so every pre-existing January call site keeps compiling
 * unchanged; only `LocalStorageEventManifestCacheStore`'s constructor now
 * takes an explicit `parse` function rather than hardcoding
 * `parseEventManifest` internally.
 */
export interface CachedEventManifest<T = EventManifest> {
  manifest: T;
  /** ISO 8601 — when this copy was fetched, for staleness checks. */
  fetchedAt: string;
}

export interface EventManifestCacheStore<T = EventManifest> {
  get(eventId: string): CachedEventManifest<T> | null;
  set(eventId: string, cached: CachedEventManifest<T>): void;
}

const KEY_PREFIX = "fdraft:event-manifest-cache:";

export class LocalStorageEventManifestCacheStore<
  T = EventManifest,
> implements EventManifestCacheStore<T> {
  constructor(
    private readonly parse: (
      value: unknown,
    ) => T | null = parseEventManifest as unknown as (
      value: unknown,
    ) => T | null,
  ) {}

  get(eventId: string): CachedEventManifest<T> | null {
    const raw = window.localStorage.getItem(KEY_PREFIX + eventId);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as {
        manifest?: unknown;
        fetchedAt?: unknown;
      };
      const manifest = this.parse(parsed.manifest);
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

  set(eventId: string, cached: CachedEventManifest<T>): void {
    window.localStorage.setItem(KEY_PREFIX + eventId, JSON.stringify(cached));
  }
}

/** An in-memory stand-in for tests and any environment without `window`. */
export class InMemoryEventManifestCacheStore<
  T = EventManifest,
> implements EventManifestCacheStore<T> {
  private store = new Map<string, CachedEventManifest<T>>();

  get(eventId: string): CachedEventManifest<T> | null {
    return this.store.get(eventId) ?? null;
  }

  set(eventId: string, cached: CachedEventManifest<T>): void {
    this.store.set(eventId, cached);
  }
}
