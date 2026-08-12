import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  FilmMetadataAmbiguousError,
  FilmMetadataProviderError,
  nullFilmMetadataProvider,
  type FilmMetadataLookupInput,
  type FilmMetadataProvider,
} from "@/domain/import/film-metadata-provider";
import { createTmdbProvider } from "@/domain/import/providers/tmdb-provider";
import { isDesktopRuntime } from "@/infrastructure/tauri/desktop-runtime";
import type { RemoteMetadataLookupResult } from "./remote-metadata-client";
import type { RemoteMetadataSearchResult } from "./search-metadata-client";

export { isDesktopRuntime };

/**
 * The desktop half of "Application -> Metadata Service ->
 * environment-specific transport" (see docs/product-spec.md's Tauri
 * integration notes, "METADATA REQUESTS"). A packaged desktop app has no
 * hidden Next server to proxy through and hide `TMDB_API_KEY` behind — see
 * `src/app/api/metadata/route.ts`'s doc comment for why that route exists
 * at all. Under Tauri, the SAME `createTmdbProvider` (matching/ranking
 * logic completely unchanged — see docs/product-spec.md: "Do NOT couple
 * film matching or challenge logic directly to Tauri") runs client-side
 * instead, with two swaps at the network boundary only:
 *
 *  - `fetchImpl` is `@tauri-apps/plugin-http`'s `fetch` — the actual HTTP
 *    request executes in the Rust process (also how the narrow
 *    `http:default` capability scoped to TMDB's two hosts, rather than the
 *    whole internet, gets enforced — see `src-tauri/capabilities/default.json`).
 *  - the API key is fetched via IPC from a Rust command
 *    (`get_tmdb_api_key`, reading the same `.env.local`/`.env` the web
 *    build's Next server reads) rather than a Node-only env var read —
 *    keeping it out of the compiled JS bundle, at least.
 *
 * `remote-metadata-client.ts`/`search-metadata-client.ts` are the only
 * callers — the metadata feature's own network boundary is the only thing
 * in this file that knows a Tauri runtime exists (`isDesktopRuntime()`
 * itself lives in `src/infrastructure/tauri/desktop-runtime.ts` and is
 * re-exported here for those two callers' existing imports).
 */

let cachedProvider: Promise<FilmMetadataProvider> | null = null;

async function getProvider(): Promise<FilmMetadataProvider> {
  if (!cachedProvider) {
    cachedProvider = invoke<string | null>("get_tmdb_api_key").then((apiKey) =>
      apiKey
        ? createTmdbProvider({ apiKey, fetchImpl: tauriFetch })
        : nullFilmMetadataProvider,
    );
  }
  return cachedProvider;
}

export async function fetchFilmMetadataViaTauri(
  input: FilmMetadataLookupInput,
): Promise<RemoteMetadataLookupResult> {
  const provider = await getProvider();
  if (provider.id === "none") {
    return { status: "not-configured" };
  }

  try {
    const result = await provider.lookup(input);
    return result
      ? { status: "matched", providerId: provider.id, result }
      : { status: "not-found", providerId: provider.id };
  } catch (error) {
    if (error instanceof FilmMetadataAmbiguousError) {
      return {
        status: "ambiguous",
        providerId: provider.id,
        candidates: error.candidates,
      };
    }
    if (error instanceof FilmMetadataProviderError) {
      if (error.status === "rate-limited") {
        return {
          status: "rate-limited",
          providerId: provider.id,
          retryAfterMs: error.retryAfterMs,
        };
      }
      if (error.status === "invalid-import-data") {
        return { status: "invalid-import-data", message: error.message };
      }
      return {
        status: "provider-error",
        providerId: provider.id,
        message: error.message,
        httpStatus: error.httpStatus,
      };
    }
    return {
      status: "provider-error",
      providerId: provider.id,
      message:
        error instanceof Error ? error.message : "Metadata lookup failed",
    };
  }
}

export async function searchFilmMetadataCandidatesViaTauri(input: {
  title: string;
  releaseYear: number | null;
}): Promise<RemoteMetadataSearchResult> {
  const provider = await getProvider();
  if (provider.id === "none") {
    return { status: "not-configured" };
  }
  if (!provider.search) {
    return { status: "not-supported", providerId: provider.id };
  }

  try {
    const candidates = await provider.search(input.title, input.releaseYear);
    return { status: "ok", providerId: provider.id, candidates };
  } catch (error) {
    if (error instanceof FilmMetadataProviderError) {
      if (error.status === "rate-limited") {
        return {
          status: "rate-limited",
          providerId: provider.id,
          retryAfterMs: error.retryAfterMs,
        };
      }
      if (error.status === "invalid-import-data") {
        return { status: "invalid-import-data", message: error.message };
      }
      return {
        status: "provider-error",
        providerId: provider.id,
        message: error.message,
      };
    }
    return {
      status: "provider-error",
      providerId: provider.id,
      message:
        error instanceof Error ? error.message : "Metadata search failed",
    };
  }
}
