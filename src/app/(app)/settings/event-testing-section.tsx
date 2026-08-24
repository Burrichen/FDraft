"use client";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useState } from "react";
import { toast } from "sonner";
import {
  getEventDateOverride,
  setEventDateOverride,
} from "@/application/events/event-date-override-store";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { EventDateOverride } from "@/domain/events/event-date-override";
import { EVENT_DATE_OVERRIDE_PRESETS } from "@/domain/events/event-date-override-presets";
import { useAsyncData } from "@/hooks/use-async-data";

const OFF_VALUE = "off";
const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

/**
 * TEMPORARY developer/testing tool (see docs/updates, "PROMPT 17 — ADMIN
 * MODE + TEMPORARY EVENT TEST SWITCHER") — it will eventually be removed.
 * Only ever mounted by `SettingsView` while Admin Mode is on (this
 * component doesn't re-check that itself, matching how `RegenerateDraftButton`
 * trusts its own admin-gated mount point), so there's nothing here for a
 * normal user to ever see.
 *
 * Simulates a specific moment for EVENT-AVAILABILITY purposes only, via
 * `getEffectiveEventDate` (see `event-clock.ts`) — never the real clock
 * used anywhere else in the app. Selecting "Off" only clears `enabled`,
 * deliberately leaving `eventId`/`simulatedDate` as they were, so the same
 * configuration comes back the moment the override (or Admin Mode itself)
 * is turned back on.
 */
export function EventTestingSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isSaving, setIsSaving] = useState(false);
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const discovery = useEventDiscovery();

  const { data: override, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return getEventDateOverride(repositories, profileId);
  }, [profileId, repositories]);

  if (!activeProfile || !timezone || !override) {
    return null;
  }

  async function save(next: EventDateOverride) {
    if (!profileId) return;
    setIsSaving(true);
    try {
      await setEventDateOverride(repositories, profileId, next);
      // Admin's simulated date is the ONE input to `EventClock.now()` (see
      // docs/updates, "EVENT LIFECYCLE REPAIR" §6: "its only job is to
      // affect EventClock.now()") — the ordinary production lifecycle
      // (join/decline/expiry, nav, the intro modal) must react to it
      // exactly like real time passing would, so this refreshes the
      // shared discovery snapshot immediately rather than waiting for its
      // own periodic re-check.
      await Promise.all([reloadSilently(), discovery.refresh()]);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save this setting.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePresetChange(value: string) {
    if (!override) return;
    if (value === OFF_VALUE) {
      await save({ ...override, enabled: false });
      return;
    }
    // Re-selecting the event that's already configured just re-enables it,
    // preserving any manual date tweak rather than resetting it back to
    // the preset default.
    if (value === override.eventId) {
      await save({ ...override, enabled: true });
      return;
    }
    const preset = EVENT_DATE_OVERRIDE_PRESETS.find(
      (candidate) => candidate.eventId === value,
    );
    if (!preset || !timezone) return;
    const year = new Date().getFullYear();
    const simulated = fromZonedTime(
      new Date(year, preset.month - 1, preset.day, preset.hour, preset.minute),
      timezone,
    );
    await save({
      enabled: true,
      eventId: preset.eventId,
      simulatedDate: simulated.toISOString(),
    });
  }

  async function handleManualDateChange(value: string) {
    if (!override || !timezone || !value) return;
    const simulated = fromZonedTime(new Date(value), timezone);
    if (Number.isNaN(simulated.getTime())) return;
    await save({ ...override, simulatedDate: simulated.toISOString() });
  }

  const selectedLabel =
    EVENT_DATE_OVERRIDE_PRESETS.find(
      (preset) => preset.eventId === override.eventId,
    )?.label ?? override.eventId;
  const manualFieldValue =
    override.simulatedDate && timezone
      ? formatInTimeZone(
          new Date(override.simulatedDate),
          timezone,
          DATETIME_LOCAL_FORMAT,
        )
      : "";

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <Label
            htmlFor="event-date-override"
            className="text-foreground text-base"
          >
            Event Testing
          </Label>
          <p className="text-muted-foreground text-sm">
            Simulates a specific date/time for event-availability checks only —
            never the real clock used anywhere else in the app. This is a
            temporary tool for testing and will eventually be removed.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="event-date-override"
            className="text-foreground text-sm"
          >
            Event Date Override
          </Label>
          <select
            id="event-date-override"
            className="border-border bg-background focus-visible:outline-ring w-full rounded border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            value={
              override.eventId && override.enabled
                ? override.eventId
                : OFF_VALUE
            }
            disabled={isSaving}
            onChange={(event) => void handlePresetChange(event.target.value)}
          >
            <option value={OFF_VALUE}>Off</option>
            {EVENT_DATE_OVERRIDE_PRESETS.map((preset) => (
              <option key={preset.eventId} value={preset.eventId}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {override.eventId ? (
          <div className="space-y-1.5">
            <Label
              htmlFor="event-date-override-manual"
              className="text-foreground text-sm"
            >
              Simulated Event Date
            </Label>
            <input
              id="event-date-override-manual"
              type="datetime-local"
              className="border-border bg-background focus-visible:outline-ring w-full rounded border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              value={manualFieldValue}
              disabled={isSaving}
              onChange={(event) =>
                void handleManualDateChange(event.target.value)
              }
            />
            <p className="text-muted-foreground text-xs">
              In {timezone}. Useful for testing boundaries — just before the
              event starts, exact start, exact end.
            </p>
          </div>
        ) : null}

        {override.enabled && override.simulatedDate ? (
          <p className="text-muted-foreground border-t pt-3 text-xs tracking-wide uppercase">
            Test date active — {selectedLabel} ·{" "}
            {formatInTimeZone(
              new Date(override.simulatedDate),
              timezone,
              "d MMMM · HH:mm",
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
