import { retryMetadataForFilms } from "@/application/metadata/local-metadata-service";
import {
  parseHalloweenManifest,
  type HalloweenManifest,
} from "@/domain/events/halloween-manifest-schema";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import bundledDefaultManifestJson from "@/domain/events/manifests/halloween.json";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { EventManifestCacheStore } from "@/infrastructure/events/event-manifest-cache-store";
import type { FilmRepository } from "@/repositories/film-repository";
import type { UnresolvedMetadataRepository } from "@/repositories/unresolved-metadata-repository";
import { resolveOrCreateHalloweenManifestFilms } from "./resolve-or-create-halloween-films";

/**
 * The bundled, small-but-non-empty fallback manifest shipped in every
 * build — Prompt 19 explicitly asks for "a small valid bundled
 * fallback/testing list where required," unlike January's empty-by-default
 * file, since Halloween's Horror/Kitsch pools ARE the draft pool rather
 * than an additive eligibility bonus, so a genuinely empty fallback would
 * leave a Halloween Draft with nothing to draw from at all offline.
 */
const BUNDLED_DEFAULT_MANIFEST: HalloweenManifest = (() => {
  const parsed = parseHalloweenManifest(bundledDefaultManifestJson);
  if (!parsed) {
    // The bundled file is committed to this repo and covered by
    // `halloween-manifest-schema.test.ts` — reaching this would mean the
    // shipped build itself is broken, not a runtime/network condition.
    throw new Error("Bundled default Halloween manifest failed to validate");
  }
  return parsed;
})();

/** See `JANUARY_MANIFEST_STALE_AFTER_MS`'s doc comment — the same "comfortably longer than any single occurrence, short enough that a mid-week publish still reaches everyone within about a day" reasoning. */
export const HALLOWEEN_MANIFEST_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 8_000;

/** See `JANUARY_MANIFEST_URL`'s doc comment — this exact path inside this repo; editing `halloween.json` and pushing to `main` is the entire publish step. */
const HALLOWEEN_MANIFEST_URL =
  "https://raw.githubusercontent.com/Burrichen/FDraft/main/src/domain/events/manifests/halloween.json";

export type HalloweenManifestSource = "remote" | "cache" | "bundled-default";

export interface HalloweenManifestRefreshResult {
  manifest: HalloweenManifest;
  source: HalloweenManifestSource;
}

/**
 * The one place Halloween's manifest gets fetched, validated, cached, and
 * turned into the resolved local film ids `createHalloweenLocalDraft`
 * reads (see `halloween-manifest-overlay.ts`) — modeled directly on
 * `refreshJanuaryManifest`, same fetch → validate → cache → bundled-default
 * fallback order, same never-throws/never-blocks-startup contract.
 *
 * The one addition January's version doesn't need: after resolving the
 * manifest, every entry is resolved-or-created as a real local `FilmRecord`
 * (see `resolveOrCreateHalloweenManifestFilms` — January's whitelist never
 * creates films, only Halloween's pools do), and any NEWLY created film is
 * queued for metadata enrichment via the normal provider path
 * (`retryMetadataForFilms`) — never re-enriching an already-resolved film
 * on every refresh. Enrichment failures (offline, rate-limited, etc.) are
 * swallowed here: a newly-created film simply keeps its bare title/year
 * identity until enrichment eventually succeeds, exactly satisfying "when
 * offline, retain enough Event manifest identity for the Draft to remain
 * valid" — this must never be what breaks a manifest refresh.
 */
export async function refreshHalloweenManifest(
  deps: {
    cacheStore: EventManifestCacheStore<HalloweenManifest>;
    films: FilmRepository;
    unresolvedMetadata: UnresolvedMetadataRepository;
    clock?: Clock;
    fetchImpl?: typeof fetch;
  },
  options: { forceRefresh?: boolean } = {},
): Promise<HalloweenManifestRefreshResult> {
  const clock = deps.clock ?? new SystemClock();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cached = deps.cacheStore.get(HALLOWEEN_EVENT_ID);
  const isStale =
    !cached ||
    clock.now().getTime() - new Date(cached.fetchedAt).getTime() >
      HALLOWEEN_MANIFEST_STALE_AFTER_MS;

  let manifest: HalloweenManifest;
  let source: HalloweenManifestSource;

  if (options.forceRefresh || isStale) {
    const fetched = await tryFetchManifest(fetchImpl);
    if (fetched) {
      manifest = fetched;
      source = "remote";
      deps.cacheStore.set(HALLOWEEN_EVENT_ID, {
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

  const [horror, kitsch] = await Promise.all([
    resolveOrCreateHalloweenManifestFilms(
      { films: deps.films },
      manifest.horror,
    ),
    resolveOrCreateHalloweenManifestFilms(
      { films: deps.films },
      manifest.kitsch,
    ),
  ]);
  setHalloweenManifestFilmIds({
    horrorFilmIds: horror.resolvedFilmIds,
    kitschFilmIds: kitsch.resolvedFilmIds,
  });

  const newlyCreatedFilmIds = [
    ...horror.newlyCreatedFilmIds,
    ...kitsch.newlyCreatedFilmIds,
  ];
  if (newlyCreatedFilmIds.length > 0) {
    try {
      await retryMetadataForFilms(
        { films: deps.films, unresolvedMetadata: deps.unresolvedMetadata },
        newlyCreatedFilmIds,
      );
    } catch {
      // Enrichment is best-effort — a network/provider failure here must
      // never fail the manifest refresh itself (see doc comment above).
    }
  }

  return { manifest, source };
}

async function tryFetchManifest(
  fetchImpl: typeof fetch,
): Promise<HalloweenManifest | null> {
  try {
    const response = await fetchImpl(HALLOWEEN_MANIFEST_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const json: unknown = await response.json();
    return parseHalloweenManifest(json);
  } catch {
    // Offline, DNS failure, timeout, malformed JSON — all treated
    // identically: no remote manifest available right now.
    return null;
  }
}
