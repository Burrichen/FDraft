"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { EventOneAtATimeBuilderView } from "@/components/events/event-one-at-a-time-builder-view";
import { getEventDefinition } from "@/domain/events/event-registry";
import { getEventOneAtATimeCategories } from "@/domain/events/one-at-a-time-categories";
import { AsyncDataError } from "@/components/async-data-error";
import { OneAtATimeBuilderView } from "./one-at-a-time-builder-view";

/**
 * Dispatches `/drafts/new/one-at-a-time` between the normal builder and
 * the Event-aware one (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT
 * A TIME DRAFTING") — the SAME route/URL both `new-draft-form.tsx` (the
 * generic form, for whichever event happens to be currently active) and
 * each event's own dedicated creation view could in principle hand off
 * to, so a profile who reaches this page any of those ways gets the
 * correct experience. `?eventId=` absent (the overwhelmingly common case)
 * renders the untouched, normal `OneAtATimeBuilderView` — this file adds
 * a branch in front of it, never inside it.
 */
export function OneAtATimeRouteView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return <OneAtATimeBuilderView />;
  }

  const event = getEventDefinition(eventId);
  if (!event) {
    return (
      <div className="max-w-2xl space-y-6">
        <AsyncDataError
          error={new Error("This event is no longer registered.")}
          onRetry={() => router.replace("/drafts/new")}
        />
      </div>
    );
  }

  const sourceEventManuallyEnabled =
    searchParams.get("sourceEventManuallyEnabled") === "true";

  return (
    <EventOneAtATimeBuilderView
      eventId={eventId}
      eventName={event.name}
      categories={getEventOneAtATimeCategories(eventId)}
      sourceEventManuallyEnabled={sourceEventManuallyEnabled}
      onDone={() => router.push("/drafts")}
      onCancel={() => router.push("/drafts/new")}
    />
  );
}
