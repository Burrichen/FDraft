import type { FilmMetadataCandidateDetail } from "@/domain/import/film-metadata-provider";
import { MetadataNetworkError } from "./remote-metadata-client";
import {
  isDesktopRuntime,
  searchFilmMetadataCandidatesViaTauri,
} from "./tauri-metadata-transport";

/** See `remote-metadata-client.ts`'s identical constant for the full rationale — a hung `/api/metadata/search` response must not be able to hang this fetch forever. */
const FETCH_TIMEOUT_MS = 30_000;

/** Mirrors `src/app/api/metadata/search/route.ts`'s response shape exactly — see that file's doc comment for the full status list. */
export type RemoteMetadataSearchResult =
  | {
      status: "ok";
      providerId: string;
      candidates: FilmMetadataCandidateDetail[];
    }
  | { status: "not-configured" }
  | { status: "not-supported"; providerId: string }
  | { status: "rate-limited"; providerId: string; retryAfterMs?: number }
  | { status: "provider-error"; providerId: string; message: string }
  | { status: "invalid-import-data"; message: string };

const KNOWN_STATUSES = new Set<RemoteMetadataSearchResult["status"]>([
  "ok",
  "not-configured",
  "not-supported",
  "rate-limited",
  "provider-error",
  "invalid-import-data",
]);

function isRemoteMetadataSearchResult(
  value: unknown,
): value is RemoteMetadataSearchResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "string" &&
    KNOWN_STATUSES.has(
      (value as { status: RemoteMetadataSearchResult["status"] }).status,
    )
  );
}

/**
 * Browser-side caller for `/api/metadata/search` (see docs/product-spec.md,
 * "UNRESOLVED METADATA RESOLUTION") — powers both "Possible matches" (the
 * imported title/year, searched automatically) and "Search metadata" (a
 * user-edited title/year) on the Unresolved Metadata screen. Same
 * network-error contract as `fetchFilmMetadataViaApi`: `MetadataNetworkError`
 * only for "this browser can't reach our own server right now", everything
 * else the route can report comes back as a structured result.
 */
export async function searchFilmMetadataCandidatesViaApi(
  input: { title: string; releaseYear: number | null },
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<RemoteMetadataSearchResult> {
  if (isDesktopRuntime()) {
    return searchFilmMetadataCandidatesViaTauri(input);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl("/api/metadata/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new MetadataNetworkError(
      cause instanceof Error ? cause.message : "network error",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MetadataNetworkError(
      `HTTP ${response.status} (no readable response body)`,
    );
  }

  if (!isRemoteMetadataSearchResult(body)) {
    throw new MetadataNetworkError(
      `HTTP ${response.status} (unexpected response shape)`,
    );
  }

  return body;
}
