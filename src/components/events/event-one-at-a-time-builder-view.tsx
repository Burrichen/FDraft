"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  attemptEventOneAtATimeChallenge,
  finalizeEventOneAtATimeDraft,
  pickEventOneAtATimeRandomFilm,
  resolveEventOneAtATimePickerCandidates,
  type EventOneAtATimeCandidateFilm,
} from "@/application/events/event-one-at-a-time-service";
import { resolveEventChallengeCandidatePool } from "@/application/events/resolve-event-category-candidates";
import { listLocalChallengeAvailability } from "@/application/challenges/list-local-challenge-availability";
import { fetchLocalChallengeCandidates } from "@/application/drafts/local-fetch-context";
import {
  getPreferWatchlistPreference,
  setPreferWatchlistPreference,
} from "@/application/events/prefer-watchlist-preference";
import { ChallengeBrowser } from "@/components/drafts/challenge-browser";
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
import { resolveEligibleCandidates } from "@/domain/events/event-eligibility";
import { getEventDefinition } from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";

type EventBuilderStep =
  | { kind: "source-select" }
  | { kind: "category-select"; for: "random" | "manual" }
  | { kind: "random-reviewing"; film: EventOneAtATimeCandidateFilm }
  | { kind: "manual-picking"; categoryKey: string | null }
  | { kind: "challenge-browsing" }
  | {
      kind: "challenge-reviewing";
      challengeId: string;
      film: EventOneAtATimeCandidateFilm;
    }
  | { kind: "summary" };

/**
 * The Event One At A Time Draft Builder (see docs/updates, "FDRAFT UPDATE
 * 1 — EVENT ONE AT A TIME DRAFTING") — the SAME conceptual flow as the
 * normal `OneAtATimeBuilderView` (Random/Choose My Own/Challenge → Draft So
 * Far → Next Film/Done), reusing its shared pieces wholesale
 * (`OneAtATimeCandidateCard`, `OneAtATimeStagedGrid`, `ChallengeBrowser`,
 * the domain staging functions, `canFinalizeOneAtATimeDraft`) — only the
 * candidate resolution (category-aware for Halloween/Christmas,
 * eligibility-filtered for January) and finalisation (event-scoped, fixed
 * deadline, no `timeMode`) differ, both already isolated in
 * `event-one-at-a-time-service.ts`.
 *
 * Deliberately a SEPARATE component from `OneAtATimeBuilderView` rather
 * than one file branching on "is this an event" throughout — the normal
 * builder is already a real, working, tested flow, and threading an event
 * branch through its `useState`/data-loading/every step would risk
 * regressing it for no benefit `event-one-at-a-time-service.ts`'s own
 * shared functions don't already provide. "Normal One At A Time unchanged"
 * (see docs/updates §19) is a hard regression bar this design keeps by
 * construction: this file never imports from, or is imported by, the
 * normal builder's own module.
 *
 * `categories: null` (January) skips the `category-select` step entirely —
 * Random/Choose My Own act directly on the event's whole eligible pool.
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
  categories: readonly { key: string; label: string }[] | null;
  sourceEventManuallyEnabled: boolean;
  onDone: (draftId: string) => void;
  onCancel: () => void;
}) {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const candidateOverride = categories
      ? (
          await resolveEventChallengeCandidatePool(repositories, {
            profileId: activeProfile.id,
            eventId,
            categoryKeys: categories.map((category) => category.key),
          })
        ).candidates
      : resolveEligibleCandidates(
          await fetchLocalChallengeCandidates(repositories, activeProfile.id),
          getEventDefinition(eventId)?.eligibilityRules ?? {},
        );
    const { challenges, availableGenres } =
      await listLocalChallengeAvailability(repositories, activeProfile.id, {
        candidates: candidateOverride,
      });
    const preferWatchlist = categories
      ? await getPreferWatchlistPreference(repositories, activeProfile.id)
      : true;
    return {
      challenges: challenges.filter((challenge) => challenge.id !== "diy"),
      availableGenres,
      preferWatchlist,
    };
  }, [activeProfile?.id, repositories, eventId, categories]);

  const [staged, setStaged] = useState<OneAtATimeStagedItem[]>([]);
  const [step, setStep] = useState<EventBuilderStep>({
    kind: "source-select",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [challengeSelectedIds, setChallengeSelectedIds] = useState<string[]>(
    [],
  );
  const [manualGenre, setManualGenre] = useState("");
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
    () => Object.fromEntries((categories ?? []).map((c) => [c.key, c.label])),
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
    setChallengeSelectedIds([]);
    setManualGenre("");
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
    categoryKey: string | null,
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
          setStep(
            categories
              ? { kind: "category-select", for: "random" }
              : { kind: "source-select" },
          );
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

  async function handleAttemptChallenge(challengeId: string) {
    setIsBusy(true);
    setStepError(null);
    try {
      const outcome = await attemptEventOneAtATimeChallenge(repositories, {
        profileId: activeProfile!.id,
        eventId,
        challengeId,
        excludeFilmIds,
        manualGenre: manualGenre || undefined,
        categoryKeys: categories ? categories.map((c) => c.key) : null,
      });
      if (outcome.result.status === "success") {
        setStep({
          kind: "challenge-reviewing",
          challengeId,
          film: {
            filmId: outcome.result.film.filmId,
            title: outcome.result.film.title,
            releaseYear: outcome.result.film.releaseYear,
            runtimeMinutes: outcome.result.film.runtimeMinutes,
            averageRating: outcome.result.film.averageRating,
            posterUrl: outcome.posterUrl,
            eventCategoryKey: outcome.eventCategoryKey,
          },
        });
        return;
      }
      const message =
        outcome.result.status === "requires_user_choice"
          ? "This challenge needs a follow-up choice that isn't supported yet — try a different challenge."
          : "reason" in outcome.result
            ? `That challenge couldn't be filled: ${outcome.result.reason.replaceAll("_", " ")}.`
            : "That challenge couldn't be filled right now.";
      setStepError(message);
      setChallengeSelectedIds([]);
      setStep({ kind: "challenge-browsing" });
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

  async function openManualPicker(categoryKey: string | null) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">One At A Time — {eventName}</h1>
        <p className="page-subtitle">
          Build this Event Draft one film at a time — Random, Choose My Own, or
          a Challenge — then finish whenever the list feels big enough.
        </p>
      </div>

      {staged.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            Your draft so far ({staged.length})
          </h2>
          <OneAtATimeStagedGrid
            items={staged}
            challenges={data.challenges}
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
            categories
              ? setStep({ kind: "category-select", for: "random" })
              : void handlePickRandom(null)
          }
          onSelectManual={() =>
            categories
              ? setStep({ kind: "category-select", for: "manual" })
              : void openManualPicker(null)
          }
          onSelectChallenge={() => setStep({ kind: "challenge-browsing" })}
        />
      ) : null}

      {step.kind === "category-select" && categories ? (
        <section className="mx-auto max-w-2xl space-y-4">
          <h2 className="text-foreground text-lg font-bold">
            {step.for === "random"
              ? "Which category should we draw from?"
              : "Which category do you want to choose from?"}
          </h2>
          {step.for === "random" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferWatchlist}
                onChange={(event) => {
                  const value = event.target.checked;
                  setPreferWatchlistState(value);
                  void setPreferWatchlistPreference(
                    repositories,
                    activeProfile!.id,
                    value,
                  );
                }}
                className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              Prefer films already on my watchlist
            </label>
          ) : null}
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
            step.categoryKey
              ? (categoryLabelByKey[step.categoryKey] ?? step.categoryKey)
              : eventName
          }
          films={pickerCandidates ?? []}
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

      {step.kind === "challenge-browsing" ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            Choose a challenge
          </h2>
          <ChallengeBrowser
            challenges={data.challenges}
            availableGenres={data.availableGenres}
            slotsNeeded={1}
            variant="single"
            selectedChallengeIds={challengeSelectedIds}
            onChange={setChallengeSelectedIds}
            manualGenre={manualGenre}
            onManualGenreChange={setManualGenre}
            diyEligibleFilms={[]}
            diyChallengeFilmEntryIds={[]}
            onDiyChallengeFilmEntryIdsChange={() => {}}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy || challengeSelectedIds.length === 0}
              onClick={() =>
                void handleAttemptChallenge(challengeSelectedIds[0]!)
              }
            >
              {isBusy ? "Attempting…" : "Attempt this challenge"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={goToSourceSelect}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {step.kind === "challenge-reviewing" ? (
        <section className="mx-auto max-w-4xl space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            Challenge result
          </h2>
          <p className="text-muted-foreground text-sm">
            Challenge:{" "}
            <span className="text-foreground font-medium">
              {data.challenges.find((c) => c.id === step.challengeId)?.name ??
                step.challengeId}
            </span>
          </p>
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
              aria-label={`Okay — add ${step.film.title} to this draft`}
              onClick={() =>
                confirmStagedItem({
                  localId: crypto.randomUUID(),
                  filmId: step.film.filmId,
                  watchlistEntryId: null,
                  source: "challenge",
                  challengeId: step.challengeId,
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
              onClick={() => {
                setChallengeSelectedIds([]);
                setStep({ kind: "challenge-browsing" });
              }}
            >
              Try a different challenge
            </Button>
            <Button type="button" variant="ghost" onClick={goToSourceSelect}>
              Back
            </Button>
          </div>
        </section>
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
