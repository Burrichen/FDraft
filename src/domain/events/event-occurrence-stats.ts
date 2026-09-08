import { getEventDefinition } from "./event-registry";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";

/**
 * One Event occurrence's compact participation summary for the Stats page
 * (see docs/updates, "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE
 * AUDIT" §9: "HALLOWEEN 2026 / Films watched 8/10 / Haunted Points earned
 * 8 / Status Completed"). Derived entirely from persisted Draft/DraftItem
 * records — there is no per-award ledger (see `PointBalanceRecord`'s own
 * doc comment: a single mutable running total, not event-scoped history),
 * so "currency earned this occurrence" is computed by counting items whose
 * `eventRewardGrantedAt` is non-null and multiplying by the event's
 * `pointsPerFilm` (§8, "where practical" — always 1 today for every
 * registered event, but this stays correct if that ever changes).
 */
export interface EventOccurrenceStat {
  eventId: string;
  eventName: string;
  /** The real-world calendar year this occurrence happened in — never today's date; see `DraftRecord.eventOccurrenceYear`'s own doc comment on why. */
  occurrenceYear: number;
  currencyLabel: string;
  totalFilms: number;
  watchedFilms: number;
  currencyEarned: number;
  /**
   * "In Progress" if any Draft in this occurrence is still `"active"`,
   * else "Completed" if any is `"archived"` (every item resolved), else
   * "Expired" (the occurrence closed with items unresolved) — mirrors the
   * exact status distinction `listHistorical`/the History page already
   * make from these same two fields, never inferred from watched counts
   * alone (an expired occurrence must not be presented as "Completed" just
   * because it happens to have 0 unwatched items outstanding by chance —
   * see §6).
   */
  status: "In Progress" | "Completed" | "Expired";
}

/**
 * Groups every Event-sourced Draft (active + historical) by
 * `sourceEventId` + `eventOccurrenceYear` and reduces each group to one
 * compact stat. A normal (`sourceEventId: null`) Draft is never included.
 * A Draft with no `eventOccurrenceYear` (pre-migration legacy record) is
 * skipped rather than guessed at — see task §1, "never inferred from the
 * current date."
 */
export function computeEventOccurrenceStats(
  drafts: readonly DraftRecord[],
  itemsByDraftId: ReadonlyMap<string, readonly DraftItemRecord[]>,
): EventOccurrenceStat[] {
  const groups = new Map<string, DraftRecord[]>();
  for (const draft of drafts) {
    if (!draft.sourceEventId || draft.eventOccurrenceYear === null) {
      continue;
    }
    const key = `${draft.sourceEventId}:${draft.eventOccurrenceYear}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(draft);
    } else {
      groups.set(key, [draft]);
    }
  }

  const stats: EventOccurrenceStat[] = [];
  for (const [, groupDrafts] of groups) {
    const eventId = groupDrafts[0].sourceEventId;
    const occurrenceYear = groupDrafts[0].eventOccurrenceYear;
    if (!eventId || occurrenceYear === null) {
      continue;
    }
    const event = getEventDefinition(eventId);
    if (!event) {
      continue;
    }

    let totalFilms = 0;
    let watchedFilms = 0;
    let rewardedItems = 0;
    let hasActive = false;
    let hasArchived = false;
    for (const draft of groupDrafts) {
      if (draft.status === "active") hasActive = true;
      if (draft.status === "archived") hasArchived = true;
      const items = itemsByDraftId.get(draft.id) ?? [];
      totalFilms += items.length;
      for (const item of items) {
        if (item.isCompleted) watchedFilms += 1;
        if (item.eventRewardGrantedAt) rewardedItems += 1;
      }
    }

    stats.push({
      eventId,
      eventName: event.name,
      occurrenceYear,
      // Every currently-registered event with a real ending (January/
      // Halloween/Christmas) declares its own `currency` — an event that
      // doesn't (e.g. a future placeholder with no per-film currency of
      // its own) never stamps `eventRewardGrantedAt` in the first place,
      // so `rewardedItems` is always 0 here; the fallbacks just keep this
      // function total and typesafe rather than assuming every event has one.
      currencyLabel: event.currency?.label ?? "Points",
      totalFilms,
      watchedFilms,
      currencyEarned: rewardedItems * (event.currency?.pointsPerFilm ?? 0),
      status: hasActive ? "In Progress" : hasArchived ? "Completed" : "Expired",
    });
  }

  return stats.sort((a, b) => {
    if (a.occurrenceYear !== b.occurrenceYear) {
      return b.occurrenceYear - a.occurrenceYear;
    }
    return a.eventName.localeCompare(b.eventName);
  });
}
