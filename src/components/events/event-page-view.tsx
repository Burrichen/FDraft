"use client";

import { formatInTimeZone } from "date-fns-tz";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNextOccurrenceStart } from "@/domain/events/event-availability";
import { getEventDefinition } from "@/domain/events/event-registry";
import type { PointCurrency } from "@/domain/events/point-currency";
import { useAsyncData } from "@/hooks/use-async-data";
import { useEventDiscovery } from "./event-discovery-provider";
import { resolveEventTheme } from "./event-visual-themes";
import { useEventOptInFlow } from "./use-event-opt-in-flow";

const POINT_CURRENCY_LABELS: Record<PointCurrency, string> = {
  lifetime: "Lifetime Points",
  misery: "Misery Points",
  signal: "Signal Points",
  bounty: "Bounty Points",
  haunted: "Haunted Points",
};

/**
 * The shared shell every event's dedicated page renders (see
 * docs/updates, "PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE") —
 * `src/app/(app)/events/<id>/page.tsx` is just a thin static route
 * delegating here with a fixed `eventId`, so a new event's page is one
 * more thin file, not a new page implementation. Renders identically for
 * any event; nothing here branches on which one it is.
 *
 * A direct visit while not currently joined to this specific event shows
 * its live status (available now + a Join button, or "Returns <date>")
 * rather than erroring or redirecting — the route always exists.
 *
 * REWRITTEN (see docs/updates, "EVENT LIFECYCLE REPAIR" §2/§8) — the
 * previous version gated its ENTIRE opted-in experience, including
 * `DraftLifecycleView`, on `settings.activeEvent === event.id`, a single
 * slot nothing ever cleared on expiry and that unrelated draft-tagging
 * code also read. `DraftLifecycleView` is now ALWAYS rendered — it
 * already queries strictly by `sourceEventId`, independent of any join/
 * availability state — so an existing Draft is never orphaned by the
 * window closing or the profile leaving; only the EMPTY-STATE content
 * (create a Draft vs. a join/return prompt) depends on whether the
 * profile is currently joined to this event AND it's still naturally
 * available, read from the shared `EventDiscoveryProvider` snapshot
 * rather than a separate, independently-stale `EventSettings` fetch.
 *
 * `renderEmptyState` (see docs/updates, "PROMPT 19 — HALLOWEEN DRAFT
 * MECHANICS") lets an opted-in event with no active event-sourced draft
 * plug in its own real creation flow instead of the generic "Nothing here
 * yet" placeholder — a genuinely event-specific UI (Halloween's three-pool
 * allocation form), without teaching this shared shell anything about
 * which event it is. A render function (not a plain node) so the caller
 * can trigger this component's own `reloadSilently` once a draft is
 * created, refreshing straight to the "active draft" view. Omitted
 * (January) keeps today's default exactly.
 */
export function EventPageView({
  eventId,
  renderEmptyState,
}: {
  eventId: string;
  renderEmptyState?: (reload: () => void) => ReactNode;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const event = getEventDefinition(eventId);
  const discovery = useEventDiscovery();

  const { data: balance, reloadSilently } = useAsyncData(async () => {
    if (!profileId || !event?.pointType) return null;
    return repositories.points.getBalance(profileId, event.pointType);
  }, [profileId, repositories, event]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: async () => {
      await Promise.all([reloadSilently(), discovery.refresh()]);
    },
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !event || !timezone) {
    return null;
  }

  const status = discovery.result.statuses.find(
    (candidate) => candidate.event.id === eventId,
  );
  const available = status?.available ?? false;
  const isActiveForProfile = status ? isOccurrenceActiveNow(status) : false;
  const theme = resolveEventTheme(event, discovery.result.eventVisualsEnabled);
  const nextStart = getNextOccurrenceStart(
    event.availability,
    discovery.result.now,
    timezone,
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-heading flex flex-wrap items-center gap-2">
          {theme ? <theme.icon aria-hidden="true" className="size-6" /> : null}
          {event.name}
        </h1>
        <p className="page-subtitle">{event.intro.description}</p>
      </div>

      <Card>
        <CardContent>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {event.intro.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isActiveForProfile &&
      balance !== null &&
      balance !== undefined &&
      event.pointType ? (
        <Card>
          <CardContent>
            <p className="text-sm">
              Your balance: <strong className="tabular-nums">{balance}</strong>{" "}
              {POINT_CURRENCY_LABELS[event.pointType]}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <DraftLifecycleView
        sourceEventId={event.id}
        emptyState={
          isActiveForProfile ? (
            (renderEmptyState?.(reloadSilently) ?? (
              <Card>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Nothing here yet — more is coming soon.
                  </p>
                </CardContent>
              </Card>
            ))
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
                    onClick={() => void optIn.beginOptIn(event.id)}
                    disabled={optIn.isSaving}
                  >
                    {event.intro.primaryActionLabel ?? "Opt In"}
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
                ) : (
                  <Button
                    type="button"
                    onClick={() => void optIn.beginOptIn(event.id)}
                    disabled={optIn.isSaving}
                  >
                    {event.intro.primaryActionLabel ?? "Opt In"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        }
      />
    </div>
  );
}
