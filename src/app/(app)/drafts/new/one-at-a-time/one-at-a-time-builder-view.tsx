"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  attemptOneAtATimeChallenge,
  finalizeOneAtATimeDraft,
  pickOneAtATimeRandomFilm,
} from "@/application/drafts/one-at-a-time-service";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import type { OneAtATimeCandidateFilm } from "@/application/drafts/one-at-a-time-service";
import { listLocalChallengeAvailability } from "@/application/challenges/list-local-challenge-availability";
import { AsyncDataError } from "@/components/async-data-error";
import { ChallengeBrowser } from "@/components/drafts/challenge-browser";
import { DiyFilmPickerSheet } from "@/components/drafts/diy/diy-film-picker-sheet";
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
import { OneAtATimeCandidateCard } from "./one-at-a-time-candidate-card";
import { OneAtATimeSourceSelect } from "./one-at-a-time-source-select";
import { OneAtATimeStagedGrid } from "./one-at-a-time-staged-grid";

type BuilderStep =
  | { kind: "source-select" }
  | { kind: "random-reviewing"; film: OneAtATimeCandidateFilm }
  | { kind: "manual-picking" }
  | { kind: "challenge-browsing" }
  | {
      kind: "challenge-reviewing";
      challengeId: string;
      film: OneAtATimeCandidateFilm;
    }
  | { kind: "summary" };

/**
 * The One At A Time Draft Builder (see docs/updates, "ONE AT A TIME
 * DRAFTING — CORE SYSTEM") — reached from `/drafts/new` once "One At A
 * Time" is chosen there (which also carries the deadline choice through
 * via `timeMode`, the same hand-off DIY already uses). A purely session-
 * local wizard: nothing here is persisted until `handleDone` calls
 * `finalizeOneAtATimeDraft` — leaving this page any other way (back
 * button, closing the tab) simply discards the in-progress state, the
 * same "an unsubmitted draft never becomes a draft" convention every
 * other creation flow in this app already follows (see docs/updates §16).
 *
 * Deliberately not split into one file per step (Random/Manual/Challenge)
 * — this phase's job is the domain/state architecture
 * (`domain/drafts/one-at-a-time.ts`, `application/drafts/
 * one-at-a-time-service.ts`), not the detailed per-source screens, which
 * "are polished in the next prompt." Each step here is intentionally
 * plain.
 */
export function OneAtATimeBuilderView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProfile, repositories } = useProfileContext();

  const rawTimeMode = searchParams.get("timeMode");
  const timeMode =
    rawTimeMode === "calendar" || rawTimeMode === "timer" ? rawTimeMode : null;

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const [eligibleFilms, challengeAvailability] = await Promise.all([
      getDiyEligibleFilms(repositories, activeProfile.id),
      listLocalChallengeAvailability(repositories, activeProfile.id),
    ]);
    return { eligibleFilms, ...challengeAvailability };
  }, [activeProfile?.id, repositories]);

  const [staged, setStaged] = useState<OneAtATimeStagedItem[]>([]);
  const [step, setStep] = useState<BuilderStep>({ kind: "source-select" });
  const [isBusy, setIsBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [challengeSelectedIds, setChallengeSelectedIds] = useState<string[]>(
    [],
  );
  const [manualGenre, setManualGenre] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const justConfirmedManualPick = useRef(false);

  const excludeFilmIds = useMemo(
    () => staged.map((item) => item.filmId),
    [staged],
  );

  // "Pick Your Own" (the "diy" challenge) is deliberately excluded here —
  // it needs its own two-step "choose the challenge, THEN pick a backing
  // film" flow, which is exactly what the "Choose My Own" source already
  // offers directly (see docs/updates §8) — offering it again inside
  // "Challenge" would be a confusing, redundant second path to the same
  // outcome.
  const challenges = useMemo(
    () =>
      (data?.challenges ?? []).filter((challenge) => challenge.id !== "diy"),
    [data],
  );
  const eligibleFilms = useMemo(
    () =>
      (data?.eligibleFilms ?? []).filter(
        (film) => !isFilmAlreadyStaged(staged, film.filmId),
      ),
    [data, staged],
  );

  if (!activeProfile) {
    return null;
  }
  if (!timeMode) {
    return (
      <div className="max-w-2xl space-y-6">
        <AsyncDataError
          error={new Error("Missing or invalid draft configuration.")}
          onRetry={() => router.replace("/drafts/new")}
        />
      </div>
    );
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
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

  /**
   * A confirmed film always lands on "Your Draft So Far" (see docs/updates
   * §11), never straight back to source-select — "Next Film" is the one
   * explicit action that returns there, so this pause reads as a genuine
   * checkpoint rather than the choice screen just flickering back
   * immediately.
   */
  function confirmStagedItem(item: OneAtATimeStagedItem) {
    const result = stageOneAtATimeItem(staged, item);
    if (!result.ok) {
      // Every source path already excludes staged films from its own
      // candidate pool — reaching this means a genuine race (e.g. the
      // same film confirmed twice in quick succession), not a normal
      // outcome, so a plain toast is enough rather than a dedicated
      // recovery flow.
      toast.error("That film is already in this draft.");
      return;
    }
    setStaged(result.staged);
    clearStepTransientState();
    setStep({ kind: "summary" });
  }

  /**
   * `excludeCurrentFilmId` is passed on Reroll (see docs/updates, "ONE AT A
   * TIME DRAFTING — COMPLETE UX" §4: "exclude current candidate where
   * practical") — the currently-reviewed film isn't staged yet, so it
   * wouldn't otherwise be excluded. On the very first pick from
   * source-select there's no current candidate to exclude.
   */
  async function handlePickRandom(excludeCurrentFilmId?: string) {
    setIsBusy(true);
    setStepError(null);
    try {
      const outcome = await pickOneAtATimeRandomFilm(repositories, {
        profileId: activeProfile!.id,
        excludeFilmIds: excludeCurrentFilmId
          ? [...excludeFilmIds, excludeCurrentFilmId]
          : excludeFilmIds,
      });
      if (!outcome.ok) {
        // A first pick with nothing available has no candidate to fall
        // back to — back to source-select with the message visible. A
        // REROLL that finds nothing else is a different situation: the
        // current candidate is still perfectly valid, so it stays on
        // screen (see docs/updates §4: "handle insufficient pool
        // gracefully") — only the Reroll option itself becomes exhausted.
        if (!excludeCurrentFilmId) {
          setStepError(outcome.message);
          setStep({ kind: "source-select" });
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
      const outcome = await attemptOneAtATimeChallenge(repositories, {
        profileId: activeProfile!.id,
        challengeId,
        excludeFilmIds,
        manualGenre: manualGenre || undefined,
      });
      if (outcome.result.status === "success") {
        setStep({
          kind: "challenge-reviewing",
          challengeId,
          film: {
            filmId: outcome.result.film.filmId,
            watchlistEntryId: outcome.result.film.watchlistEntryId,
            title: outcome.result.film.title,
            releaseYear: outcome.result.film.releaseYear,
            runtimeMinutes: outcome.result.film.runtimeMinutes,
            averageRating: outcome.result.film.averageRating,
            posterUrl: outcome.posterUrl,
          },
        });
        return;
      }
      // Duplicate/invalid candidates are already impossible by construction
      // (the candidate pool passed to the engine excludes every staged
      // film — see `attemptOneAtATimeChallenge`), so a failure here is a
      // genuine "this challenge can't be filled right now" — the existing
      // bounded reroll behaviour is simply trying a different challenge
      // from the catalogue, never an automatic retry loop.
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
        const outcome = await finalizeOneAtATimeDraft(repositories, {
          profileId: activeProfile!.id,
          timezone: activeProfile!.timezone,
          timeMode: timeMode!,
          items: staged,
        });
        if (!outcome.ok) {
          toast.error(outcome.message);
          return;
        }
        router.push("/drafts");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">One At A Time draft</h1>
        <p className="page-subtitle">
          Build your Draft one film at a time — Random, Choose My Own, or a
          Challenge — then finish whenever the list feels big enough.
        </p>
      </div>

      {staged.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            Your draft so far ({staged.length})
          </h2>
          <OneAtATimeStagedGrid
            items={staged}
            challenges={challenges}
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
          onSelectRandom={() => void handlePickRandom()}
          onSelectManual={() => setStep({ kind: "manual-picking" })}
          onSelectChallenge={() => setStep({ kind: "challenge-browsing" })}
        />
      ) : null}

      {step.kind === "random-reviewing" ? (
        // Centred rather than full shared-shell width (see
        // docs/product-spec.md, "Desktop Layout Width" — a single-film
        // review card is exactly the "genuine usability reason not to"
        // carve-out that rule allows: stretching one poster card and three
        // buttons across ~2000px would look absurd, not "well-used"). Wider
        // than the previous `max-w-2xl`, and centred instead of left-
        // stranded, with the card itself (`OneAtATimeCandidateCard`) also
        // growing its poster/title at `lg`/`xl` — the release-hardening
        // pass's own complaint was a "tiny 400px card stranded on the
        // left," not merely "narrower than 75% of the viewport."
        <section className="mx-auto max-w-4xl space-y-3">
          <h2 className="text-foreground text-lg font-bold">Random pick</h2>
          <OneAtATimeCandidateCard film={step.film} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy}
              aria-label={`Okay — add ${step.film.title} to this draft`}
              onClick={() =>
                confirmStagedItem({
                  localId: crypto.randomUUID(),
                  filmId: step.film.filmId,
                  watchlistEntryId: step.film.watchlistEntryId,
                  source: "random",
                  challengeId: null,
                  challengeDisplayValue: null,
                  title: step.film.title,
                  releaseYear: step.film.releaseYear,
                  posterUrl: step.film.posterUrl,
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
              onClick={() => void handlePickRandom(step.film.filmId)}
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
        <DiyFilmPickerSheet
          open
          onOpenChange={(open) => {
            // `DiyFilmPickerSheet`'s own Confirm button calls `onConfirm`
            // THEN immediately `onOpenChange(false)` (see that component's
            // `handleConfirm`) — both land in the same React batch, so
            // without this guard the close notification would overwrite
            // `confirmStagedItem`'s "summary" transition right back to
            // "source-select" a moment later. Only a genuine dismissal
            // (Cancel/Escape/outside click, none of which call `onConfirm`
            // first) should send the builder back.
            if (!open && !justConfirmedManualPick.current) {
              goToSourceSelect();
            }
            justConfirmedManualPick.current = false;
          }}
          films={eligibleFilms}
          excludedEntryIds={new Set()}
          selectedEntryId={null}
          slotLabel="your next film"
          size="large"
          onConfirm={(entryId) => {
            const film = eligibleFilms.find((f) => f.entryId === entryId);
            if (!film) return;
            justConfirmedManualPick.current = true;
            confirmStagedItem({
              localId: crypto.randomUUID(),
              filmId: film.filmId,
              watchlistEntryId: film.entryId,
              source: "manual",
              challengeId: null,
              challengeDisplayValue: null,
              title: film.title,
              releaseYear: film.releaseYear,
              posterUrl: film.posterUrl,
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
            challenges={challenges}
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
        // Same centred, moderately-widened treatment as the Random pick
        // review step above — see its comment.
        <section className="mx-auto max-w-4xl space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            Challenge result
          </h2>
          <p className="text-muted-foreground text-sm">
            Challenge:{" "}
            <span className="text-foreground font-medium">
              {challenges.find((c) => c.id === step.challengeId)?.name ??
                step.challengeId}
            </span>
          </p>
          <OneAtATimeCandidateCard film={step.film} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              aria-label={`Okay — add ${step.film.title} to this draft`}
              onClick={() =>
                confirmStagedItem({
                  localId: crypto.randomUUID(),
                  filmId: step.film.filmId,
                  watchlistEntryId: step.film.watchlistEntryId,
                  source: "challenge",
                  challengeId: step.challengeId,
                  challengeDisplayValue: null,
                  title: step.film.title,
                  releaseYear: step.film.releaseYear,
                  posterUrl: step.film.posterUrl,
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
        // The persistent staged-films grid above already carries its own
        // "Your draft so far (N)" heading — this step only needs the
        // follow-up prompt, not a second, redundant heading repeating it.
        <p className="text-muted-foreground text-sm">
          Add another film, or finish here with what you&apos;ve got.
        </p>
      ) : null}

      {/* Deliberately NOT `sticky` (unlike the DIY selection screen's own
          bottom bar) — this builder's step content varies wildly in
          height (a single candidate card vs. a long scrollable challenge
          catalogue), and a sticky bar sized for one step routinely
          overlapped and hid the Okay/Reroll/Back buttons of a shorter one.
          A plain bar at the natural end of the page is simpler and never
          covers anything. */}
      <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-4">
        <p className="text-foreground text-sm font-medium">
          {staged.length} film{staged.length === 1 ? "" : "s"} selected
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/drafts/new" />}
          >
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
