/**
 * Validates and normalizes a profile's stored IANA timezone (see
 * docs/product-spec.md, "COMPLETE PRODUCT AUDIT" — an unrecognized
 * timezone string used to crash Calendar Mode draft creation and marking
 * a film watched: `date-fns-tz`'s `toZonedTime`/`fromZonedTime` silently
 * return `Invalid Date` for an unknown zone, and `formatInTimeZone`
 * throws a `RangeError` outright).
 *
 * A profile is always created with a real zone from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`, so this can only
 * ever matter for a value that arrived from OUTSIDE that path — a
 * hand-edited or corrupted backup file, or a legacy Supabase export.
 */

/**
 * `Intl.DateTimeFormat` throws a `RangeError` at construction for a
 * syntactically-invalid or genuinely unrecognized IANA zone — the
 * authoritative check against the runtime's own timezone database,
 * unlike a regex that can only validate shape (e.g. it would accept the
 * well-formed but nonexistent "Europe/Nonexistent").
 */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a possibly-invalid/unrecognized timezone to one the runtime
 * can actually use, falling back to the CURRENT device's own timezone
 * (the same source a profile's timezone is normally created from) rather
 * than a fixed value like "UTC" — the least surprising choice for data
 * that arrived from an import/restore. Every reader of a profile's
 * `timezone` field that didn't just validate it itself (e.g. any restore
 * or migration boundary) should route through this rather than trusting
 * the stored value directly.
 */
export function resolveProfileTimezone(value: unknown): string {
  if (isValidTimezone(value)) {
    return value;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
