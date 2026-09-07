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
import { LinkedSliders } from "@/components/drafts/linked-sliders";
import { TimeModeToggle } from "@/components/drafts/time-mode-toggle";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { createDefaultSplit, type DraftSplit } from "@/domain/drafts/split";
import { getFilmCount, isOneAtATime } from "@/domain/drafts/difficulty";
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
  const discovery = useEventDiscovery();
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

  const oneAtATime = difficulty !== null && isOneAtATime(difficulty);
  const challengeCount = split?.challengeCount ?? 0;

  function handleSelectDifficulty(id: DraftDifficulty) {
    setDifficulty(id);
    setSplit(isOneAtATime(id) ? null : createDefaultSplit(getFilmCount(id)));
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
    (source === "diy" ||
      oneAtATime ||
      challengeCount === 0 ||
      challengeMode === "decide" ||
      chosenChallengeIds.length === challengeCount);

  function handleContinueToDiy() {
    if (!difficulty) return;
    router.push(
      `/drafts/new/diy?difficulty=${encodeURIComponent(difficulty)}&timeMode=${encodeURIComponent(timeMode)}`,
    );
  }

  // One At A Time (see docs/updates, "ONE AT A TIME DRAFTING — CORE
  // SYSTEM" §3/§15) has no random/manual/challenge SOURCE toggle of its
  // own here at all — every film's source is chosen individually, inside
  // the builder, one film at a time — so this only ever needs the
  // deadline choice carried over, exactly like the DIY hand-off already
  // carries `timeMode` through the URL rather than re-asking for it.
  //
  // See docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" —
  // resolves the current event the EXACT same way `createDraftAction`
  // already does for every other difficulty (`isOccurrenceActiveNow`
  // against the shared discovery snapshot, never `EventSettings.
  // activeEvent` directly — see that action's own comment on the stale-
  // January bug this avoids). When one is active, the One At A Time route
  // becomes event-aware (event-scoped candidates/finalisation) instead of
  // creating a plain draft — the same profile reaching this generic form
  // during Halloween/Christmas/January gets the correct event experience
  // here too, not just via each event's own dedicated page.
  function handleContinueToOneAtATime() {
    const currentEventStatus = discovery.result.eventsEnabled
      ? discovery.result.statuses.find(isOccurrenceActiveNow)
      : undefined;
    const params = new URLSearchParams({
      timeMode,
    });
    if (currentEventStatus) {
      params.set("eventId", currentEventStatus.event.id);
      params.set(
        "sourceEventManuallyEnabled",
        String(currentEventStatus.manuallyEnabled),
      );
    }
    router.push(`/drafts/new/one-at-a-time?${params.toString()}`);
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

      {difficulty && !oneAtATime ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">
            How do you want to build this draft?
          </h2>
          {/* Narrow on purpose — see `NewDraftView`'s own comment: this is
              a 2-option radiogroup, not a grid of cards, and would just
              become two absurdly wide, mostly-empty buttons at the page's
              full shared-shell width. */}
          <div className="max-w-xl">
            <DraftSourceToggle value={source} onChange={setSource} />
          </div>
        </section>
      ) : null}

      {difficulty && !oneAtATime && source === "random" && split ? (
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

      {difficulty &&
      !oneAtATime &&
      source === "random" &&
      challengeCount > 0 ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">Challenge films</h2>
          {/* Narrow on purpose, same reasoning as `DraftSourceToggle` above
              — a 2-option radiogroup, not something that benefits from the
              page's full width. */}
          <div className="max-w-xl">
            <ChallengeModeToggle
              value={challengeMode}
              onChange={setChallengeMode}
            />
          </div>
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
          <h2 className="text-foreground text-lg font-bold">Deadline</h2>
          {/* Narrow on purpose, same reasoning as the toggles above. */}
          <div className="max-w-xl">
            <TimeModeToggle value={timeMode} onChange={setTimeMode} />
          </div>
        </section>
      ) : null}

      {difficulty && !oneAtATime && source === "random" ? (
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
          {challengeCount > 0 ? (
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

      <Button
        type={source === "diy" || oneAtATime ? "button" : "submit"}
        disabled={!readyToSubmit || isPending}
        onClick={
          oneAtATime
            ? handleContinueToOneAtATime
            : source === "diy"
              ? handleContinueToDiy
              : undefined
        }
      >
        {source === "diy" || oneAtATime
          ? "Continue"
          : isPending
            ? "Creating draft…"
            : "Create draft"}
      </Button>
    </form>
  );
}
