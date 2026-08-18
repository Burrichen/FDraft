"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { isEventAvailable } from "@/domain/events/event-availability";
import { EVENT_DEFINITIONS } from "@/domain/events/event-registry";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import { SayGoodbyeView } from "./say-goodbye-view";

/**
 * The Settings page's Event Switcher (see docs/product-spec.md, event
 * system Phase 2/5/6). The event introduction modal (`EventIntroDialog`,
 * mounted app-wide) is now the PRIMARY way a profile discovers and enters
 * a newly-started event — this section is the fallback: a manual path for
 * a profile that dismissed that modal, missed it, or wants to opt in
 * outside the modal's own moment. Two independent toggles, plus a
 * catch-up affordance:
 *  - "Events": full participation. Turning it ON resolves whichever event
 *    is currently eligible — naturally available (see `isEventAvailable`)
 *    or, failing that, the first one allowing manual activation (see
 *    `beginEventOptIn`) — with no event name hardcoded here at all. With
 *    an active draft, this shows the Say Goodbye screen instead of saving
 *    immediately (see event system Phase 3, "SAY GOODBYE") — the exact
 *    same lifecycle `EventIntroDialog`'s "Opt In" button runs, via the
 *    shared `useEventOptInFlow` hook, so this never duplicates it.
 *  - "Event visuals": cosmetic-only, deliberately independent, and never
 *    gated by Say Goodbye — it doesn't touch drafts at all.
 *  - A currently-available-event notice, shown whenever one exists and
 *    the profile hasn't already opted into it — reachable regardless of
 *    whether that event's intro modal was ever dismissed (dismissal only
 *    ever suppresses the modal, never this).
 * No event-specific visual redesign here — this stays the same generic
 * presentation regardless of which event is actually eligible.
 */
export function EventSwitcherSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isSaving, setIsSaving] = useState(false);
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;

  const { data: settings, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return getEventSettings(repositories, profileId);
  }, [profileId]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: reloadSilently,
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !settings) {
    return null;
  }

  const availableEvent = EVENT_DEFINITIONS.find(
    (event) =>
      settings.activeEvent !== event.id &&
      (event.manualActivationAllowed ||
        (timezone !== null &&
          isEventAvailable(event.availability, new Date(), timezone))),
  );

  async function handleEventVisualsChange(value: boolean) {
    if (!profileId || !settings) return;
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

  async function handleEventsEnabledChange(value: boolean) {
    if (!profileId || !settings) return;
    if (!value) {
      // Turning participation off never touches an active draft — only
      // turning it ON while one exists needs Say Goodbye. Clears
      // activeEvent too, so a later opt-in always re-resolves fresh
      // rather than trusting a possibly-stale value.
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
          cause instanceof Error
            ? cause.message
            : "Could not save that setting.",
        );
      } finally {
        setIsSaving(false);
      }
      return;
    }
    await optIn.beginOptIn();
  }

  if (optIn.pendingSayGoodbye) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Say goodbye to your draft?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Turning on Events replaces your active draft. Mark anything
            you&apos;ve watched, then confirm to close this draft out and
            continue — whatever&apos;s left unwatched is simply let go of, not
            held against you.
          </p>
          <SayGoodbyeView draftId={optIn.pendingSayGoodbye.draftId} />
          <div className="flex gap-3 border-t pt-4">
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
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="events-enabled" className="text-foreground text-sm">
              Events
            </Label>
            <p className="text-muted-foreground text-sm">
              Opt into special drafting rules and scoring while an event is
              running.
            </p>
          </div>
          <input
            id="events-enabled"
            type="checkbox"
            checked={settings.eventsEnabled}
            disabled={isSaving || optIn.isSaving}
            onChange={(event) =>
              void handleEventsEnabledChange(event.target.checked)
            }
            className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <Label
              htmlFor="event-visuals-enabled"
              className="text-foreground text-sm"
            >
              Event visuals
            </Label>
            <p className="text-muted-foreground text-sm">
              Independent of the setting above — purely cosmetic theming.
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

        {availableEvent ? (
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-foreground text-sm font-medium">
                {availableEvent.name}
              </p>
              <p className="text-muted-foreground text-sm">
                Available now — opt in here any time, whether or not you&apos;ve
                seen its introduction before.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void optIn.beginOptIn(availableEvent.id)}
              disabled={optIn.isSaving}
            >
              Opt In
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
