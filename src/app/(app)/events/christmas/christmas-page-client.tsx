"use client";

import { EventPageView } from "@/components/events/event-page-view";
import { ChristmasDraftCreationView } from "@/components/events/christmas-draft-creation-view";
import { CHRISTMAS_EVENT_ID } from "@/domain/events/event-registry";

/**
 * A `"use client"` boundary is required here — `renderEmptyState` is a
 * function prop, which a Server Component `page.tsx` cannot pass to the
 * client `EventPageView` (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE
 * AT A TIME DRAFTING"; mirrors `HalloweenPageClient`'s identical need).
 */
export function ChristmasPageClient() {
  return (
    <EventPageView
      eventId={CHRISTMAS_EVENT_ID}
      renderEmptyState={(reload) => (
        <ChristmasDraftCreationView onCreated={reload} />
      )}
    />
  );
}
