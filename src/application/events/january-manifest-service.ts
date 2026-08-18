import {
  parseEventManifest,
  type EventManifest,
} from "@/domain/events/event-manifest-schema";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
} from "@/domain/events/event-registry";
import { setJanuaryManifestCuratedFilmIds } from "@/domain/events/january-manifest-overlay";
import bundledDefaultManifestJson from "@/domain/events/manifests/fuck-you-its-january.json";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { EventManifestCacheStore } from "@/infrastructure/events/event-manifest-cache-store";
import type { FilmRepository } from "@/repositories/film-repository";
import { resolveManifestFilmIds } from "./resolve-manifest-film-ids";

/**
 * The bundled, empty-by-default manifest shipped in every build (see
 * docs/updates, "REMOTE MANIFEST BEHAVIOUR": "If no cached version exists
 * → use a bundled fallback/default manifest shipped with the
 * application"). Parsed once through the same untrusted-input schema as a
 * real remote fetch would be — this file is author-edited, not
 * hand-verified TypeScript, so it gets no special trust either.
 */
const BUNDLED_DEFAULT_MANIFEST: EventManifest = (() => {
  const parsed = parseEventManifest(bundledDefaultManifestJson);
  if (!parsed) {
    // The bundled file is committed to this repo and covered by
    // `event-manifest-schema.test.ts` — reaching this would mean the
    // shipped build itself is broken, not a runtime/network condition.
    throw new Error("Bundled default January manifest failed to validate");
  }
  return parsed;
})();

/** How long a cached manifest is trusted before a refresh attempts a real fetch again — see docs/updates, "MANIFEST REFRESH": "sensible caching," not "on every render." Comfortably longer than any single January occurrence, short enough that a mid-week publish still reaches everyone within about a day. */
export const JANUARY_MANIFEST_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 8_000;

/**
 * The live manifest URL — this exact path inside THIS repo (see
 * `src/domain/events/manifests/README.md`): editing that file and pushing
 * to `main` is the entire publish step, no new FDraft release required.
 * A small public/static GitHub-hosted JSON file, not a new backend (see
 * docs/updates, "Do NOT introduce: user accounts; a mandatory new
 * backend; Supabase; Docker server infrastructure").
 */
const JANUARY_MANIFEST_URL =
  "https://raw.githubusercontent.com/Burrichen/FDraft/main/src/domain/events/manifests/fuck-you-its-january.json";

export type JanuaryManifestSource = "remote" | "cache" | "bundled-default";

export interface JanuaryManifestRefreshResult {
  manifest: EventManifest;
  source: JanuaryManifestSource;
}

/**
 * The one place January's manifest gets fetched, validated, cached, and
 * turned into the overlay `getEventDefinition` reads (see
 * `january-manifest-overlay.ts`). NEVER throws and NEVER blocks whatever
 * called it for longer than `FETCH_TIMEOUT_MS` — a failed/offline fetch
 * silently falls back to the last good cache, then to the bundled
 * default, in that order (see docs/updates, "Remote manifest failure must
 * NEVER prevent FDraft starting").
 *
 * Skips the network entirely when the cache is still fresh — this is the
 * ONE place that decides "check when the event system initializes if
 * online and cache is stale" (see "MANIFEST REFRESH"); `forceRefresh`
 * bypasses that for the explicit Settings "Refresh event data" action.
 */
export async function refreshJanuaryManifest(
  deps: {
    cacheStore: EventManifestCacheStore;
    films: FilmRepository;
    clock?: Clock;
    fetchImpl?: typeof fetch;
  },
  options: { forceRefresh?: boolean } = {},
): Promise<JanuaryManifestRefreshResult> {
  const clock = deps.clock ?? new SystemClock();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cached = deps.cacheStore.get(F_YOU_ITS_JANUARY_EVENT_ID);
  const isStale =
    !cached ||
    clock.now().getTime() - new Date(cached.fetchedAt).getTime() >
      JANUARY_MANIFEST_STALE_AFTER_MS;

  let manifest: EventManifest;
  let source: JanuaryManifestSource;

  if (options.forceRefresh || isStale) {
    const fetched = await tryFetchManifest(fetchImpl);
    if (fetched) {
      manifest = fetched;
      source = "remote";
      deps.cacheStore.set(F_YOU_ITS_JANUARY_EVENT_ID, {
        manifest,
        fetchedAt: clock.now().toISOString(),
      });
    } else if (cached) {
      manifest = cached.manifest;
      source = "cache";
    } else {
      manifest = BUNDLED_DEFAULT_MANIFEST;
      source = "bundled-default";
    }
  } else {
    manifest = cached.manifest;
    source = "cache";
  }

  const curatedFilmIds = await resolveManifestFilmIds(
    { films: deps.films },
    manifest,
  );
  setJanuaryManifestCuratedFilmIds(curatedFilmIds);

  return { manifest, source };
}

async function tryFetchManifest(
  fetchImpl: typeof fetch,
): Promise<EventManifest | null> {
  try {
    const response = await fetchImpl(JANUARY_MANIFEST_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const json: unknown = await response.json();
    return parseEventManifest(json);
  } catch {
    // Offline, DNS failure, timeout, malformed JSON — all treated
    // identically: no remote manifest available right now.
    return null;
  }
}
