"use client";

import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { getEventSettings } from "@/application/events/event-settings-store";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { HalloweenCandyBowl } from "@/components/events/halloween-candy-bowl";
import { HalloweenDecorativeLayer } from "@/components/events/halloween-decorative-layer";
import { HalloweenDraftCreationView } from "@/components/events/halloween-draft-creation-view";
import { HalloweenGravestone } from "@/components/events/halloween-gravestone";
import { HalloweenPumpkin } from "@/components/events/halloween-pumpkin";
import { resolveEventTheme } from "@/components/events/event-visual-themes";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/**
 * The Halloween Event page — a genuine themed counterpart of the normal
 * Draft page (see docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD +
 * DEADLINE + STATS"), NOT a delegate to the generic `EventPageView` shell
 * (which January still uses unchanged): that shell's "description +
 * bullets" explanation is exactly the content the join modal already
 * covers, and has no place on the page itself once a profile is opted in
 * — this page shows event identity, the event's own deadline, Draft
 * creation, and the active Draft directly, with no extra navigation step
 * to get to any of them.
 *
 * The active/expired Draft itself is still the SHARED `DraftLifecycleView`
 * (see docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE") — reused,
 * not duplicated, so this page gets the exact same deadline/progress/film-
 * grid/watched-control quality as `/drafts` for free, scoped to
 * Halloween's own independent draft slot.
 */
export function HalloweenPageClient() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const halloween = getEventDefinition(HALLOWEEN_EVENT_ID)!;

  const { data, reloadSilently } = useAsyncData(async () => {
    if (!profileId || !timezone) return null;
    const [settings, effectiveNow, hauntedPoints] = await Promise.all([
      getEventSettings(repositories, profileId),
      getEffectiveEventDate(repositories, profileId),
      repositories.points.getBalance(profileId, "haunted"),
    ]);
    return { settings, effectiveNow, hauntedPoints };
  }, [profileId, timezone, repositories]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: reloadSilently,
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !timezone || !data) {
    return null;
  }

  const { settings, effectiveNow, hauntedPoints } = data;
  const isOptedIn =
    settings.eventsEnabled && settings.activeEvent === HALLOWEEN_EVENT_ID;
  const theme = resolveEventTheme(halloween, settings.eventVisualsEnabled);
  const available = isEventAvailable(
    halloween.availability,
    effectiveNow,
    timezone,
  );
  const nextStart = getNextOccurrenceStart(
    halloween.availability,
    effectiveNow,
    timezone,
  );
  const eventWindow = available
    ? getCurrentOccurrenceBounds(halloween.availability, effectiveNow, timezone)
    : null;

  return (
    <div className="theme-halloween relative">
      <HalloweenDecorativeLayer />
      <div className="relative max-w-2xl space-y-6">
        <div>
          <h1 className="page-heading flex flex-wrap items-center gap-2">
            {theme ? (
              <theme.icon aria-hidden="true" className="size-6" />
            ) : null}
            Halloween
          </h1>
          {isOptedIn && eventWindow ? (
            <p className="page-subtitle">
              Event ends{" "}
              {formatInTimeZone(eventWindow.end, timezone, "d MMMM 'at' HH:mm")}
            </p>
          ) : null}
        </div>

        {!isOptedIn ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {available ? "Available now" : "Not currently active"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {available ? (
                <Button
                  type="button"
                  onClick={() => void optIn.beginOptIn(HALLOWEEN_EVENT_ID)}
                  disabled={optIn.isSaving}
                >
                  {halloween.intro.primaryActionLabel ?? "Opt In"}
                </Button>
              ) : nextStart ? (
                <p className="text-muted-foreground text-sm">
                  Returns{" "}
                  {formatInTimeZone(nextStart, timezone, "d MMMM 'at' h:mm a")}.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            <DraftLifecycleView
              sourceEventId={HALLOWEEN_EVENT_ID}
              emptyState={
                <HalloweenDraftCreationView onCreated={reloadSilently} />
              }
            />

            {hauntedPoints !== null ? (
              <p className="text-muted-foreground text-sm">
                Haunted Points:{" "}
                <strong className="tabular-nums">{hauntedPoints}</strong>
              </p>
            ) : null}

            <div
              key={activeProfile.id}
              className="border-halloween-purple/20 flex flex-wrap items-end justify-center gap-6 border-t pt-6"
            >
              <HalloweenGravestone />
              <HalloweenPumpkin />
              <HalloweenCandyBowl />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
