import { formatInTimeZone } from "date-fns-tz";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { resolveUpcomingOccurrenceEnd } from "@/domain/events/event-availability";
import { getEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import { getEventDefinition } from "@/domain/events/event-registry";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { SystemClock, type Clock } from "@/domain/time/clock";
import { pickRandomFilm } from "@/domain/watchlist/random-pick";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";

type SingleFilmEventDraftRepos = {
  drafts: DraftRepository;
  films: FilmRepository;
  history: HistoryRepository;
  watchlist: WatchlistRepository;
  settings: SettingsRepository;
  profiles: ProfileRepository;
};

export type RollSingleFilmEventDraftErrorCode =
  "not_single_film_event" | "no_occurrence" | "no_candidates";

export type RollSingleFilmEventDraftOutcome =
  | {
      ok: true;
      draftId: string;
      /** `false` when this call found an existing Draft for this occurrence and rolled NOTHING — the idempotency signal every caller relies on (see this function's own doc comment). */
      created: boolean;
      /** The film this occurrence's Draft holds — the newly rolled one, or the already-persisted one. */
      filmId: string;
    }
  | {
      ok: false;
      error: RollSingleFilmEventDraftErrorCode;
      message: string;
    };

/**
 * Rolls — once, ever, per occurrence — the ONE random film that IS a
 * `EventDefinition.singleFilmDraft` event's whole Draft (see docs/updates,
 * "FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS"
 * §3-§8). Today only "F* You, It's January!" declares that flag, but
 * nothing here names it: the event id only ever selects which
 * `EventDefinition` to read and which curated pool/Draft slot to scope
 * to, so a future one-film event is new data, not new code — the same
 * rule every other part of this event system already follows.
 *
 * Called from `beginEventOptIn` (`event-opt-in.ts`), so JOIN alone
 * produces a fully-persisted Draft with its film already chosen — there is
 * deliberately no second "Create Draft" step, no difficulty, no sliders,
 * no categories, no Challenge allocation and no reroll affordance
 * anywhere. Also safe to call from a page as a recovery path for a profile
 * that joined while offline/before this mechanic existed; the idempotency
 * below is what makes that safe.
 *
 * IDEMPOTENCY (§7) is enforced against PERSISTED state, never a
 * component's lifecycle: `listAllForProfile` is scanned for a Draft this
 * event already owns, and this returns that Draft (`created: false`)
 * whenever one exists for the CURRENT occurrence year — regardless of its
 * status, so a Draft whose film was watched (`"archived"`) or whose window
 * closed (`"expired"`) can never be silently re-rolled either. An
 * `"active"` Draft from ANY year is likewise returned untouched (one
 * event's Draft slot only ever holds one Draft — see the Dual Draft
 * architecture), which is what makes reopening the page, restarting the
 * app, or leaving and rejoining always show the same film. §8's
 * occurrence-scoping falls out of the same check: next year's occurrence
 * is a different `eventOccurrenceYear`, so it rolls its own new film while
 * every historical Draft stays exactly as persisted.
 *
 * The pool is the event's single declared `contentPools` entry, resolved
 * to real local `FilmRecord`s by the generic
 * `loadEventCategoryFilmContent` pipeline at app start (see
 * `app-shell.tsx`) — title+year in, real film ids out, resolve-or-create,
 * with metadata enrichment handled there by the normal metadata system.
 * So an entry that has not resolved to a local film contributes nothing
 * and can never be rolled (§5: "avoid selecting an invalid/unresolved
 * entry when another usable candidate exists"), and nothing here ever
 * fabricates metadata. Films the profile has already watched are skipped
 * while any unwatched candidate remains, falling back to the full
 * resolved pool only when every curated film has been seen — an honest
 * roll beats no roll at all.
 *
 * `deps.clock` governs real persisted timestamps (`startedAt`/`createdAt`)
 * as it does everywhere else in this app, while the OCCURRENCE
 * calculations (deadline, `eventOccurrenceYear`) resolve through the
 * Admin-aware `getEffectiveEventDate` — the same separation
 * `createHalloweenLocalDraft`/`finalizeEventOneAtATimeDraft` already
 * observe, so Admin Event Testing can simulate a January without
 * corrupting any real timestamp.
 */
export async function rollSingleFilmEventDraft(
  repos: SingleFilmEventDraftRepos,
  params: {
    profileId: string;
    timezone: string;
    eventId: string;
    /**
     * Whether the profile reached this event through manual activation
     * rather than its real natural window — captured once, here, exactly
     * like every other Draft-creation path's own
     * `sourceEventManuallyEnabled`, so a later Settings change can never
     * retroactively change which currency this Draft awards (see
     * `resolveDraftCompletionReward`'s persisted-context rule).
     */
    sourceEventManuallyEnabled: boolean;
  },
  deps: {
    clock?: Clock;
    rng?: Rng;
    idGenerator?: IdGenerator;
    /** Pre-resolved Admin-aware "now" for occurrence math, when the caller already has one. Omitted, this resolves it through `getEffectiveEventDate` itself. */
    effectiveNow?: Date;
  } = {},
): Promise<RollSingleFilmEventDraftOutcome> {
  const clock = deps.clock ?? new SystemClock();
  const rng = deps.rng ?? createDefaultRng();
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const { profileId, timezone, eventId } = params;

  const event = getEventDefinition(eventId);
  if (!event?.singleFilmDraft) {
    return {
      ok: false,
      error: "not_single_film_event",
      message: "This event does not use a single-film Draft.",
    };
  }

  const effectiveNow =
    deps.effectiveNow ??
    (await getEffectiveEventDate(repos, profileId, { clock }));
  const eventOccurrenceYear = Number(
    formatInTimeZone(effectiveNow, timezone, "yyyy"),
  );

  const existing = (await repos.drafts.listAllForProfile(profileId)).filter(
    (draft) => draft.sourceEventId === eventId,
  );
  const alreadyRolled =
    existing.find(
      (draft) => (draft.eventOccurrenceYear ?? null) === eventOccurrenceYear,
    ) ?? existing.find((draft) => draft.status === "active");
  if (alreadyRolled) {
    const items = await repos.drafts.listItemsForDraft(alreadyRolled.id);
    return {
      ok: true,
      draftId: alreadyRolled.id,
      created: false,
      filmId: items[0]?.filmId ?? "",
    };
  }

  const deadlineAt = resolveUpcomingOccurrenceEnd(
    event.availability,
    effectiveNow,
    timezone,
  );
  if (!deadlineAt) {
    // Unreachable for a correctly-declared single-film event (the flag's
    // own doc comment requires `recurringMonthDayRange`) — reported
    // honestly rather than crashing a join if one is ever mis-declared.
    return {
      ok: false,
      error: "no_occurrence",
      message: "This event has no recurring occurrence to schedule against.",
    };
  }

  const filmId = await pickCuratedFilmId(repos, {
    profileId,
    eventId,
    // A single-film event declares exactly one pool (see
    // `EventDefinition.singleFilmDraft`); `contentPools[0]` is that pool,
    // read generically rather than by a hardcoded category name.
    categoryKey: event.contentPools?.[0]?.key ?? null,
    rng,
  });
  if (!filmId) {
    return {
      ok: false,
      error: "no_candidates",
      message: `${event.name} has no curated films available right now.`,
    };
  }

  const now = clock.now();
  const draftId = idGenerator.generate();
  const draft: DraftRecord = {
    id: draftId,
    profileId,
    // `"one-at-a-time"` is the one existing difficulty with NO fixed film
    // count (see `DIFFICULTIES`), which is what a deliberately-one-film
    // Draft needs — every numeric difficulty would misreport this Draft's
    // size as 5/8/10/12/20. Nothing about this exposes the One At A Time
    // BUILDER to a single-film event: that wizard is unreachable for one
    // (see `new-draft-form.tsx`/`one-at-a-time-route-view.tsx`), and this
    // value is purely the persisted "arbitrary count" marker every
    // count-reading surface already understands.
    difficulty: "one-at-a-time",
    // Not a real choice for a `fixedEventDeadline` event — see
    // `createHalloweenLocalDraft`'s identical note; `deadlineAt` above is
    // the event's own occurrence end, never a profile-chosen mode.
    timeMode: "timer",
    status: "active",
    totalFilms: 1,
    randomFilmCount: 1,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    timezone,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: eventId,
    sourceEventManuallyEnabled: params.sourceEventManuallyEnabled,
    rewardsGrantedAt: null,
    customName: null,
    eventOccurrenceYear,
    originalTargetFilms: 1,
    mutationHistory: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repos.drafts.createDraft(draft);

  // A curated film may or may not also be on this profile's own watchlist
  // — irrelevant to SELECTION (§17), but worth resolving here so BOTH
  // watch paths complete this item: `markLocalFilmWatched` (the Watchlist
  // page's own action, keyed by watchlist entry) when it is, and
  // `markLocalDraftItemWatchedWithoutEntry` (the Draft card's action for a
  // curated off-watchlist film, exactly like Halloween's Horror/Kitsch
  // items) when it isn't.
  const activeEntries = await repos.watchlist.listActiveEntries(profileId);
  const watchlistEntryId =
    activeEntries.find((entry) => entry.filmId === filmId)?.id ?? null;

  const item: DraftItemRecord = {
    id: idGenerator.generate(),
    draftId,
    filmId,
    watchlistEntryId,
    source: "random",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    entrySource: "event",
    enteredAt: now.toISOString(),
    eventRewardGrantedAt: null,
    eventCategoryKey: null,
    createdAt: now.toISOString(),
  };
  await repos.drafts.createItems([item]);

  return { ok: true, draftId, created: true, filmId };
}

/**
 * One random film id from this event's curated pool, or `null` when the
 * pool has nothing usable — see `rollSingleFilmEventDraft`'s doc comment
 * for the unresolved-entry and already-watched rules this implements.
 * Weighted flat (`1` each), matching the off-watchlist convention every
 * other curated Event pool already uses (see
 * `pickEventCategoryRandomFilm`): a curated list is an editorial pool, not
 * a watchlist whose `selectionWeight` history means anything here.
 */
async function pickCuratedFilmId(
  repos: { films: FilmRepository; history: HistoryRepository },
  params: {
    profileId: string;
    eventId: string;
    categoryKey: string | null;
    rng: Rng;
  },
): Promise<string | null> {
  if (!params.categoryKey) {
    return null;
  }
  const poolFilmIds =
    getEventCategoryFilmIds(params.eventId)[params.categoryKey] ?? [];
  if (poolFilmIds.length === 0) {
    return null;
  }

  const [films, watchedHistory] = await Promise.all([
    Promise.all(poolFilmIds.map((id) => repos.films.getById(id))),
    repos.history.listWatchedHistory(params.profileId),
  ]);
  // An id with no local `FilmRecord` behind it is an unresolved/invalid
  // candidate — never rolled, so January can never hand out a film it
  // cannot actually show.
  const resolved = films
    .filter((film): film is NonNullable<typeof film> => film !== null)
    .map((film) => film.id);
  if (resolved.length === 0) {
    return null;
  }

  const watchedFilmIds = new Set(watchedHistory.map((entry) => entry.filmId));
  const unwatched = resolved.filter((id) => !watchedFilmIds.has(id));
  const candidates = unwatched.length > 0 ? unwatched : resolved;

  return pickRandomFilm(
    candidates.map((id) => ({ id, weight: 1 })),
    params.rng,
  );
}
