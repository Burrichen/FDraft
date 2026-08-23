import { z } from "zod";
import { eventManifestFilmSchema } from "./event-manifest-schema";

/**
 * Halloween's globally-curated Horror/Kitsch manifest (see docs/updates,
 * "PROMPT 19 — HALLOWEEN DRAFT MECHANICS"). Reuses the same per-film
 * identity shape (`tmdbId`/`letterboxdSlug`/`title`/`year`) January's
 * manifest already established — see `event-manifest-schema.ts` — rather
 * than duplicating it, since matching/dedup logic is identical either way.
 * Two lists instead of one `films` array: `horror` ("popular, iconic or
 * otherwise on-brand Horror films suitable for the Halloween Event") and
 * `kitsch` ("Halloween-themed, seasonal, campy, spooky, gothic or family
 * Halloween films which are not necessarily Horror") — see
 * `src/domain/events/manifests/README.md` for the full field-by-field
 * publishing documentation.
 *
 * UNTRUSTED external input, same as `eventManifestSchema` — always
 * `safeParse` via `parseHalloweenManifest`, never `.parse`.
 */
export const halloweenManifestSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.literal("halloween"),
  /** ISO 8601 — a loose format check (not `.datetime()`), matching `eventManifestSchema`'s own convention for external date strings. */
  updatedAt: z.string().trim().min(1).max(50),
  horror: z.array(eventManifestFilmSchema).max(2000),
  kitsch: z.array(eventManifestFilmSchema).max(2000),
});

export type HalloweenManifest = z.infer<typeof halloweenManifestSchema>;

/** `null` for anything malformed — every caller treats that exactly like "no manifest available" and falls back accordingly; nothing here ever throws. */
export function parseHalloweenManifest(
  value: unknown,
): HalloweenManifest | null {
  const result = halloweenManifestSchema.safeParse(value);
  return result.success ? result.data : null;
}
