/**
 * Turns a challenge's `displayValue` (see docs/product-spec.md, "Challenge
 * Display": "For challenges with generated values, display those values" —
 * e.g. Minute Match's target minutes, World Cup's drawn countries) into
 * simple label/value pairs a card can render generically, without a
 * per-challenge display switch statement.
 *
 * Deliberately conservative: only plain scalars and short arrays of
 * scalars are shown. Some challenges (the two lottery challenges) put a
 * full per-film ticket breakdown array in `displayValue` for debugging —
 * that's exactly the kind of structure this must skip rather than dumping
 * onto a film card.
 */
export interface FormattedDisplayValueEntry {
  label: string;
  value: string;
}

const MAX_ARRAY_ITEMS_TO_DISPLAY = 6;

function humanizeKey(key: string): string {
  const withSpaces = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatPrimitive(value: unknown): string | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return null;
}

export function formatChallengeDisplayValue(
  displayValue: Record<string, unknown> | null | undefined,
): FormattedDisplayValueEntry[] {
  if (!displayValue) {
    return [];
  }

  const entries: FormattedDisplayValueEntry[] = [];
  for (const [key, rawValue] of Object.entries(displayValue)) {
    const primitive = formatPrimitive(rawValue);
    if (primitive !== null) {
      entries.push({ label: humanizeKey(key), value: primitive });
      continue;
    }

    if (
      Array.isArray(rawValue) &&
      rawValue.length > 0 &&
      rawValue.length <= MAX_ARRAY_ITEMS_TO_DISPLAY &&
      rawValue.every((item) => formatPrimitive(item) !== null)
    ) {
      entries.push({
        label: humanizeKey(key),
        value: rawValue.map((item) => String(item)).join(", "),
      });
    }
    // Anything else — nested objects, long arrays like the lottery ticket
    // breakdowns — is intentionally skipped.
  }
  return entries;
}
