"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { EventSettings } from "@/domain/events/event-settings";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * The Settings page's Event Switcher (see docs/product-spec.md, event
 * system Phase 2). Two independent toggles, matching that phase's own
 * split:
 *  - "Events": full participation (special drafting rules, eligibility,
 *    scoring). No such rules exist yet — `src/domain/events/event-registry.ts`
 *    is empty — so this has no visible effect until a real event ships.
 *  - "Event visuals": cosmetic-only, deliberately independent of the
 *    toggle above.
 * `activeEvent`/`manuallyEnabledEvents` (also part of `EventSettings`)
 * have no UI here yet — there's nothing to choose between until real
 * events are registered.
 */
export function EventSwitcherSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isSaving, setIsSaving] = useState(false);
  const profileId = activeProfile?.id ?? null;

  const { data: settings, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return getEventSettings(repositories, profileId);
  }, [profileId]);

  if (!activeProfile || !settings) {
    return null;
  }

  async function handleToggle(
    key: keyof Pick<EventSettings, "eventsEnabled" | "eventVisualsEnabled">,
    value: boolean,
  ) {
    if (!profileId || !settings) return;
    setIsSaving(true);
    try {
      await setEventSettings(repositories, profileId, {
        ...settings,
        [key]: value,
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
              void handleToggle("eventsEnabled", event.target.checked)
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
              void handleToggle("eventVisualsEnabled", event.target.checked)
            }
            className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>
      </CardContent>
    </Card>
  );
}
