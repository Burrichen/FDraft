"use client";

import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { HalloweenCandyBowl } from "@/components/events/halloween-candy-bowl";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
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
 * REWRITTEN (see docs/updates, "EVENT LIFECYCLE REPAIR" §2/§8) — the
 * previous version gated its ENTIRE opted-in experience (including
 * `DraftLifecycleView`) on `settings.activeEvent === HALLOWEEN_EVENT_ID`,
 * which meant an existing Draft could become inaccessible the moment that
 * single, easily-clobbered slot no longer pointed at Halloween (e.g. after
 * the natural window closed, since nothing ever cleared it, or after
 * opting into a different event). `DraftLifecycleView` is now ALWAYS
 * rendered — it already queries strictly by `sourceEventId`, independent
 * of any join/availability state — so an existing Draft is NEVER orphaned;
 * only the EMPTY-STATE content (create a new Draft vs. a join/return
 * prompt) depends on whether the profile is currently joined to Halloween
 * AND the event is still naturally available, read from the shared
 * `EventDiscoveryProvider` snapshot rather than a separate, independently-
 * stale `EventSettings` fetch.
 */
export function HalloweenPageClient() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const halloween = getEventDefinition(HALLOWEEN_EVENT_ID)!;
  const discovery = useEventDiscovery();

  const { data: hauntedPoints, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return repositories.points.getBalance(profileId, "haunted");
  }, [profileId, repositories]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: async () => {
      await Promise.all([reloadSilently(), discovery.refresh()]);
    },
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !timezone) {
    return null;
  }

  const status = discovery.result.statuses.find(
    (candidate) => candidate.event.id === HALLOWEEN_EVENT_ID,
  );
  const available = status?.available ?? false;
  // The same rule navigation itself uses (see `resolveVisibleEventPages`/
  // `isOccurrenceActiveNow`) — is what makes this page's own "active
  // seasonal destination" experience (the create-Draft flow, easter eggs,
  // Haunted Points) disappear once the window closes, consistent with the
  // nav tab disappearing at the exact same moment (Halloween can only
  // ever be joined DURING its natural window, so it has no manual-
  // activation exemption from that). Any EXISTING Draft still renders
  // regardless, via the unconditional `DraftLifecycleView` below.
  const isActiveForProfile = status ? isOccurrenceActiveNow(status) : false;
  const now = discovery.result.now;
  const theme = resolveEventTheme(
    halloween,
    discovery.result.eventVisualsEnabled,
  );
  const nextStart = getNextOccurrenceStart(
    halloween.availability,
    now,
    timezone,
  );
  const eventWindow = available
    ? getCurrentOccurrenceBounds(halloween.availability, now, timezone)
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
          {isActiveForProfile && eventWindow ? (
            <p className="page-subtitle">
              Event ends{" "}
              {formatInTimeZone(eventWindow.end, timezone, "d MMMM 'at' HH:mm")}
            </p>
          ) : null}
        </div>

        <DraftLifecycleView
          sourceEventId={HALLOWEEN_EVENT_ID}
          emptyState={
            isActiveForProfile ? (
              <HalloweenDraftCreationView onCreated={reloadSilently} />
            ) : (
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
                      {formatInTimeZone(
                        nextStart,
                        timezone,
                        "d MMMM 'at' h:mm a",
                      )}
                      .
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )
          }
        />

        {isActiveForProfile ? (
          <>
            {hauntedPoints !== null && hauntedPoints !== undefined ? (
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
        ) : null}
      </div>
    </div>
  );
}
