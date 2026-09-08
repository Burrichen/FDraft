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
  const categories = event ? getEventOneAtATimeCategories(eventId) : null;
  // A hand-crafted `?eventId=` for an unregistered event, or for one with
  // no One At A Time drafting at all, both land here. The latter is now a
  // real case: a `singleFilmDraft` event (January — see
  // `EventDefinition.singleFilmDraft`, docs/updates "FDRAFT UPDATE 1 — F*
  // YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §4) has no builder, no
  // categories and no staged-film flow of any kind, so opening this
  // builder for it would be meaningless — and would write into a Draft
  // slot that belongs solely to its own one-film roll. `new-draft-form.tsx`
  // already never hands off such an event; this is the guard for a URL
  // that arrives any other way.
  if (!event || !categories || categories.length === 0) {
    return (
      <div className="max-w-2xl space-y-6">
        <AsyncDataError
          error={
            new Error(
              event
                ? `${event.name} doesn't use One At A Time drafting.`
                : "This event is no longer registered.",
            )
          }
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
      categories={categories}
      sourceEventManuallyEnabled={sourceEventManuallyEnabled}
      onDone={() => router.push("/drafts")}
      onCancel={() => router.push("/drafts/new")}
    />
  );
}
