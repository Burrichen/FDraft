/**
 * Structured, developer-facing logging for metadata resolution — the same
 * "[Tag]\nkey=value" convention `src/domain/challenges/logger.ts` already
 * established for challenge attempts, reused here rather than inventing a
 * second format (see docs/product-spec.md's metadata-matching bugfix
 * entry: "Keep technical details in developer logs rather than
 * overwhelming the normal UI.").
 *
 * Every call site passes plain, JSON-safe fields — never an API key or any
 * other secret, and this module never receives one to log by construction
 * (callers only ever pass film/match bookkeeping, not provider
 * credentials).
 */
export interface MetadataLogEvent {
  film: string;
  status:
    | "matched"
    | "ambiguous"
    | "not-found"
    | "provider-error"
    | "rate-limited"
    | "invalid-import-data";
  importYear?: number | null;
  query?: string;
  providerCandidates?: number;
  selectedCandidate?: string;
  confidence?: number;
  reason?: string;
  httpStatus?: number;
}

export function formatMetadataLog(event: MetadataLogEvent): string {
  const lines = ["[Metadata]", `film=${JSON.stringify(event.film)}`];
  if (event.importYear !== undefined)
    lines.push(`importYear=${event.importYear}`);
  if (event.query !== undefined)
    lines.push(`query=${JSON.stringify(event.query)}`);
  if (event.providerCandidates !== undefined)
    lines.push(`providerCandidates=${event.providerCandidates}`);
  if (event.selectedCandidate !== undefined)
    lines.push(`selectedCandidate=${JSON.stringify(event.selectedCandidate)}`);
  if (event.confidence !== undefined)
    lines.push(`confidence=${event.confidence}`);
  lines.push(`status=${event.status}`);
  if (event.reason !== undefined) lines.push(`reason=${event.reason}`);
  if (event.httpStatus !== undefined)
    lines.push(`httpStatus=${event.httpStatus}`);
  return lines.join("\n");
}

/** Logs to the console outside production — silent in production so a user's console isn't full of internals they can't act on. */
export function logMetadata(event: MetadataLogEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(formatMetadataLog(event));
  }
}
