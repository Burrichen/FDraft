"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  finalizeEventOneAtATimeDraft,
  pickEventOneAtATimeRandomFilm,
  resolveEventOneAtATimePickerCandidates,
  type EventOneAtATimeCandidateFilm,
} from "@/application/events/event-one-at-a-time-service";
import {
  getPreferWatchlistPreference,
  setPreferWatchlistPreference,
} from "@/application/events/prefer-watchlist-preference";
import { OneAtATimeCandidateCard } from "@/app/(app)/drafts/new/one-at-a-time/one-at-a-time-candidate-card";
import { OneAtATimeSourceSelect } from "@/app/(app)/drafts/new/one-at-a-time/one-at-a-time-source-select";
import { OneAtATimeStagedGrid } from "@/app/(app)/drafts/new/one-at-a-time/one-at-a-time-staged-grid";
import { EventCategoryFilmPickerSheet } from "@/components/events/event-category-film-picker-sheet";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import {
  canFinalizeOneAtATimeDraft,
  isFilmAlreadyStaged,
  removeStagedOneAtATimeItem,
  stageOneAtATimeItem,
  type OneAtATimeStagedItem,
} from "@/domain/drafts/one-at-a-time";
import { useAsyncData } from "@/hooks/use-async-data";

type EventBuilderStep =
  | { kind: "source-select" }
  | { kind: "category-select"; for: "random" | "manual" }
  | { kind: "random-reviewing"; film: EventOneAtATimeCandidateFilm }
  | { kind: "manual-picking"; categoryKey: string }
  | { kind: "summary" };

/**
 * The Event One At A Time Draft Builder — Random/Choose My Own → Draft So
 * Far → Next Film/Done. Event Drafts have no Challenge source (see
 * docs/product-spec.md, "ONE AT A TIME MODE") — that's the one place this
 * flow differs from normal One At A Time, which keeps it. Reuses shared
 * pieces wholesale (`OneAtATimeCandidateCard`, `OneAtATimeStagedGrid`,
 * `OneAtATimeSourceSelect`, the domain staging functions,
 * `canFinalizeOneAtATimeDraft`) — only the candidate resolution
 * (category-aware for Halloween/Christmas, eligibility-filtered for
 * January) and finalisation (event-scoped, fixed deadline, no `timeMode`)
 * differ, both already isolated in `event-one-at-a-time-service.ts`.
 *
 * Deliberately a SEPARATE component from `OneAtATimeBuilderView` rather
 * than one file branching on "is this an event" throughout — the normal
 * builder is already a real, working, tested flow, and threading an event
 * branch through its `useState`/data-loading/every step would risk
 * regressing it for no benefit `event-one-at-a-time-service.ts`'s own
 * shared functions don't already provide. This file never imports from, or
 * is imported by, the normal builder's own module.
 *
 * `categories` is always a real, non-empty list — every event with One At
 * A Time drafting declares its categories (see
 * `EVENT_ONE_AT_A_TIME_CATEGORIES`), and the route refuses to open this
 * builder for one that doesn't. The old `categories: null` mode existed
 * solely for January, which no longer has a builder at all (see
 * `EventDefinition.singleFilmDraft`, docs/updates "FDRAFT UPDATE 1 — F*
 * YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §4/§16).
 */
export function EventOneAtATimeBuilderView({
  eventId,
  eventName,
  categories,
  sourceEventManuallyEnabled,
  onDone,
  onCancel,
}: {
  eventId: string;
  eventName: string;
  categories: readonly { key: string; label: string }[];
  sourceEventManuallyEnabled: boolean;
  onDone: (draftId: string) => void;
  onCancel: () => void;
}) {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const preferWatchlist = await getPreferWatchlistPreference(
      repositories,
      activeProfile.id,
    );
    return { preferWatchlist };
  }, [activeProfile?.id, repositories, eventId, categories]);

  const [staged, setStaged] = useState<OneAtATimeStagedItem[]>([]);
  const [step, setStep] = useState<EventBuilderStep>({
    kind: "source-select",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [preferWatchlist, setPreferWatchlistState] = useState(true);
  const [preferWatchlistLoaded, setPreferWatchlistLoaded] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<Awaited<
    ReturnType<typeof resolveEventOneAtATimePickerCandidates>
  > | null>(null);
  if (data && !preferWatchlistLoaded) {
    setPreferWatchlistLoaded(true);
    setPreferWatchlistState(data.preferWatchlist);
  }

  const excludeFilmIds = useMemo(
    () => staged.map((item) => item.filmId),
    [staged],
  );
  const categoryLabelByKey = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  if (!activeProfile) {
    return null;
  }
  if (error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error.message}
        <Button variant="link" onClick={reload}>
          Try again
        </Button>
      </p>
    );
  }
  if (isLoading || !data) {
    return null;
  }

  function clearStepTransientState() {
    setStepError(null);
  }

  function goToSourceSelect() {
    clearStepTransientState();
    setStep({ kind: "source-select" });
  }

  function confirmStagedItem(item: OneAtATimeStagedItem) {
    if (isFilmAlreadyStaged(staged, item.filmId)) {
      toast.error("That film is already in this draft.");
      return;
    }
    const result = stageOneAtATimeItem(staged, item);
    if (!result.ok) {
      toast.error("That film is already in this draft.");
      return;
    }
    setStaged(result.staged);
    clearStepTransientState();
    setStep({ kind: "summary" });
  }

  async function handlePickRandom(
    categoryKey: string,
    excludeCurrentFilmId?: string,
  ) {
    setIsBusy(true);
    setStepError(null);
    try {
      const outcome = await pickEventOneAtATimeRandomFilm(repositories, {
        profileId: activeProfile!.id,
        eventId,
        categoryKey,
        excludeFilmIds: excludeCurrentFilmId
          ? [...excludeFilmIds, excludeCurrentFilmId]
          : excludeFilmIds,
        preferWatchlist,
      });
      if (!outcome.ok) {
        if (!excludeCurrentFilmId) {
          setStepError(outcome.message);
          setStep({ kind: "category-select", for: "random" });
        } else {
          setStepError(
            "No other eligible films to reroll to — this is the only one left.",
          );
        }
        return;
      }
      setStepError(null);
      setStep({ kind: "random-reviewing", film: outcome.film });
    } finally {
      setIsBusy(false);
    }
  }

  function handleDone() {
    if (!canFinalizeOneAtATimeDraft(staged)) return;
    setIsFinalizing(true);
    void (async () => {
      try {
        const outcome = await finalizeEventOneAtATimeDraft(repositories, {
          profileId: activeProfile!.id,
          timezone: activeProfile!.timezone,
          eventId,
          items: staged,
          sourceEventManuallyEnabled,
        });
        if (!outcome.ok) {
          toast.error(outcome.message);
          return;
        }
        onDone(outcome.draftId);
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Could not create this draft.",
        );
      } finally {
        setIsFinalizing(false);
      }
    })();
  }

  async function openManualPicker(categoryKey: string) {
    setIsBusy(true);
    try {
      const candidates = await resolveEventOneAtATimePickerCandidates(
        repositories,
        {
          profileId: activeProfile!.id,
          eventId,
          categoryKey,
          excludeFilmIds,
        },
      );
      setPickerCandidates(candidates);
      setStep({ kind: "manual-picking", categoryKey });
    } finally {
      setIsBusy(false);
    }
  }

  function handleTogglePreferWatchlist(next: boolean) {
    setPreferWatchlistState(next);
    void setPreferWatchlistPreference(repositories, activeProfile!.id, next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">One At A Time — {eventName}</h1>
        <p className="page-subtitle">
          Build this Event Draft one film at a time — Random or Choose My Own —
          then finish whenever the list feels big enough.
        </p>
      </div>

      {staged.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            Your draft so far ({staged.length})
          </h2>
          <OneAtATimeStagedGrid
            items={staged}
            challenges={[]}
            categoryLabelByKey={categoryLabelByKey}
            onRemove={(localId) =>
              setStaged((current) =>
                removeStagedOneAtATimeItem(current, localId),
              )
            }
          />
        </section>
      ) : null}

      {stepError ? (
        <p role="alert" className="text-destructive text-sm">
          {stepError}
        </p>
      ) : null}

      {step.kind === "source-select" ? (
        <OneAtATimeSourceSelect
          onSelectRandom={() =>
            setStep({ kind: "category-select", for: "random" })
          }
          onSelectManual={() =>
            setStep({ kind: "category-select", for: "manual" })
          }
          showChallenge={false}
        />
      ) : null}

      {step.kind === "category-select" ? (
        <section className="mx-auto max-w-2xl space-y-4">
          <h2 className="text-foreground text-lg font-bold">
            {step.for === "random"
              ? "Which category should we draw from?"
              : "Which category do you want to choose from?"}
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferWatchlist}
              onChange={(event) =>
                handleTogglePreferWatchlist(event.target.checked)
              }
              className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            Prefer items from my Watchlist
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category.key}
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() =>
                  step.for === "random"
                    ? void handlePickRandom(category.key)
                    : void openManualPicker(category.key)
                }
              >
                {category.label}
              </Button>
            ))}
          </div>
          <Button type="button" variant="ghost" onClick={goToSourceSelect}>
            Back
          </Button>
        </section>
      ) : null}

      {step.kind === "random-reviewing" ? (
        <section className="mx-auto max-w-4xl space-y-3">
          <h2 className="text-foreground text-lg font-bold">Random pick</h2>
          <OneAtATimeCandidateCard
            film={{
              filmId: step.film.filmId,
              watchlistEntryId: step.film.filmId,
              title: step.film.title,
              releaseYear: step.film.releaseYear,
              runtimeMinutes: step.film.runtimeMinutes,
              averageRating: step.film.averageRating,
              posterUrl: step.film.posterUrl,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy}
              aria-label={`Okay — add ${step.film.title} to this draft`}
              onClick={() =>
                confirmStagedItem({
                  localId: crypto.randomUUID(),
                  filmId: step.film.filmId,
                  watchlistEntryId: null,
                  source: "random",
                  challengeId: null,
                  challengeDisplayValue: null,
                  title: step.film.title,
                  releaseYear: step.film.releaseYear,
                  posterUrl: step.film.posterUrl,
                  eventCategoryKey: step.film.eventCategoryKey,
                })
              }
            >
              Okay
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              aria-label={`Reroll — pick a different film instead of ${step.film.title}`}
              onClick={() =>
                void handlePickRandom(
                  step.film.eventCategoryKey,
                  step.film.filmId,
                )
              }
            >
              {isBusy ? "Rerolling…" : "Reroll"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={goToSourceSelect}
            >
              Back
            </Button>
          </div>
        </section>
      ) : null}

      {step.kind === "manual-picking" ? (
        <EventCategoryFilmPickerSheet
          open
          onOpenChange={(open) => {
            if (!open) goToSourceSelect();
          }}
          categoryLabel={
            categoryLabelByKey[step.categoryKey] ?? step.categoryKey
          }
          films={pickerCandidates ?? []}
          preferWatchlist={preferWatchlist}
          onConfirm={(filmId) => {
            const film = (pickerCandidates ?? []).find(
              (f) => f.filmId === filmId,
            );
            if (!film) return;
            confirmStagedItem({
              localId: crypto.randomUUID(),
              filmId: film.filmId,
              watchlistEntryId: null,
              source: "manual",
              challengeId: null,
              challengeDisplayValue: null,
              title: film.title,
              releaseYear: film.releaseYear,
              posterUrl: film.posterUrl,
              eventCategoryKey: film.eventCategoryKey,
            });
          }}
        />
      ) : null}

      {step.kind === "summary" ? (
        <p className="text-muted-foreground text-sm">
          Add another film, or finish here with what you&apos;ve got.
        </p>
      ) : null}

      <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-4">
        <p className="text-foreground text-sm font-medium">
          {staged.length} film{staged.length === 1 ? "" : "s"} selected
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {step.kind === "summary" ? (
            <Button type="button" variant="outline" onClick={goToSourceSelect}>
              Next Film
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canFinalizeOneAtATimeDraft(staged) || isFinalizing}
            onClick={handleDone}
          >
            {isFinalizing ? "Creating draft…" : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
