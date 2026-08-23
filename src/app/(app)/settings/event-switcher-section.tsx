"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { isEventAvailable } from "@/domain/events/event-availability";
import {
  EVENT_DEFINITIONS,
  getEventDefinition,
} from "@/domain/events/event-registry";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * The Settings page's Event section (see docs/product-spec.md, event
 * system Phase 2/5/6; revised by docs/updates, "PROMPT B2.1 — DUAL DRAFT
 * ARCHITECTURE + EVENT ROUTING/SETTINGS FIXES" §4). A normal user can now
 * ONLY ever join an event that's CURRENTLY naturally active — there is no
 * catalogue of inactive events a normal user can force on (the previous
 * "manually activate any time, downgraded to Lifetime Points" catalogue
 * is gone). Two states:
 *
 *  - Not currently in an event: "AVAILABLE EVENTS" lists every naturally-
 *    active event with a Join button, or a plain "No events are currently
 *    running." message when nothing qualifies.
 *  - Currently in one: "CURRENT EVENT" names it and exposes its two
 *    independent toggles — "Event Visuals" (purely cosmetic) and "Event
 *    Gameplay" (full participation; turning it off leaves the event —
 *    settings only, never touches any Draft, normal or the event's own,
 *    see docs/updates §1).
 *
 * "Naturally active" is entirely `isEventAvailable`, evaluated against
 * `getEffectiveEventDate` — so Admin Mode's Event Testing override (see
 * `EventTestingSection`) makes a simulated event genuinely "available"
 * here too, with no separate "force" affordance of its own; everything
 * flows through the one central EventClock.
 */
export function EventSwitcherSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isSaving, setIsSaving] = useState(false);
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;

  const { data, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    const [settings, effectiveNow] = await Promise.all([
      getEventSettings(repositories, profileId),
      getEffectiveEventDate(repositories, profileId),
    ]);
    return { settings, effectiveNow };
  }, [profileId, repositories]);

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
  const { settings, effectiveNow } = data;

  const currentEvent = settings.activeEvent
    ? getEventDefinition(settings.activeEvent)
    : null;
  const isCurrentlyJoined = settings.eventsEnabled && currentEvent !== null;

  const availableEvents = EVENT_DEFINITIONS.filter(
    (event) =>
      event.id !== settings.activeEvent &&
      isEventAvailable(event.availability, effectiveNow, timezone),
  );

  async function handleEventVisualsChange(value: boolean) {
    if (!profileId) return;
    setIsSaving(true);
    try {
      await setEventSettings(repositories, profileId, {
        ...settings,
        eventVisualsEnabled: value,
      });
      await reloadSilently();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that setting.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLeaveCurrentEvent() {
    if (!profileId) return;
    setIsSaving(true);
    try {
      await setEventSettings(repositories, profileId, {
        ...settings,
        eventsEnabled: false,
        activeEvent: null,
      });
      await reloadSilently();
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
