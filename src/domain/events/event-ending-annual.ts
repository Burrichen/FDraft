/**
 * Pure "annual occurrence number" arithmetic for an Event-ending's
 * secondary message (see docs/updates, "EVENT SYSTEM — EVENT-OVER
 * EXPERIENCE" §10) — e.g. Halloween's first occurrence, 2026, is annual
 * occurrence #1 ("1st annual"), 2027 is #2 ("2nd annual"), and so on.
 * Entirely generic — nothing here knows about Halloween specifically;
 * `EventDefinition.ending.foundingYear` is what a real event supplies to
 * anchor the count (see `event-definition.ts`).
 */

/** Standard English ordinal suffix, including the 11th/12th/13th exception (never "1th"/"2th"/"3th" and never "11st"/"12nd"/"13rd"). */
export function getOrdinalSuffix(n: number): "st" | "nd" | "rd" | "th" {
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }
  switch (Math.abs(n) % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** e.g. `formatOrdinal(21)` -> `"21st"`. */
export function formatOrdinal(n: number): string {
  return `${n}${getOrdinalSuffix(n)}`;
}

/**
 * `occurrenceYear - foundingYear + 1` — 2026 is occurrence #1 for an event
 * founded in 2026. Returns `null` (rather than a nonsensical zero/negative
 * number) whenever `occurrenceYear` predates `foundingYear` — a defensive
 * case that shouldn't occur in practice (an occurrence key can't exist
 * before an event's first real year), but Admin EventClock testing can put
 * the effective date almost anywhere, and a corrupted/hand-edited backup
 * is always possible.
 */
export function computeEventAnnualNumber(
  occurrenceYear: number,
  foundingYear: number,
): number | null {
  if (!Number.isFinite(occurrenceYear) || !Number.isFinite(foundingYear)) {
    return null;
  }
  const annualNumber =
    Math.trunc(occurrenceYear) - Math.trunc(foundingYear) + 1;
  return annualNumber >= 1 ? annualNumber : null;
}

/**
 * Resolves an Event-ending's `secondaryMessageTemplate` (see
 * `event-definition.ts`'s `EventEndingContent`) against a real occurrence
 * year — substitutes the single `{ordinal}` placeholder with the computed
 * annual number's ordinal form (e.g. `"1st"`). Returns `null` whenever
 * there's nothing to show: no template configured, no `foundingYear`
 * anchor, no occurrence year to compute against, or the year predates
 * `foundingYear` (see `computeEventAnnualNumber`) — every one of these is a
 * safe "omit the secondary line" signal, never an error.
 */
export function resolveEventEndingSecondaryMessage(
  ending: {
    secondaryMessageTemplate?: string | null;
    foundingYear?: number | null;
  },
  occurrenceYear: number | null,
): string | null {
  if (!ending.secondaryMessageTemplate) {
    return null;
  }
  if (ending.foundingYear === undefined || ending.foundingYear === null) {
    return null;
  }
  if (occurrenceYear === null) {
    return null;
  }
  const annualNumber = computeEventAnnualNumber(
    occurrenceYear,
    ending.foundingYear,
  );
  if (annualNumber === null) {
    return null;
  }
  return ending.secondaryMessageTemplate.replace(
    "{ordinal}",
    formatOrdinal(annualNumber),
  );
}
