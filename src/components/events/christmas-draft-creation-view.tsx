"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useState } from "react";
import { toast } from "sonner";
import { createChristmasLocalDraft } from "@/application/drafts/christmas-draft-service";
import { computeChristmasPoolCapacity } from "@/application/drafts/christmas-fetch-context";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { ensureEventCategoryFilmContentLoaded } from "@/application/events/load-event-category-film-content";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import {
  getPreferWatchlistPreference,
  setPreferWatchlistPreference,
} from "@/application/events/prefer-watchlist-preference";
import { ChristmasLinkedSliders } from "@/components/drafts/christmas-linked-sliders";
import { DraftTimeProgress } from "@/components/drafts/draft-time-progress";
import { EventDifficultyPicker } from "@/components/drafts/event-difficulty-picker";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createDefaultChristmasSplit,
  type ChristmasSplit,
} from "@/domain/drafts/christmas-split";
import { getFilmCount, isOneAtATime } from "@/domain/drafts/difficulty";
import { CHRISTMAS_FILM_CONTENT } from "@/domain/events/event-film-content";
import { calculateDraftTimeProgress } from "@/domain/drafts/progress";
import {
  getCurrentOccurrenceBounds,
  getNextOccurrenceStart,
  isEventAvailable,
} from "@/domain/events/event-availability";
import {
  CHRISTMAS_EVENT_ID,
  getEventDefinition,
} from "@/domain/events/event-registry";
import { EVENT_ONE_AT_A_TIME_CATEGORIES } from "@/domain/events/one-at-a-time-categories";
import { useAsyncData } from "@/hooks/use-async-data";
import type { DraftDifficulty } from "@/repositories";
import { EventOneAtATimeBuilderView } from "./event-one-at-a-time-builder-view";
import { describeFixedEventDeadline } from "./fixed-event-deadline-copy";

/** Every difficulty except One At A Time has a fixed film count and so uses the two-pool sliders. */
type FixedChristmasDifficulty = Exclude<
  DraftDifficulty,
  "freeform" | "one-at-a-time"
>;

/**
 * "Create Christmas Draft" — Christmas's Event page empty state (see
 * docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL
 * POLISH" §1-§7). REWRITTEN from a version that offered One At A Time and
 * nothing else: Christmas now uses the same supported difficulty set as
 * Halloween, through the same shared components, so the two Events are
 * genuinely the same flow with different pools rather than two
 * independently-drifting implementations.
 *
 * Structure mirrors `HalloweenDraftCreationView` deliberately, step for
 * step: the event-window `DraftTimeProgress` bar shown regardless of which
 * step is open; two-step disclosure (a compact "No Christmas Draft yet"
 * card with one Create button, revealing the controls in place rather than
 * navigating away); the fixed Event deadline stated up front; the SHARED
 * `EventDifficultyPicker` (so Baby/Easy/Medium/Hard/Hardcore counts come
 * from the one central `DIFFICULTIES` config and Freeform is excluded
 * centrally, never by a Christmas-only list — §1/§2); linked category
 * sliders for a fixed difficulty; and One At A Time handed off to the same
 * generic Event builder Halloween uses, which offers only Random and
 * Choose My Own and never a Challenge (§7).
 *
 * One genuine difference from Halloween: Classic / Christmas Adjacent vs
 * Horror / Kitsch — different pool names, identical two-pool shape and
 * identical "Prefer items from my Watchlist" toggle (see docs/updates,
 * "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE CLEANUP" §1/§2/§6/§10) —
 * the shared `events.preferWatchlist` preference, the SAME key and default
 * the One At A Time Random/Choose My Own steps already read, persisted on
 * change so the choice carries between every non-January Event Draft
 * creation flow.
 *
 * Christmas CAN be manually enabled (`manualActivationAllowed: true`,
 * unlike Halloween), so `sourceEventManuallyEnabled` is read from the
 * shared `EventDiscoveryProvider` snapshot and threaded into creation for
 * both the fixed and One At A Time paths.
 */
export function ChristmasDraftCreationView({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const { result } = useEventDiscovery();
  const [formOpen, setFormOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<Exclude<
    DraftDifficulty,
    "freeform"
  > | null>(null);
  const [split, setSplit] = useState<ChristmasSplit | null>(null);
  const [preferWatchlist, setPreferWatchlist] = useState(true);
  const [preferWatchlistLoaded, setPreferWatchlistLoaded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useAsyncData(async () => {
    if (!activeProfile) return null;
    // This form reads Christmas's curated pools IMMEDIATELY on mount — to
    // show each category's availability and cap its sliders — so unlike
    // every other consumer it can genuinely race the app-shell's
    // fire-and-forget content load. Awaiting the idempotent ensure first
    // is what stops it rendering "Classic 0 available" with both sliders
    // pinned to zero.
    await ensureEventCategoryFilmContentLoaded(
      CHRISTMAS_EVENT_ID,
      {
        classic: CHRISTMAS_FILM_CONTENT.classic,
        adjacent: CHRISTMAS_FILM_CONTENT.adjacent,
      },
      {
        films: repositories.films,
        unresolvedMetadata: repositories.unresolvedMetadata,
      },
    );
    const [availability, effectiveNow, storedPreferWatchlist] =
      await Promise.all([
        computeChristmasPoolCapacity(repositories, activeProfile.id),
        getEffectiveEventDate(repositories, activeProfile.id),
        getPreferWatchlistPreference(repositories, activeProfile.id),
      ]);
    return { availability, effectiveNow, storedPreferWatchlist };
  }, [activeProfile?.id, repositories]);

  if (data && !preferWatchlistLoaded) {
    setPreferWatchlistLoaded(true);
    setPreferWatchlist(data.storedPreferWatchlist);
  }

  const status = result.statuses.find(
    (candidate) => candidate.event.id === CHRISTMAS_EVENT_ID,
  );
  const sourceEventManuallyEnabled = status?.manuallyEnabled ?? false;

  function handleSelectDifficulty(id: Exclude<DraftDifficulty, "freeform">) {
    setDifficulty(id);
    // One At A Time has no fixed film count — `getFilmCount` throws for it,
    // so there's no split to seed; the builder renders instead of the
    // sliders below (identical handling to Halloween's own view).
    setSplit(
      isOneAtATime(id) ? null : createDefaultChristmasSplit(getFilmCount(id)),
    );
  }

  function handleTogglePreferWatchlist(next: boolean) {
    setPreferWatchlist(next);
    if (!activeProfile) return;
    void setPreferWatchlistPreference(repositories, activeProfile.id, next);
  }

  async function handleCreate() {
    if (!activeProfile || !difficulty || isOneAtATime(difficulty)) return;
    if (!split || !data) return;
    setIsCreating(true);
    setError(null);
    try {
      const outcome = await createChristmasLocalDraft(repositories, {
        profileId: activeProfile.id,
        timezone: activeProfile.timezone,
        difficulty: difficulty as FixedChristmasDifficulty,
        split,
        preferWatchlist,
        sourceEventManuallyEnabled,
        effectiveNow: data.effectiveNow,
      });
      if (outcome.ok) {
        toast.success("Christmas Draft created");
        onCreated();
      } else {
        setError(outcome.message);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create your Christmas Draft.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  if (!activeProfile || !data) {
    return null;
  }

  if (!status || !isOccurrenceActiveNow(status)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Christmas isn&apos;t currently active
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Check back during the season, or opt in manually from Settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  const christmas = getEventDefinition(CHRISTMAS_EVENT_ID)!;
  const available = isEventAvailable(
    christmas.availability,
    data.effectiveNow,
    activeProfile.timezone,
  );

  if (!available) {
    const nextStart = getNextOccurrenceStart(
      christmas.availability,
      data.effectiveNow,
      activeProfile.timezone,
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Christmas has wrapped up for this year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {nextStart
              ? `Returns ${formatInTimeZone(nextStart, activeProfile.timezone, "d MMMM yyyy 'at' h:mm a")}.`
              : "Check back next season."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const availability = data.availability;
  // Christmas has ONE fixed deadline — the end of the current occurrence —
  // never a Calendar/Timer choice. Non-null: `available` above already
  // confirmed `data.effectiveNow` falls inside this occurrence.
  const eventWindow = getCurrentOccurrenceBounds(
    christmas.availability,
    data.effectiveNow,
    activeProfile.timezone,
  )!;
  // Progress through the WHOLE event window, using the exact same math
  // `DraftLifecycleView` computes once a Draft exists, so the bar reads
  // the same before and after creating one.
  const eventProgress = calculateDraftTimeProgress({
    mode: "timer",
    now: data.effectiveNow,
    startedAt: eventWindow.start,
    deadlineAt: eventWindow.end,
    timezone: activeProfile.timezone,
  });
  const showSliders = Boolean(difficulty && !isOneAtATime(difficulty) && split);
  const showOneAtATime = Boolean(
    formOpen && difficulty && isOneAtATime(difficulty),
  );

  return (
    <div className="space-y-6">
      <DraftTimeProgress
        progress={eventProgress}
        indicatorClassName="bg-christmas-snow"
      />

      {!formOpen ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-christmas-snow text-base">
              Your Christmas Draft
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              No Christmas Draft yet.
            </p>
            <Button type="button" onClick={() => setFormOpen(true)}>
              Create Christmas Draft
            </Button>
          </CardContent>
        </Card>
      ) : showOneAtATime ? null : (
        <Card className="border-christmas-border">
          <CardHeader>
            <CardTitle className="text-christmas-snow text-base">
              Create Christmas Draft
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-1.5">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Event Deadline
              </h3>
              <p className="text-foreground text-sm">
                Ends{" "}
                {describeFixedEventDeadline(
                  eventWindow.end,
                  activeProfile.timezone,
                )}
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-foreground text-sm font-bold">
                Choose a difficulty
              </h3>
              <EventDifficultyPicker
                selected={difficulty}
                onSelect={handleSelectDifficulty}
                selectedClassName="border-christmas-red bg-secondary"
              />
            </section>

            {showSliders && split ? (
              <>
                <section className="space-y-3">
                  <h3 className="text-foreground text-sm font-bold">
                    Classic / Christmas Adjacent
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Classic {availability.classicAvailable} available (
                    {availability.classicOnWatchlist} on your watchlist) /
                    Christmas Adjacent {availability.adjacentAvailable}{" "}
                    available ({availability.adjacentOnWatchlist} on your
                    watchlist).
                  </p>
                  <ChristmasLinkedSliders
                    totalFilms={getFilmCount(
                      difficulty as FixedChristmasDifficulty,
                    )}
                    split={split}
                    onChange={setSplit}
                    availability={availability}
                  />
                </section>

                <section className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={preferWatchlist}
                      onChange={(event) =>
                        handleTogglePreferWatchlist(event.target.checked)
                      }
                      className="border-border accent-christmas-green focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    Prefer items from my Watchlist
                  </label>
                  <p className="text-muted-foreground text-xs">
                    Fills as many slots as it can from Christmas films you
                    already have on your watchlist, then tops the rest up from
                    the full curated lists. Never a requirement — an empty
                    watchlist drafts exactly the same.
                  </p>
                </section>
              </>
            ) : null}

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            {showSliders ? (
              <Button
                type="button"
                disabled={isCreating}
                onClick={() => void handleCreate()}
              >
                {isCreating ? "Creating…" : "Create Christmas Draft"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* One At A Time — a fully separate builder, not a branch inside the
          card above, since its own bottom bar/Cancel/Done already replace
          everything that card's difficulty picker/sliders/Create button
          would otherwise show. Same handling as Halloween's own view. */}
      {showOneAtATime ? (
        <EventOneAtATimeBuilderView
          eventId={CHRISTMAS_EVENT_ID}
          eventName="Christmas"
          categories={EVENT_ONE_AT_A_TIME_CATEGORIES[CHRISTMAS_EVENT_ID]!}
          sourceEventManuallyEnabled={sourceEventManuallyEnabled}
          onDone={() => {
            toast.success("Christmas Draft created");
            onCreated();
          }}
          onCancel={() => setDifficulty(null)}
        />
      ) : null}
    </div>
  );
}
