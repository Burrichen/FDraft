import { z } from "zod";

/**
 * The shape of a remotely-published event manifest (see docs/updates,
 * "GLOBAL CURATED JANUARY LIST" / "REMOTE MANIFEST BEHAVIOUR") — a small,
 * versioned, publicly-hosted JSON file an author edits directly (see
 * `src/domain/events/manifests/README.md`) to add/remove curated films
 * without shipping a new FDraft release. This is UNTRUSTED external
 * input — always `safeParse`, never `.parse` — mirroring the same
 * defensive conventions `backup-schema.ts` already established for the
 * other untrusted-data boundary in this app (bounded strings/arrays,
 * never throwing on malformed input).
 *
 * Per-film identity prefers the project's own real provider id (`tmdbId`
 * — TMDB is the only configured metadata provider; see
 * `src/domain/import/providers/tmdb-provider.ts`), then falls back to
 * `letterboxdSlug`, then `title`/`year` — see
 * `src/application/events/resolve-manifest-film-ids.ts` for the matching
 * logic that consumes these in that priority order.
 */
export const eventManifestFilmSchema = z.object({
  tmdbId: z.string().trim().min(1).max(50).nullable().optional(),
  letterboxdSlug: z.string().trim().min(1).max(200).nullable().optional(),
  title: z.string().trim().min(1).max(300),
  year: z.number().int().min(1870).max(2100).nullable().optional(),
});

export const eventManifestSchema = z.object({
  schemaVersion: z.literal(1),
  /** Which event this manifest is for — matched against the event's own registry id (e.g. `F_YOU_ITS_JANUARY_EVENT_ID`) by the caller, not by this schema. */
  event: z.string().trim().min(1).max(100),
  /** ISO 8601 — a loose format check (not `.datetime()`) matching `backup-schema.ts`'s own convention for external date strings. */
  updatedAt: z.string().trim().min(1).max(50),
  films: z.array(eventManifestFilmSchema).max(2000),
});

export type EventManifestFilm = z.infer<typeof eventManifestFilmSchema>;
export type EventManifest = z.infer<typeof eventManifestSchema>;

/** `null` for anything malformed — every caller treats that exactly like "no manifest available" and falls back accordingly; nothing here ever throws. */
export function parseEventManifest(value: unknown): EventManifest | null {
  const result = eventManifestSchema.safeParse(value);
  return result.success ? result.data : null;
}
