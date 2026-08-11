"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ChallengeBrowser,
  type ChallengeAvailability,
} from "@/components/drafts/challenge-browser";
import { ChallengeModeToggle } from "@/components/drafts/challenge-mode-toggle";
import { DifficultyPicker } from "@/components/drafts/difficulty-picker";
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
}

export function NewDraftForm({
  activeWatchlistCount,
  challenges,
  availableGenres,
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
        },
        prevState,
        formData,
      ),
    INITIAL_STATE,
  );
  const [difficulty, setDifficulty] = useState<DraftDifficulty | null>(null);
  const [timeMode, setTimeMode] = useState<DraftTimeMode>("calendar");
  const [split, setSplit] = useState<DraftSplit | null>(null);
  const [challengeMode, setChallengeMode] =
    useState<DraftChallengeMode>("decide");
  const [chosenChallengeIds, setChosenChallengeIds] = useState<string[]>([]);
  const [manualGenre, setManualGenre] = useState("");
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

  function handleSelectDifficulty(id: DraftDifficulty) {
    setDifficulty(id);
    setSplit(isFreeform(id) ? null : createDefaultSplit(getFilmCount(id)));
    setChosenChallengeIds([]);
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
    (freeform ||
      challengeCount === 0 ||
      challengeMode === "decide" ||
      chosenChallengeIds.length === challengeCount);

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">
          Choose a difficulty
        </h2>
        <DifficultyPicker
          selected={difficulty}
          onSelect={handleSelectDifficulty}
          activeWatchlistCount={activeWatchlistCount}
        />
      </section>

      {difficulty && !freeform && split ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-semibold">
            How do you want the list to be made?
          </h2>
          <LinkedSliders
            totalFilms={getFilmCount(difficulty)}
            split={split}
            onChange={handleSplitChange}
          />
        </section>
      ) : null}

      {difficulty && freeform ? (
        <section className="space-y-2">
          <h2 className="text-foreground text-lg font-semibold">Freeform</h2>
          <p className="text-muted-foreground text-sm">
            We&apos;ll generate your first{" "}
            {Math.min(FREEFORM_BATCH_SIZE, activeWatchlistCount)} films now. You
            can generate more in batches of {FREEFORM_BATCH_SIZE} at any time —
            your final rank is based on how many films you finish.
          </p>
        </section>
      ) : null}

      {difficulty && !freeform && challengeCount > 0 ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-semibold">
            Challenge films
          </h2>
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
            />
          ) : null}
        </section>
      ) : null}

      {difficulty ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-semibold">Deadline</h2>
          <TimeModeToggle value={timeMode} onChange={setTimeMode} />
        </section>
      ) : null}

      {difficulty ? (
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
            </>
          ) : null}
        </>
      ) : null}

      {state.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={!readyToSubmit || isPending}>
        {isPending ? "Creating draft…" : "Create draft"}
      </Button>
    </form>
  );
}
