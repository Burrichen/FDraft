"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  beginEventOptIn,
  confirmSayGoodbye,
} from "@/application/events/event-opt-in";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import { SayGoodbyeView } from "./say-goodbye-view";

/**
 * The Settings page's Event Switcher (see docs/product-spec.md, event
 * system Phase 2). Two independent toggles:
 *  - "Events": full participation (special drafting rules, eligibility,
 *    scoring). No such rules exist yet — `src/domain/events/event-registry.ts`
 *    is empty — so this has no visible effect until a real event ships.
 *    Turning it ON is this app's one existing "opt into an event" action
 *    (see event system Phase 3, "SAY GOODBYE") — with an active draft,
 *    this shows the Say Goodbye screen instead of saving immediately.
 *  - "Event visuals": cosmetic-only, deliberately independent, and never
 *    gated by Say Goodbye — it doesn't touch drafts at all.
 * `activeEvent`/`manuallyEnabledEvents` (also part of `EventSettings`)
 * have no UI here yet — there's nothing to choose between until real
 * events are registered.
 */
export function EventSwitcherSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isSaving, setIsSaving] = useState(false);
  const [sayGoodbyeDraftId, setSayGoodbyeDraftId] = useState<string | null>(
    null,
  );
  const profileId = activeProfile?.id ?? null;

  const { data: settings, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return getEventSettings(repositories, profileId);
  }, [profileId]);

  if (!activeProfile || !settings) {
    return null;
  }

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
    setIsSaving(true);
    try {
      if (!value) {
        // Turning participation off never touches an active draft — only
        // turning it ON while one exists needs Say Goodbye.
        await setEventSettings(repositories, profileId, {
          ...settings,
          eventsEnabled: false,
        });
        await reloadSilently();
        return;
      }

      const result = await beginEventOptIn(repositories, { profileId });
      if (result.needsSayGoodbye) {
        setSayGoodbyeDraftId(result.activeDraftId);
      } else {
        // No active draft — the existing, unchanged immediate opt-in path;
        // beginEventOptIn already applied it.
        await reloadSilently();
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save that setting.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSayGoodbyeConfirm() {
    if (!profileId || !sayGoodbyeDraftId) return;
    setIsSaving(true);
    try {
      await confirmSayGoodbye(repositories, {
        profileId,
        draftId: sayGoodbyeDraftId,
      });
      setSayGoodbyeDraftId(null);
      await reloadSilently();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not close out that draft.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleSayGoodbyeCancel() {
    // Cancel is just closing the screen — nothing was ever saved (the
    // draft was never touched, eventsEnabled was never written).
    setSayGoodbyeDraftId(null);
  }

  if (sayGoodbyeDraftId) {
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
          <SayGoodbyeView draftId={sayGoodbyeDraftId} />
          <div className="flex gap-3 border-t pt-4">
            <Button
              type="button"
              onClick={() => void handleSayGoodbyeConfirm()}
              disabled={isSaving}
            >
              Say Goodbye
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSayGoodbyeCancel}
              disabled={isSaving}
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
            disabled={isSaving}
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
      </CardContent>
    </Card>
  );
}
