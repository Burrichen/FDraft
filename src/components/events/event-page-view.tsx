"use client";

import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { getEventSettings } from "@/application/events/event-settings-store";
import { SayGoodbyeView } from "@/app/(app)/settings/say-goodbye-view";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getNextOccurrenceStart,
  isEventAvailable,
} from "@/domain/events/event-availability";
import { getEventDefinition } from "@/domain/events/event-registry";
import type { PointCurrency } from "@/domain/events/point-currency";
import { useAsyncData } from "@/hooks/use-async-data";
import { resolveEventTheme } from "./event-visual-themes";
import { useEventOptInFlow } from "./use-event-opt-in-flow";

const POINT_CURRENCY_LABELS: Record<PointCurrency, string> = {
  lifetime: "Lifetime Points",
  misery: "Misery Points",
  signal: "Signal Points",
  bounty: "Bounty Points",
};

/**
 * The shared shell every event's dedicated page renders (see
 * docs/updates, "PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE") —
 * `src/app/(app)/events/<id>/page.tsx` is just a thin static route
 * delegating here with a fixed `eventId`, so a new event's page is one
 * more thin file, not a new page implementation. Renders identically for
 * any event; nothing here branches on which one it is.
 *
 * A direct visit while not currently opted into this specific event shows
 * its live status (available now + a Join button, or "Returns <date>")
 * rather than erroring or redirecting — the route always exists.
 *
 * `renderEmptyState` (see docs/updates, "PROMPT 19 — HALLOWEEN DRAFT
 * MECHANICS") lets an opted-in event with no active event-sourced draft
 * plug in its own real creation flow instead of the generic "Nothing here
 * yet" placeholder — a genuinely event-specific UI (Halloween's three-pool
 * allocation form), without teaching this shared shell anything about
 * which event it is. A render function (not a plain node) so the caller
 * can trigger this component's own `reloadSilently` once a draft is
 * created, refreshing straight to the "active draft" card. Omitted
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

  const { data, reloadSilently } = useAsyncData(async () => {
    if (!profileId || !timezone || !event) return null;
    const [settings, effectiveNow] = await Promise.all([
      getEventSettings(repositories, profileId),
      getEffectiveEventDate(repositories, profileId),
    ]);
    const balance = event.pointType
      ? await repositories.points.getBalance(profileId, event.pointType)
      : null;
    const activeDraft =
      await repositories.drafts.getActiveOrExpiredDraft(profileId);
    return { settings, effectiveNow, balance, activeDraft };
  }, [profileId, timezone, repositories, event]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: reloadSilently,
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !event || !timezone || !data) {
    return null;
  }

  const { settings, effectiveNow, balance, activeDraft } = data;
  const isOptedIn = settings.eventsEnabled && settings.activeEvent === event.id;
  const theme = resolveEventTheme(event, settings.eventVisualsEnabled);
  const available = isEventAvailable(
    event.availability,
    effectiveNow,
    timezone,
  );
  const nextStart = getNextOccurrenceStart(
    event.availability,
    effectiveNow,
    timezone,
  );

  if (optIn.pendingSayGoodbye) {
    return (
      <div className="max-w-2xl space-y-6">
        <AlertDialog open onOpenChange={() => {}}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Say goodbye to your draft?</AlertDialogTitle>
              <AlertDialogDescription>
                Opting in replaces your active draft. Mark anything you&apos;ve
                watched, then confirm to close this draft out and continue —
                whatever&apos;s left unwatched is simply let go of, not held
                against you.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <SayGoodbyeView draftId={optIn.pendingSayGoodbye.draftId} />
            <AlertDialogFooter>
              <Button
                type="button"
                onClick={() => void optIn.confirmSayGoodbyeAction()}
                disabled={optIn.isSaving}
              >
                Say Goodbye
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={optIn.cancelSayGoodbye}
                disabled={optIn.isSaving}
              >
                Cancel
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

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
                onClick={() => void optIn.beginOptIn(event.id)}
                disabled={optIn.isSaving}
              >
                {event.intro.primaryActionLabel ?? "Opt In"}
              </Button>
            ) : nextStart ? (
              <p className="text-muted-foreground text-sm">
                Returns{" "}
                {formatInTimeZone(nextStart, timezone, "d MMMM 'at' h:mm a")}.
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
      ) : (
        <>
          {balance !== null && event.pointType ? (
            <Card>
              <CardContent>
                <p className="text-sm">
                  Your balance:{" "}
                  <strong className="tabular-nums">{balance}</strong>{" "}
                  {POINT_CURRENCY_LABELS[event.pointType]}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {activeDraft && activeDraft.sourceEventId === event.id ? (
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm">
                  You have an active draft for this event.
                </p>
                <Button nativeButton={false} render={<Link href="/drafts" />}>
                  Go to your draft
                </Button>
              </CardContent>
            </Card>
          ) : (
            (renderEmptyState?.(reloadSilently) ?? (
              <Card>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Nothing here yet — more is coming soon.
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
