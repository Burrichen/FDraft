"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { leaveEventOccurrence } from "@/application/events/event-opt-in";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getEventDefinition } from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * The Settings page's Event section (see docs/product-spec.md, event
 * system Phase 2/5/6; revised by docs/updates, "EVENT LIFECYCLE REPAIR"
 * §2/§9). A normal user can now ONLY ever join an event that's CURRENTLY
 * naturally active — there is no catalogue of inactive events a normal
 * user can force on outside their natural window. Two states:
 *
 *  - Not currently in an event: "AVAILABLE EVENTS" lists every naturally-
 *    active, not-yet-joined event with a Join button, or a plain "No
 *    events are currently running." message when nothing qualifies.
 *  - Currently in one: "CURRENT EVENT" names it and exposes its two
 *    independent toggles — "Event Visuals" (purely cosmetic) and "Event
 *    Gameplay" (full participation; turning it off leaves the event —
 *    settings only, never touches any Draft, normal or the event's own).
 *
 * "Current Event" itself is still `EventSettings.activeEvent`/
 * `eventsEnabled` directly (unchanged) — deliberately NOT gated on the
 * event still being naturally available, since these two toggles are a
 * gameplay/reward-currency settings concern (see §9), not a page/nav
 * existence one: a profile should still be able to see and adjust its
 * Visuals setting, or explicitly leave, even after the event's natural
 * window has closed. "Available Events" DOES read the shared
 * `EventDiscoveryProvider` snapshot (see docs/updates, "EVENT LIFECYCLE
 * REPAIR" §4), so it correctly excludes anything already joined through
 * occurrence-participation even in the (currently unreachable) case where
 * that diverges from `activeEvent`. Every mutation refreshes BOTH the
 * local settings read and the shared discovery snapshot, so navigation
 * never lags behind a join/leave made here.
 */
export function EventSwitcherSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isSaving, setIsSaving] = useState(false);
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const discovery = useEventDiscovery();

  const { data: settings, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return getEventSettings(repositories, profileId);
  }, [profileId, repositories]);

  async function refreshAll() {
    await Promise.all([reloadSilently(), discovery.refresh()]);
  }

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: refreshAll,
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !timezone || !settings) {
    return null;
  }

  const currentEvent = settings.activeEvent
    ? getEventDefinition(settings.activeEvent)
    : null;
  const isCurrentlyJoined = settings.eventsEnabled && currentEvent !== null;

  // The occurrence key for whatever the CURRENT event is, if any — needed
  // only so leaving can record the correct occurrence as declined (see
  // `handleLeaveCurrentEvent`); computed regardless of `available`, since
  // an occurrence key exists independent of whether the window happens to
  // still be open right now.
  const currentEventStatus = currentEvent
    ? discovery.result.statuses.find(
        (status) => status.event.id === currentEvent.id,
      )
    : undefined;

  const joinedEventIds = new Set(
    discovery.result.statuses
      .filter((status) => status.participation === "joined")
      .map((status) => status.event.id),
  );
  const availableEvents = discovery.result.statuses
    .filter(
      (status) =>
        status.available &&
        status.event.id !== settings.activeEvent &&
        !joinedEventIds.has(status.event.id),
    )
    .map((status) => status.event);

  async function handleEventVisualsChange(value: boolean) {
    if (!profileId || !settings) return;
    setIsSaving(true);
    try {
      await setEventSettings(repositories, profileId, {
        ...settings,
        eventVisualsEnabled: value,
      });
      await refreshAll();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that setting.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLeaveCurrentEvent() {
    if (!profileId || !currentEvent) return;
    setIsSaving(true);
    try {
      await leaveEventOccurrence(repositories, {
        profileId,
        eventId: currentEvent.id,
        occurrenceKey: currentEventStatus?.occurrenceKey ?? null,
      });
      await refreshAll();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that setting.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCurrentlyJoined && currentEvent ? (
          <>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Current Event
              </p>
              <p className="text-foreground text-sm font-medium">
                {currentEvent.name}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div>
                <Label
                  htmlFor="event-visuals-enabled"
                  className="text-foreground text-sm"
                >
                  Event Visuals
                </Label>
                <p className="text-muted-foreground text-sm">
                  Purely cosmetic theming, independent of the setting below.
                </p>
              </div>
              <input
                id="event-visuals-enabled"
                type="checkbox"
                checked={settings.eventVisualsEnabled}
                disabled={isSaving}
                onChange={(event) =>
                  void handleEventVisualsChange(event.target.checked)
                }
                className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div>
                <Label
                  htmlFor="event-gameplay-enabled"
                  className="text-foreground text-sm"
                >
                  Event Gameplay
                </Label>
                <p className="text-muted-foreground text-sm">
                  Turn off to leave {currentEvent.name} — your normal Draft, if
                  you have one, is never affected.
                </p>
              </div>
              <input
                id="event-gameplay-enabled"
                type="checkbox"
                checked={settings.eventsEnabled}
                disabled={isSaving}
                onChange={(event) => {
                  if (!event.target.checked) {
                    void handleLeaveCurrentEvent();
                  }
                }}
                className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
          </>
        ) : (
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Available Events
            </p>
            {availableEvents.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                No events are currently running.
              </p>
            ) : (
              <ul className="mt-2 space-y-3">
                {availableEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <p className="text-foreground text-sm font-medium">
                      {event.name}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void optIn.beginOptIn(event.id)}
                      disabled={optIn.isSaving}
                    >
                      {event.intro.primaryActionLabel ?? "Join"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
