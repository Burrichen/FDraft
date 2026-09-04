import { formatInTimeZone } from "date-fns-tz";
import { DIFFICULTIES } from "./difficulty";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import type { DraftDifficulty } from "@/repositories/records";

/**
 * The single source of truth for a draft's generated default name (see
 * docs/updates, "DRAFT NAMES": "The generated/default name of a draft
 * should now be `<Month> <Difficulty> Draft`"). Never persisted — always
 * computed fresh from fields the draft already has (`startedAt`,
 * `timezone`, `difficulty`), so there is exactly one place this format
 * lives and no risk of a stored default drifting out of sync with it.
 * "The month belonging to the draft itself" is evaluated in the draft's
 * own timezone, the same convention every other draft-date calculation
 * in this app already uses — never the system's current month.
 */
export function getDefaultDraftName(draft: {
  startedAt: string;
  timezone: string;
  difficulty: DraftDifficulty;
}): string {
  const month = formatInTimeZone(
    new Date(draft.startedAt),
    draft.timezone,
    "MMMM",
  );
  return `${month} ${DIFFICULTIES[draft.difficulty].label} Draft`;
}

/**
 * A Halloween Event Draft's canonical title — "Halloween <year> Draft" —
 * never `<Month> <Difficulty> Draft` or a custom name (see docs/updates,
 * "HALLOWEEN UI CLEANUP" §7-9: Halloween naming is canonical, not user- or
 * creation-month-derived). `year` prefers `DraftRecord.eventOccurrenceYear`
 * (captured once at creation time from the Admin-aware effective event
 * date, so Admin Event Testing simulating a different year — e.g. October
 * 2028 — produces "Halloween 2028 Draft" even though the real system clock
 * disagrees) and falls back to `startedAt`'s own calendar year, in the
 * draft's own timezone, for a draft created before that field existed —
 * correct by construction for every draft ever created under the real
 * clock (Halloween's window never crosses a year boundary), and exactly
 * what fixes an existing active Beta draft's display without requiring it
 * to be recreated (§8).
 */
export function getHalloweenDraftDisplayName(draft: {
  startedAt: string;
  timezone: string;
  eventOccurrenceYear: number | null;
}): string {
  const year =
    draft.eventOccurrenceYear ??
    Number(formatInTimeZone(new Date(draft.startedAt), draft.timezone, "yyyy"));
  return `Halloween ${year} Draft`;
}

/**
 * What a draft is actually called anywhere it's displayed — a custom name
 * (see `DraftRecord.customName`) if one is set, otherwise the generated
 * default. The one function every UI surface (Active Draft, Draft
 * History, Recently Watched's draft origin, etc.) should read a draft's
 * name through, so "clearing the custom name restores the generated
 * default" falls out of this for free rather than needing its own logic.
 *
 * A Halloween Event Draft is canonical (see `getHalloweenDraftDisplayName`)
 * regardless of `customName` — the rename UI is itself hidden for these
 * drafts (see `DraftLifecycleView`), so a non-`null` `customName` here can
 * only be leftover from before that restriction existed, and must not
 * resurface a stale `<Month> <Difficulty> Draft`-era name or a one-off
 * custom title in place of the canonical one.
 */
export function getDraftDisplayName(draft: {
  customName: string | null;
  startedAt: string;
  timezone: string;
  difficulty: DraftDifficulty;
  sourceEventId: string | null;
  eventOccurrenceYear: number | null;
}): string {
  if (draft.sourceEventId === HALLOWEEN_EVENT_ID) {
    return getHalloweenDraftDisplayName(draft);
  }
  return draft.customName ?? getDefaultDraftName(draft);
}
