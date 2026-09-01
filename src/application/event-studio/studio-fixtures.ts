import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { setEventSettings } from "@/application/events/event-settings-store";
import { setEventParticipation } from "@/application/events/event-participation-store";
import { computeOccurrenceKeyForEvent } from "@/application/events/event-discovery";
import {
  EVENT_DEFINITIONS,
  getEventDefinition,
} from "@/domain/events/event-registry";
import type { StudioPageId } from "@/domain/event-studio/studio-pages";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";
import type {
  DraftItemRecord,
  DraftRecord,
  FilmRecord,
  PointCurrency,
  WatchedHistoryRecord,
  WatchlistEntryRecord,
} from "@/repositories/records";

/**
 * Fixture seeding for the Event Studio preview (see docs/updates, "EVENT
 * STUDIO — PHASE 3" §5/§6) — builds a throwaway profile and exactly the
 * data one page/state combination needs, in a dedicated, caller-chosen
 * IndexedDB database. NEVER touches a real user's data: this module only
 * ever opens the database name it's given (always a `studio-preview-*`
 * name from `studio-preview-shell.tsx`, never the real `"fdraft"`/
 * `"fdraft-dev"` database), and every write here is a fresh row in that
 * fresh database — no real Draft, watch, participation, or history record
 * is ever read or mutated (see §6).
 *
 * Deliberately synchronous-looking but fully sequential/awaited — this
 * runs once per Studio preview load (see `loadStudioFixture`'s own doc
 * comment for the delete-then-recreate lifecycle), not on every render.
 */

export const STUDIO_FIXTURE_PROFILE_ID = "studio-preview-profile";
const FIXTURE_TIMEZONE = "UTC";

export interface StudioFixtureParams {
  presetId: string;
  pageId: StudioPageId;
  stateId: string;
}

export interface StudioFixtureResult {
  profileId: string;
  timezone: string;
  /**
   * True only for `pageId === "drafts"`, `stateId === "creation"` — the
   * real Drafts page has no inline creation UI of its own (it only links
   * to `/drafts/new`, see `DraftsPage`'s own "No active draft" empty
   * state), so `studio-preview-shell.tsx` renders `NewDraftView` (the real
   * `/drafts/new` route component) directly instead of the Drafts route's
   * own page for this one state.
   */
  renderNewDraftForm: boolean;
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function seedProfile(
  repos: Repositories,
  overrides: { adminMode?: boolean } = {},
): Promise<void> {
  await repos.profiles.create({
    id: STUDIO_FIXTURE_PROFILE_ID,
    displayName: "Preview Profile",
    createdAt: isoDaysFromNow(-30),
    lastOpenedAt: isoDaysFromNow(0),
    timezone: FIXTURE_TIMEZONE,
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: overrides.adminMode ?? false,
      halloweenPumpkinState: "carved",
    },
    dataVersion: 1,
  });
}

async function seedFilms(
  repos: Repositories,
  specs: { id: string; title: string; year: number }[],
): Promise<FilmRecord[]> {
  const films: FilmRecord[] = [];
  for (const spec of specs) {
    const film: FilmRecord = {
      id: spec.id,
      title: spec.title,
      releaseYear: spec.year,
      letterboxdSlug: spec.id,
      letterboxdUri: `https://letterboxd.com/film/${spec.id}/`,
      createdAt: isoDaysFromNow(-30),
      updatedAt: isoDaysFromNow(-30),
    };
    await repos.films.create(film);
    films.push(film);
  }
  return films;
}

const SAMPLE_FILM_TITLES: { title: string; year: number }[] = [
  { title: "The Watchtower", year: 2019 },
  { title: "Late Harvest", year: 2021 },
  { title: "A Quiet Signal", year: 2016 },
  { title: "Paper Lanterns", year: 2023 },
  { title: "The Long Dark", year: 2014 },
  { title: "Nine Rivers", year: 2020 },
  { title: "Static Bloom", year: 2018 },
  { title: "Winter's Ledge", year: 2022 },
  { title: "The Glass Orchard", year: 2017 },
  { title: "Low Tide", year: 2024 },
];

async function seedWatchlist(
  repos: Repositories,
  profileId: string,
  count: number,
  idPrefix = "wl-film",
): Promise<{ films: FilmRecord[]; entries: WatchlistEntryRecord[] }> {
  const specs = SAMPLE_FILM_TITLES.slice(0, count).map((sample, index) => ({
    id: `${idPrefix}-${index}`,
    title: sample.title,
    year: sample.year,
  }));
  const films = await seedFilms(repos, specs);
  const entries: WatchlistEntryRecord[] = [];
  for (const [index, film] of films.entries()) {
    const entry: WatchlistEntryRecord = {
      id: `${idPrefix}-entry-${index}`,
      profileId,
      filmId: film.id,
      dateAdded: isoDaysFromNow(-20 + index),
      position: index,
      isActive: true,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: null,
      removedReason: null,
      createdAt: isoDaysFromNow(-20 + index),
      updatedAt: isoDaysFromNow(-20 + index),
    };
    await repos.watchlist.createEntry(entry);
    entries.push(entry);
  }
  return { films, entries };
}

async function seedDraftWithItems(
  repos: Repositories,
  params: {
    profileId: string;
    draftId: string;
    sourceEventId: string | null;
    status: "active" | "expired";
    /** How many of the 3 seeded items are already watched. */
    completedCount: 0 | 1 | 2 | 3;
    idPrefix: string;
  },
): Promise<void> {
  const { films, entries } = await seedWatchlist(
    repos,
    params.profileId,
    3,
    params.idPrefix,
  );

  const draft: DraftRecord = {
    id: params.draftId,
    profileId: params.profileId,
    difficulty: "medium",
    timeMode: "calendar",
    status: params.status,
    totalFilms: films.length,
    randomFilmCount: films.length,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: isoDaysFromNow(-10),
    deadlineAt: isoDaysFromNow(params.status === "expired" ? -1 : 10),
    timezone: FIXTURE_TIMEZONE,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: params.sourceEventId,
    sourceEventManuallyEnabled: params.sourceEventId ? false : null,
    rewardsGrantedAt: null,
    customName: null,
    createdAt: isoDaysFromNow(-10),
    updatedAt: isoDaysFromNow(-1),
  };
  await repos.drafts.createDraft(draft);

  const items: DraftItemRecord[] = [];
  for (const [index, film] of films.entries()) {
    const entry = entries[index];
    const isCompleted = index < params.completedCount;
    let watchedHistoryId: string | null = null;
    if (isCompleted) {
      const history: WatchedHistoryRecord = {
        id: `${params.idPrefix}-watched-${index}`,
        profileId: params.profileId,
        filmId: film.id,
        watchlistEntryId: entry.id,
        source: "app_watchlist_action",
        watchedDate: isoDaysFromNow(-5 + index),
        createdAt: isoDaysFromNow(-5 + index),
      };
      await repos.history.addWatchedHistory(history);
      watchedHistoryId = history.id;
    }
    items.push({
      id: `${params.idPrefix}-item-${index}`,
      draftId: draft.id,
      filmId: film.id,
      watchlistEntryId: entry.id,
      source: "random",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: index,
      isCompleted,
      completedAt: isCompleted ? isoDaysFromNow(-5 + index) : null,
      watchedHistoryId,
      originFilmId: null,
      substitutionReason: null,
      createdAt: isoDaysFromNow(-10),
    });
  }
  await repos.drafts.createItems(items);
}

async function seedArchivedDraftWithHistory(
  repos: Repositories,
  params: { profileId: string; draftId: string; idPrefix: string },
): Promise<void> {
  const { films, entries } = await seedWatchlist(
    repos,
    params.profileId,
    3,
    params.idPrefix,
  );
  const draft: DraftRecord = {
    id: params.draftId,
    profileId: params.profileId,
    difficulty: "hard",
    timeMode: "timer",
    status: "archived",
    totalFilms: films.length,
    randomFilmCount: films.length,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: isoDaysFromNow(-40),
    deadlineAt: isoDaysFromNow(-10),
    timezone: FIXTURE_TIMEZONE,
    completedAt: isoDaysFromNow(-11),
    freeformAchievedRank: null,
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: isoDaysFromNow(-11),
    customName: null,
    createdAt: isoDaysFromNow(-40),
    updatedAt: isoDaysFromNow(-11),
  };
  await repos.drafts.createDraft(draft);

  const items: DraftItemRecord[] = [];
  for (const [index, film] of films.entries()) {
    const entry = entries[index];
    const history: WatchedHistoryRecord = {
      id: `${params.idPrefix}-watched-${index}`,
      profileId: params.profileId,
      filmId: film.id,
      watchlistEntryId: entry.id,
      source: "app_watchlist_action",
      watchedDate: isoDaysFromNow(-15 + index),
      createdAt: isoDaysFromNow(-15 + index),
    };
    await repos.history.addWatchedHistory(history);
    items.push({
      id: `${params.idPrefix}-item-${index}`,
      draftId: draft.id,
      filmId: film.id,
      watchlistEntryId: entry.id,
      source: "random",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: index,
      isCompleted: true,
      completedAt: history.watchedDate,
      watchedHistoryId: history.id,
      originFilmId: null,
      substitutionReason: null,
      createdAt: isoDaysFromNow(-40),
    });
  }
  await repos.drafts.createItems(items);
}

async function seedPointBalances(
  repos: Repositories,
  profileId: string,
  balances: Partial<Record<PointCurrency, number>>,
): Promise<void> {
  for (const [currency, total] of Object.entries(balances)) {
    if (total === undefined) continue;
    await repos.points.setBalance({
      profileId,
      currency: currency as PointCurrency,
      total,
      updatedAt: isoDaysFromNow(0),
    });
  }
}

/**
 * Builds a date guaranteed to fall inside (or, for `inside: false`, just
 * after) a `recurringMonthDayRange` event's natural window this calendar
 * year — the SAME generic `EventAvailability` shape `isEventAvailable`
 * reads, evaluated with plain UTC month/day arithmetic since the fixture
 * profile's own timezone is always `"UTC"` (see `FIXTURE_TIMEZONE`).
 * `null` for a manual-only event with no such window (Frontier, Signal
 * from Beyond) — there is nothing to simulate a date inside/outside of.
 */
function resolveFixtureEventDate(
  eventId: string,
  inside: boolean,
): Date | null {
  const event = getEventDefinition(eventId);
  const range = event?.availability.recurringMonthDayRange;
  if (!range) {
    return null;
  }
  const year = new Date().getUTCFullYear();
  if (inside) {
    return new Date(
      Date.UTC(year, range.startMonth - 1, range.startDay + 1, 12),
    );
  }
  // 5 days past the end boundary — JS Date normalizes month/day overflow
  // (e.g. 31 Jan + 5 rolls correctly into February), so this is safe even
  // for a range ending on the last day of its month.
  return new Date(Date.UTC(year, range.endMonth - 1, range.endDay + 5, 12));
}

/**
 * Seeds Admin Mode + the Event Date Override + `EventSettings` +
 * participation so the REAL event-discovery pipeline
 * (`getEventDiscovery`/`isOccurrenceActiveNow`/`resolveEventIntroCandidate`/
 * `resolveEventEndingCandidate`) naturally resolves this preset's event as
 * either currently joined-and-active, unanswered-and-available, or
 * joined-and-expired — exactly the mechanism a real profile would go
 * through, never a shortcut/mock of it (see §7: "Do not involve
 * production EventClock" — this uses the Admin-only simulated-clock path
 * that already exists for testing, not a second, fake one).
 */
async function seedEventOccurrence(
  repos: Repositories,
  profileId: string,
  eventId: string,
  participation: "unanswered" | "joined",
  inside: boolean,
): Promise<void> {
  const event = getEventDefinition(eventId);
  if (!event) return;
  const simulatedDate = resolveFixtureEventDate(eventId, inside);
  if (!simulatedDate) return;

  const profile = await repos.profiles.getById(profileId);
  if (profile) {
    await repos.profiles.update({
      ...profile,
      settings: { ...profile.settings, adminMode: true },
    });
  }
  await setEventDateOverride(repos, profileId, {
    enabled: true,
    eventId,
    simulatedDate: simulatedDate.toISOString(),
  });
  await setEventSettings(repos, profileId, {
    eventsEnabled: true,
    eventVisualsEnabled: true,
    activeEvent: eventId,
    manuallyEnabledEvents: event.manualActivationAllowed ? [eventId] : [],
  });

  if (participation === "joined") {
    const occurrenceKey = computeOccurrenceKeyForEvent(
      event,
      simulatedDate,
      FIXTURE_TIMEZONE,
    );
    if (occurrenceKey) {
      await setEventParticipation(repos, profileId, occurrenceKey, "joined");
    }
  }
}

/**
 * The one entry point `studio-preview-shell.tsx` calls before mounting the
 * preview iframe's content — deletes and fully recreates `databaseName`
 * (see docs/updates, "EVENT STUDIO — PHASE 3" §6: every preview load
 * starts from a clean, throwaway database, never accumulating state
 * across loads and never able to leak into a REAL database, since this
 * name is always a dedicated `studio-preview-*` one), then seeds exactly
 * what `pageId`/`stateId`/`presetId` need.
 */
export async function loadStudioFixture(
  databaseName: string,
  params: StudioFixtureParams,
): Promise<StudioFixtureResult> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  const profileId = STUDIO_FIXTURE_PROFILE_ID;
  let renderNewDraftForm = false;

  try {
    await seedProfile(repos);

    const eventId =
      params.presetId !== "default" && getEventDefinition(params.presetId)
        ? params.presetId
        : null;

    switch (params.pageId) {
      case "watchlist": {
        if (params.stateId === "populated") {
          await seedWatchlist(repos, profileId, 9, "watchlist-film");
        }
        break;
      }
      case "drafts": {
        if (params.stateId === "creation") {
          await seedWatchlist(repos, profileId, 6, "drafts-new-film");
          renderNewDraftForm = true;
        } else if (params.stateId === "active") {
          await seedDraftWithItems(repos, {
            profileId,
            draftId: "studio-active-draft",
            sourceEventId: null,
            status: "active",
            completedCount: 1,
            idPrefix: "draft-active",
          });
        } else if (params.stateId === "completed") {
          await seedDraftWithItems(repos, {
            profileId,
            draftId: "studio-expired-draft",
            sourceEventId: null,
            status: "expired",
            completedCount: 2,
            idPrefix: "draft-completed",
          });
        }
        break;
      }
      case "eventPage": {
        if (!eventId) break;
        if (params.stateId === "empty") {
          await seedEventOccurrence(
            repos,
            profileId,
            eventId,
            "unanswered",
            true,
          );
        } else if (params.stateId === "creation") {
          await seedEventOccurrence(repos, profileId, eventId, "joined", true);
        } else if (params.stateId === "active") {
          await seedEventOccurrence(repos, profileId, eventId, "joined", true);
          await seedDraftWithItems(repos, {
            profileId,
            draftId: "studio-event-active-draft",
            sourceEventId: eventId,
            status: "active",
            completedCount: 1,
            idPrefix: "event-draft-active",
          });
        } else if (params.stateId === "completed") {
          await seedEventOccurrence(repos, profileId, eventId, "joined", true);
          await seedDraftWithItems(repos, {
            profileId,
            draftId: "studio-event-expired-draft",
            sourceEventId: eventId,
            status: "expired",
            completedCount: 2,
            idPrefix: "event-draft-completed",
          });
        }
        break;
      }
      case "history": {
        if (params.stateId === "populated") {
          await seedArchivedDraftWithHistory(repos, {
            profileId,
            draftId: "studio-history-draft-1",
            idPrefix: "history-1",
          });
          await seedArchivedDraftWithHistory(repos, {
            profileId,
            draftId: "studio-history-draft-2",
            idPrefix: "history-2",
          });
        }
        break;
      }
      case "stats": {
        await seedArchivedDraftWithHistory(repos, {
          profileId,
          draftId: "studio-stats-draft-1",
          idPrefix: "stats-1",
        });
        await seedPointBalances(repos, profileId, {
          lifetime: 42,
          misery: 7,
          haunted: 13,
        });
        break;
      }
      case "settings": {
        if (params.stateId === "eventActive" && eventId) {
          await seedEventOccurrence(repos, profileId, eventId, "joined", true);
        }
        break;
      }
      case "profile": {
        break;
      }
      case "introModal": {
        if (eventId) {
          await seedEventOccurrence(
            repos,
            profileId,
            eventId,
            "unanswered",
            true,
          );
        }
        break;
      }
      case "endingModal": {
        if (eventId) {
          const definition = getEventDefinition(eventId);
          if (definition?.ending?.enabled) {
            await seedEventOccurrence(
              repos,
              profileId,
              eventId,
              "joined",
              false,
            );
          }
        }
        break;
      }
    }
  } finally {
    db.close();
  }

  return { profileId, timezone: FIXTURE_TIMEZONE, renderNewDraftForm };
}

/** Exposed for `studio-preview-shell.tsx` to decide whether the current preset even has a registered `EventDefinition` at all (vs. an art-only registration like Christmas). */
export function isRegisteredEvent(presetId: string): boolean {
  return EVENT_DEFINITIONS.some((event) => event.id === presetId);
}
