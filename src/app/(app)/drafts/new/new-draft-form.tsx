"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ChallengeBrowser,
  type ChallengeAvailability,
} from "@/components/drafts/challenge-browser";
import { ChallengeModeToggle } from "@/components/drafts/challenge-mode-toggle";
import { DifficultyPicker } from "@/components/drafts/difficulty-picker";
import {
  DraftSourceToggle,
  type DraftSource,
} from "@/components/drafts/draft-source-toggle";
import { DiyCompactFilmRow } from "@/components/drafts/diy/diy-compact-film-row";
import type { DiySelectableFilmView } from "@/components/drafts/diy/diy-film-card";
import { LinkedSliders } from "@/components/drafts/linked-sliders";
import { TimeModeToggle } from "@/components/drafts/time-mode-toggle";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { createDefaultSplit, type DraftSplit } from "@/domain/drafts/split";
import {
  FREEFORM_BATCH_SIZE,
  getFilmCount,
  isFreeform,
} from "@/domain/drafts/difficulty";
import type {
  DraftChallengeMode,
  DraftDifficulty,
  DraftTimeMode,
} from "@/repositories";
import { createDraftAction, type CreateDraftActionState } from "./actions";

const INITIAL_STATE: CreateDraftActionState = { error: null };

interface NewDraftFormProps {
  activeWatchlistCount: number;
  challenges: ChallengeAvailability[];
  availableGenres: string[];
  diyEligibleFilms: DiySelectableFilmView[];
}

export function NewDraftForm({
  activeWatchlistCount,
  challenges,
  availableGenres,
  diyEligibleFilms,
}: NewDraftFormProps) {
  const router = useRouter();
  const { activeProfile, repositories } = useProfileContext();
  const [state, formAction, isPending] = useActionState(
    (prevState: CreateDraftActionState, formData: FormData) =>
      createDraftAction(
        {
          repositories,
          profileId: activeProfile!.id,
          timezone: activeProfile!.timezone,
          franchiseChronologicalOrder:
            activeProfile?.settings.franchiseChronologicalOrder ?? false,
        },
        prevState,
        formData,
      ),
    INITIAL_STATE,
  );
  const [difficulty, setDifficulty] = useState<DraftDifficulty | null>(null);
  const [source, setSource] = useState<DraftSource>("random");
  const [timeMode, setTimeMode] = useState<DraftTimeMode>("calendar");
  const [split, setSplit] = useState<DraftSplit | null>(null);
  const [challengeMode, setChallengeMode] =
    useState<DraftChallengeMode>("decide");
  const [chosenChallengeIds, setChosenChallengeIds] = useState<string[]>([]);
  const [manualGenre, setManualGenre] = useState("");
  const [diyChallengeFilmEntryIds, setDiyChallengeFilmEntryIds] = useState<
    string[]
  >([]);
  const handledDraftId = useRef<string | null>(null);

  useEffect(() => {
    if (state.draftId && handledDraftId.current !== state.draftId) {
      handledDraftId.current = state.draftId;
      router.push(
        state.challengeWarning
          ? `/drafts?challengeWarning=${encodeURIComponent(state.challengeWarning)}`
          : "/drafts",
      );
    }
  }, [state.draftId, state.challengeWarning, router]);

  const freeform = difficulty !== null && isFreeform(difficulty);
  const challengeCount = split?.challengeCount ?? 0;
  const diySlotsChosen = chosenChallengeIds.filter((id) => id === "diy").length;
  // "diyChallengeFilmEntryIds" serves two different caps depending on
  // mode — one pre-picked film per deliberately-chosen "diy" slot under
  // "Choose My Challenge", or up to `challengeCount` optional backups
  // under "Decide For Me" — so it's clamped HERE, derived at render time,
  // rather than written back into state from an effect (which would
  // cascade an extra render for no benefit — see "you might not need an
  // effect"). Whichever cap shrinks (the split slider, switching modes,
  // removing a chosen "diy" chip) is reflected immediately without ever
  // needing its own dedicated reset call site.
  const diyFilmEntryIdsCap =
    challengeMode === "choose" ? diySlotsChosen : challengeCount;
  const clampedDiyChallengeFilmEntryIds = diyChallengeFilmEntryIds.slice(
    0,
    diyFilmEntryIdsCap,
  );

  function handleSelectDifficulty(id: DraftDifficulty) {
    setDifficulty(id);
    setSplit(isFreeform(id) ? null : createDefaultSplit(getFilmCount(id)));
    setChosenChallengeIds([]);
    setDiyChallengeFilmEntryIds([]);
  }

  function handleSplitChange(next: DraftSplit) {
    setSplit(next);
    // A shrinking challenge count drops the excess chosen challenges (from the end) rather
    // than leaving stale selections that no longer match the slider.
    setChosenChallengeIds((current) => current.slice(0, next.challengeCount));
  }

  const readyToSubmit =
    !!activeProfile &&
    !!difficulty &&
    (source === "diy" ||
      freeform ||
      challengeCount === 0 ||
      challengeMode === "decide" ||
      (chosenChallengeIds.length === challengeCount &&
        clampedDiyChallengeFilmEntryIds.length === diySlotsChosen));

  function handleContinueToDiy() {
    if (!difficulty) return;
    router.push(
      `/drafts/new/diy?difficulty=${encodeURIComponent(difficulty)}&timeMode=${encodeURIComponent(timeMode)}`,
    );
  }

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-bold">
          Choose a difficulty
        </h2>
        <DifficultyPicker
          selected={difficulty}
          onSelect={handleSelectDifficulty}
          activeWatchlistCount={activeWatchlistCount}
        />
      </section>

      {difficulty ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            How do you want to build this draft?
          </h2>
          <DraftSourceToggle value={source} onChange={setSource} />
        </section>
      ) : null}

      {difficulty && source === "random" && !freeform && split ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            How do you want the list to be made?
          </h2>
          <LinkedSliders
            totalFilms={getFilmCount(difficulty)}
            split={split}
            onChange={handleSplitChange}
          />
        </section>
      ) : null}

      {difficulty && source === "random" && freeform ? (
        <section className="space-y-2">
          <h2 className="text-foreground text-lg font-bold">Freeform</h2>
          <p className="text-muted-foreground text-sm">
            We&apos;ll generate your first{" "}
            {Math.min(FREEFORM_BATCH_SIZE, activeWatchlistCount)} films now. You
            can generate more in batches of {FREEFORM_BATCH_SIZE} at any time —
            your final rank is based on how many films you finish.
          </p>
        </section>
      ) : null}

      {difficulty && source === "random" && !freeform && challengeCount > 0 ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">Challenge films</h2>
          <ChallengeModeToggle
            value={challengeMode}
            onChange={setChallengeMode}
          />
          {challengeMode === "choose" ? (
            <ChallengeBrowser
              challenges={challenges}
              availableGenres={availableGenres}
              slotsNeeded={challengeCount}
              selectedChallengeIds={chosenChallengeIds}
              onChange={setChosenChallengeIds}
              manualGenre={manualGenre}
              onManualGenreChange={setManualGenre}
              diyEligibleFilms={diyEligibleFilms}
              diyChallengeFilmEntryIds={clampedDiyChallengeFilmEntryIds}
              onDiyChallengeFilmEntryIdsChange={setDiyChallengeFilmEntryIds}
            />
          ) : (
            <details className="border-border bg-card rounded-lg border p-3">
              <summary className="text-foreground hover:text-primary focus-visible:outline-ring cursor-pointer text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2">
                Want a chance at a &quot;Pick Your Own&quot; challenge slot?
                (optional)
              </summary>
              <p className="text-muted-foreground mt-2 text-xs">
                Pre-select up to {challengeCount} backup film
                {challengeCount === 1 ? "" : "s"}. If one of your challenge
                slots happens to randomly land on &quot;Pick Your Own&quot;,
                it&apos;ll use one of these instead of picking on its own — with
                none selected, that slot is simply never left to chance.
              </p>
              {diyEligibleFilms.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  No eligible films on your watchlist right now.
                </p>
              ) : (
                <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {diyEligibleFilms.map((film) => {
                    const selected = clampedDiyChallengeFilmEntryIds.includes(
                      film.entryId,
                    );
                    return (
                      <li key={film.entryId}>
                        <DiyCompactFilmRow
                          film={film}
                          selected={selected}
                          onToggle={(entryId) =>
                            setDiyChallengeFilmEntryIds((current) => {
                              if (current.includes(entryId)) {
                                return current.filter((id) => id !== entryId);
                              }
                              if (current.length >= challengeCount) {
                                return current;
                              }
                              return [...current, entryId];
                            })
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          )}
        </section>
      ) : null}

      {difficulty ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">Deadline</h2>
          <TimeModeToggle value={timeMode} onChange={setTimeMode} />
        </section>
      ) : null}

      {difficulty && source === "random" ? (
        <>
          <input type="hidden" name="difficulty" value={difficulty} />
          <input type="hidden" name="timeMode" value={timeMode} />
          {split ? (
            <>
              <input
                type="hidden"
                name="randomCount"
                value={split.randomCount}
              />
              <input
                type="hidden"
                name="challengeCount"
                value={split.challengeCount}
              />
            </>
          ) : null}
          {!freeform && challengeCount > 0 ? (
            <>
              <input type="hidden" name="challengeMode" value={challengeMode} />
              {challengeMode === "choose"
                ? chosenChallengeIds.map((id, index) => (
                    <input
                      key={index}
                      type="hidden"
                      name="chosenChallengeIds"
                      value={id}
                    />
                  ))
                : null}
              {challengeMode === "choose" && manualGenre ? (
                <input type="hidden" name="manualGenre" value={manualGenre} />
              ) : null}
              {clampedDiyChallengeFilmEntryIds.map((entryId, index) => (
                <input
                  key={index}
                  type="hidden"
                  name="diyFilmEntryIds"
                  value={entryId}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}

      {state.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}

      <Button
        type={source === "diy" ? "button" : "submit"}
        disabled={!readyToSubmit || isPending}
        onClick={source === "diy" ? handleContinueToDiy : undefined}
      >
        {source === "diy"
          ? "Continue"
          : isPending
            ? "Creating draft…"
            : "Create draft"}
      </Button>
    </form>
  );
}
