/**
 * Structured, developer-facing logging for the metadata resolution
 * pipeline — see docs/product-spec.md, "METADATA MATCHER AUDIT",
 * "METADATA DEBUGGING". Every automatic match/search decision logs the
 * full candidate trail (not just the winner), so a developer can see
 * exactly why a film matched, was left ambiguous, or came back
 * unresolved — never a single opaque "no match".
 *
 * Every call site passes plain, JSON-safe fields — never an API key or
 * any other secret, and this module never receives one to log by
 * construction (callers only ever pass film/match bookkeeping, not
 * provider credentials).
 */

/** See `MetadataUnresolvedReason` in `film-metadata-matching.ts` for the matching-level reasons; the remaining two describe outcomes that never reach the scorer at all. */
export type MetadataResolutionReason =
  | "no_candidates"
  | "multiple_high_confidence_candidates"
  | "title_confidence_too_low"
  | "year_conflict"
  | "missing_import_title"
  | "provider_identifier_conflict";

export interface MetadataLogCandidate {
  title: string;
  year: number | null;
  score: number;
}

export interface MetadataResolutionLogEvent {
  importedTitle: string;
  importedYear?: number | null;
  candidates?: MetadataLogCandidate[];
  decision: "matched" | "unresolved" | "failed" | "manual-search";
  providerId?: string;
  reason?: MetadataResolutionReason;
  httpStatus?: number;
}

export function formatMetadataResolutionLog(
  event: MetadataResolutionLogEvent,
): string {
  const lines = [
    "[MetadataResolution]",
    `importedTitle=${JSON.stringify(event.importedTitle)}`,
  ];
  if (event.importedYear !== undefined) {
    lines.push(`importedYear=${event.importedYear}`);
  }

  const candidates = event.candidates ?? [];
  lines.push("", `candidateCount=${candidates.length}`);
  candidates.forEach((candidate, index) => {
    lines.push(
      "",
      `candidate[${index}]:`,
      `title=${JSON.stringify(candidate.title)}`,
      `year=${candidate.year}`,
      `score=${candidate.score}`,
    );
  });

  lines.push("", `decision=${event.decision}`);
  if (event.providerId !== undefined) {
    lines.push(`providerId=${event.providerId}`);
  }
  if (event.reason !== undefined) {
    lines.push(`reason=${event.reason}`);
  }
  if (event.httpStatus !== undefined) {
    lines.push(`httpStatus=${event.httpStatus}`);
  }
  return lines.join("\n");
}

/** Logs to the console outside production — silent in production so a user's console isn't full of internals they can't act on. */
export function logMetadataResolution(event: MetadataResolutionLogEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(formatMetadataResolutionLog(event));
  }
}
