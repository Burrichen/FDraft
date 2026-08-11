import type {
  FilmMetadataCandidateSummary,
  FilmMetadataLookupInput,
  FilmMetadataResult,
} from "@/domain/import/film-metadata-provider";

/**
 * Mirrors `src/app/api/metadata/route.ts`'s response shape exactly — see
 * that file's doc comment for the full status list. Collapsing every
 * outcome into "result or null" was the UX half of the metadata-matching
 * bugfix (see docs/product-spec.md): the queue and UI need to be able to
 * tell "genuinely not found" apart from "multiple plausible matches",
 * "no provider configured", "rate limited", and "provider is down" —
 * each of those wants different handling and a different message.
 */
export type RemoteMetadataLookupResult =
  | { status: "matched"; providerId: string; result: FilmMetadataResult }
  | { status: "not-found"; providerId: string }
  | {
      status: "ambiguous";
      providerId: string;
      candidates: FilmMetadataCandidateSummary[];
    }
  | { status: "not-configured" }
  | { status: "rate-limited"; providerId: string; retryAfterMs?: number }
  | { status: "provider-error"; providerId: string; message: string }
  | { status: "invalid-import-data"; message: string };

const KNOWN_STATUSES = new Set<RemoteMetadataLookupResult["status"]>([
  "matched",
  "not-found",
  "ambiguous",
  "not-configured",
  "rate-limited",
  "provider-error",
  "invalid-import-data",
]);

function isRemoteMetadataLookupResult(
  value: unknown,
): value is RemoteMetadataLookupResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "string" &&
    KNOWN_STATUSES.has(
      (value as { status: RemoteMetadataLookupResult["status"] }).status,
    )
  );
}

export class MetadataNetworkError extends Error {
  constructor(cause: string) {
    super(`Could not reach the metadata provider: ${cause}`);
    this.name = "MetadataNetworkError";
  }
}

/**
 * Browser-side caller for `/api/metadata` (see docs/product-spec.md,
 * "METADATA BEHAVIOUR" — Prompt 9.5B). This, not a direct call to TMDB, is
 * the only way film metadata ever gets fetched — keeps the provider API
 * key server-side.
 *
 * `MetadataNetworkError` is reserved for the one case that genuinely means
 * "this browser can't reach our own server right now" (offline, DNS
 * failure, a response with no parseable body at all) — everything else
 * the route can report (rate-limited, provider-error, ambiguous,
 * not-configured, ...) comes back as a normal, structured
 * `RemoteMetadataLookupResult` for the caller to act on, not an exception.
 * Callers (`local-metadata-service.ts`) treat `MetadataNetworkError`
 * as the "you're probably offline" queue outcome, never a fatal error.
 */
export async function fetchFilmMetadataViaApi(
  input: FilmMetadataLookupInput,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<RemoteMetadataLookupResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl("/api/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (cause) {
    // fetch() throws (TypeError) for network-level failures, including
    // "the browser is offline" — exactly the case this must never let
    // crash the app or wipe anything already cached.
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

  if (!isRemoteMetadataLookupResult(body)) {
    throw new MetadataNetworkError(
      `HTTP ${response.status} (unexpected response shape)`,
    );
  }

  return body;
}
