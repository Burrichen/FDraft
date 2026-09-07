"use client";

import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { EventOneAtATimeBuilderView } from "@/components/events/event-one-at-a-time-builder-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHRISTMAS_EVENT_ID } from "@/domain/events/event-registry";
import { EVENT_ONE_AT_A_TIME_CATEGORIES } from "@/domain/events/one-at-a-time-categories";

/**
 * Christmas's Event page empty state (see docs/updates, "FDRAFT UPDATE 1
 * — EVENT ONE AT A TIME DRAFTING") — plugged into the generic
 * `EventPageView` via `renderEmptyState`, the same seam Halloween's own
 * (much larger, bulk-generation) creation view uses. Christmas only ever
 * offers One At A Time — no split-slider bulk generation exists for it
 * (out of scope; not requested), so there's no difficulty picker here at
 * all, just the builder directly.
 *
 * Unlike Halloween (`manualActivationAllowed: false`), Christmas CAN be
 * manually enabled — so this reads `manuallyEnabled` itself from the
 * shared `EventDiscoveryProvider` snapshot (the same one `EventPageView`
 * already used to decide this empty state should render at all) to pass
 * the correct persisted activation context into `finalizeEventOneAtATimeDraft`.
 */
export function ChristmasDraftCreationView({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { result } = useEventDiscovery();
  const status = result.statuses.find(
    (candidate) => candidate.event.id === CHRISTMAS_EVENT_ID,
  );

  if (!status || !isOccurrenceActiveNow(status)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Christmas isn&apos;t currently active
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Check back during the season, or opt in manually from Settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <EventOneAtATimeBuilderView
      eventId={CHRISTMAS_EVENT_ID}
      eventName="Christmas"
      categories={EVENT_ONE_AT_A_TIME_CATEGORIES[CHRISTMAS_EVENT_ID]!}
      sourceEventManuallyEnabled={status.manuallyEnabled}
      onDone={onCreated}
      onCancel={onCreated}
    />
  );
}
