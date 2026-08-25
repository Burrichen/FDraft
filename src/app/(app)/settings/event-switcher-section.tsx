"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getEventDefinition } from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";
import { describeEventAvailabilityWindow } from "./event-availability-copy";

/**
 * The Settings page's Events section (see docs/product-spec.md, event
 * system Phase 2/5/6; revised by docs/updates, "EVENT LIFECYCLE REPAIR"
 * §2/§9 and "SETTINGS INFORMATION ARCHITECTURE REBUILD" §4/§5). A normal
 * user can now ONLY ever join an event that's CURRENTLY naturally active —
 * there is no catalogue of inactive events a normal user can force on
 * outside their natural window, and there is no Event Testing tooling
 * here at all (that lives in Developer — see `developer-section.tsx`).
 * Two states:
 *
 *  - Not currently in an event: "Available now" lists every naturally-
 *    active, not-yet-joined event (with its natural window and a Join
 *    button), or a plain "No events are currently running" message when
 *    nothing qualifies. A previously-declined event still appears here
 *    while its occurrence is naturally active (declining only suppresses
 *    the introduction modal, never the ability to join from here).
 *  - Currently in one: "Current Event" names it, offers an "Open <event>"
 *    link straight to its page, and exposes its two independent toggles —
 *    "Event Visuals" (purely cosmetic) and "Event Gameplay".
 *
 * "Current Event" is shown whenever `EventSettings.activeEvent` names an
 * event this profile is genuinely JOINED to (occurrence participation
 * `"joined"`) — NOT gated on `eventsEnabled` (see docs/updates, "HALLOWEEN
 * PAGE REBUILD" §10, fixing a real bug: turning Event Gameplay off used to
 * ALSO decline the occurrence via `leaveEventOccurrence`, which silently
 * removed the profile's joined page/nav the moment Gameplay was switched
 * off — a destructive side effect nothing about "Gameplay" should ever
 * imply). "Event Gameplay" now does exactly one thing: flips
 * `EventSettings.eventsEnabled`, a plain per-profile flag consumers like
 * Halloween's own create-Draft flow read to decide whether NEW gameplay
 * actions are currently allowed — it never touches participation, never
 * removes the page/nav, and never touches any Draft. Leaving an event
 * entirely isn't exposed here at all (no such affordance previously
 * existed either) — `leaveEventOccurrence` (`event-opt-in.ts`) remains
 * available for a future explicit "Leave" action, just no longer wired to
 * this checkbox. Also NOT gated on the event still being naturally
 * available — a profile should still be able to see and adjust these
 * toggles even after the event's natural window has closed. "Available
 * now" DOES read the shared `EventDiscoveryProvider` snapshot (see
 * docs/updates, "EVENT LIFECYCLE REPAIR" §4), so it correctly excludes
 * anything already joined through occurrence-participation. Every
 * mutation refreshes BOTH the local settings read and the shared
 * discovery snapshot, so navigation never lags behind a change made here.
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
  const currentEventStatus = currentEvent
    ? discovery.result.statuses.find(
        (status) => status.event.id === currentEvent.id,
      )
    : undefined;
  const isCurrentlyJoined =
    currentEvent !== null && currentEventStatus?.participation === "joined";

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

  async function handleEventGameplayChange(value: boolean) {
    if (!profileId || !settings) return;
    setIsSaving(true);
    try {
      await setEventSettings(repositories, profileId, {
        ...settings,
        eventsEnabled: value,
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
      <CardContent className="space-y-4">
        {isCurrentlyJoined && currentEvent ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Current Event
                </p>
                <p className="text-foreground text-sm font-medium">
                  {currentEvent.name}
                </p>
              </div>
              {currentEvent.page ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={currentEvent.page.route} />}
                >
                  Open {currentEvent.name}
                </Button>
              ) : null}
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
                  When off, you can&apos;t start a new {currentEvent.name} Draft
                  — your page, existing Drafts, and history all stay exactly as
                  they are.
                </p>
              </div>
              <input
                id="event-gameplay-enabled"
                type="checkbox"
                checked={settings.eventsEnabled}
                disabled={isSaving}
                onChange={(event) =>
                  void handleEventGameplayChange(event.target.checked)
                }
                className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>
          </>
        ) : (
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Available now
            </p>
            {availableEvents.length === 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-muted-foreground text-sm">
                  No events are currently running.
                </p>
                <p className="text-muted-foreground text-sm">
                  Seasonal events will appear here when available.
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-3">
                {availableEvents.map((event) => {
                  const availabilityWindow = describeEventAvailabilityWindow(
                    event.availability,
                  );
                  return (
                    <li
                      key={event.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-foreground text-sm font-medium">
                          {event.name}
                        </p>
                        {availabilityWindow ? (
                          <p className="text-muted-foreground text-sm">
                            {availabilityWindow}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void optIn.beginOptIn(event.id)}
                        disabled={optIn.isSaving}
                      >
                        {event.intro.primaryActionLabel ?? "Join"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
