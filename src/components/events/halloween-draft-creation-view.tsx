"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useState } from "react";
import { toast } from "sonner";
import { computeHalloweenPoolCapacity } from "@/application/drafts/halloween-fetch-context";
import { createHalloweenLocalDraft } from "@/application/drafts/halloween-draft-service";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { HalloweenDifficultyPicker } from "@/components/drafts/halloween-difficulty-picker";
import { HalloweenLinkedSliders } from "@/components/drafts/halloween-linked-sliders";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFilmCount } from "@/domain/drafts/difficulty";
import {
  createDefaultHalloweenSplit,
  type HalloweenSplit,
} from "@/domain/drafts/halloween-split";
import {
  getCurrentOccurrenceBounds,
  getNextOccurrenceStart,
  isEventAvailable,
} from "@/domain/events/event-availability";
import {
  getEventDefinition,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";
import type { DraftDifficulty } from "@/repositories";

/**
 * "Create Halloween Draft" — the Halloween Event page's empty state (see
 * docs/updates, "PROMPT 19 — HALLOWEEN DRAFT MECHANICS" §1/§2/§9;
 * deadline/layout revised by "PROMPT B2.2 — HALLOWEEN PAGE REBUILD +
 * DEADLINE + STATS"). Rendered directly by `HalloweenPageClient` — this
 * flow is genuinely Halloween-specific (a three-pool allocation, no
 * Freeform, its own generation function, ONE fixed event-end deadline
 * with no Calendar/Timer choice) rather than living in the generic Event
 * page shell.
 *
 * Gated on Halloween's own natural window (see docs/updates, "PROMPT 21 —
 * HALLOWEEN RELEASE HARDENING", §"HALLOWEEN EXPIRY") — a profile that
 * stayed opted in past the window's close still has a page (unchanged,
 * per Prompt 18), but this specific empty state stops offering a NEW
 * Halloween Draft once the season has ended, resuming automatically next
 * year (or immediately under Admin Mode's simulated date).
 */
export function HalloweenDraftCreationView({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [difficulty, setDifficulty] = useState<Exclude<
    DraftDifficulty,
    "freeform"
  > | null>(null);
  const [split, setSplit] = useState<HalloweenSplit | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const [availability, effectiveNow] = await Promise.all([
      computeHalloweenPoolCapacity(repositories, activeProfile.id),
      getEffectiveEventDate(repositories, activeProfile.id),
    ]);
    return { availability, effectiveNow };
  }, [activeProfile?.id, repositories]);

  function handleSelectDifficulty(id: Exclude<DraftDifficulty, "freeform">) {
    setDifficulty(id);
    setSplit(createDefaultHalloweenSplit(getFilmCount(id)));
  }

  async function handleCreate() {
    if (!activeProfile || !difficulty || !split || !data) return;
    setIsCreating(true);
    setError(null);
    try {
      const outcome = await createHalloweenLocalDraft(repositories, {
        profileId: activeProfile.id,
        timezone: activeProfile.timezone,
        difficulty,
        split,
        effectiveNow: data.effectiveNow,
      });
      if (outcome.ok) {
        toast.success("Halloween Draft created");
        onCreated();
      } else {
        setError(outcome.message);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create your Halloween Draft.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  if (!activeProfile || !data) {
    return null;
  }

  const halloween = getEventDefinition(HALLOWEEN_EVENT_ID)!;
  const available = isEventAvailable(
    halloween.availability,
    data.effectiveNow,
    activeProfile.timezone,
  );

  if (!available) {
    const nextStart = getNextOccurrenceStart(
      halloween.availability,
      data.effectiveNow,
      activeProfile.timezone,
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Halloween has wrapped up for this year
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
  // Halloween has ONE fixed deadline — the end of the CURRENT occurrence
  // (see docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
  // STATS" §3) — never a Calendar/Timer choice. Non-null: `available` above
  // already confirmed `data.effectiveNow` falls inside this occurrence.
  const eventDeadline = getCurrentOccurrenceBounds(
    halloween.availability,
    data.effectiveNow,
    activeProfile.timezone,
  )!.end;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Halloween Draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-1.5">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Event Deadline
            </h3>
            <p className="text-foreground text-sm">
              {formatInTimeZone(
                eventDeadline,
                activeProfile.timezone,
                "d MMMM",
              )}{" "}
              — ends at midnight
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-foreground text-sm font-bold">
              Choose a difficulty
            </h3>
            <HalloweenDifficultyPicker
              selected={difficulty}
              onSelect={handleSelectDifficulty}
            />
          </section>

          {difficulty && split && availability ? (
            <section className="space-y-3">
              <h3 className="text-foreground text-sm font-bold">
                Halloween-adjacent / Horror / Kitsch
              </h3>
              <p className="text-muted-foreground text-xs">
                Halloween-adjacent {availability.halloweenAdjacentAvailable}{" "}
                available / Horror {availability.horrorAvailable} available /
                Kitsch {availability.kitschAvailable} available.
              </p>
              <HalloweenLinkedSliders
                totalFilms={getFilmCount(difficulty)}
                split={split}
                onChange={setSplit}
                availability={availability}
              />
            </section>
          ) : null}

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <Button
            type="button"
            disabled={!difficulty || !split || isCreating}
            onClick={() => void handleCreate()}
          >
            {isCreating ? "Creating…" : "Create Halloween Draft"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
