"use client";

import { Skull } from "lucide-react";
import { useState } from "react";
import { getEventSettings } from "@/application/events/event-settings-store";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";
import { HalloweenJumpscareOverlay } from "./halloween-jumpscare-overlay";

/**
 * The "Haunted" settings control (see docs/updates, "PROMPT 20 —
 * HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER EGGS" §11) — only visible
 * while Halloween is the profile's currently active event (the one new
 * "gate on `EventSettings`, not a profile setting" pattern in Settings;
 * every other conditional Settings section gates on `activeProfile.settings`
 * directly). Both `armed`/`triggered` are plain component state — never a
 * profile setting, never persisted — so a reload always starts back at
 * the unarmed state ("reloading may reset it... do not persist Haunted
 * usage").
 */
export function HauntedSection() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const [armed, setArmed] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const { data: isHalloweenActive } = useAsyncData(async () => {
    if (!profileId) return false;
    const settings = await getEventSettings(repositories, profileId);
    return (
      settings.eventsEnabled && settings.activeEvent === HALLOWEEN_EVENT_ID
    );
  }, [profileId, repositories]);

  if (!isHalloweenActive) {
    return null;
  }

  function handlePress() {
    if (triggered) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setTriggered(true);
    setOverlayVisible(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Haunted</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          A strange control has appeared while Halloween is active. It looks
          suspicious.
        </p>
        {armed && !triggered ? (
          <p className="text-destructive text-sm font-semibold">
            There is no going back. Don&apos;t do it.
          </p>
        ) : null}
        <Button
          type="button"
          variant={armed ? "destructive" : "outline"}
          disabled={triggered}
          onClick={handlePress}
          className="gap-2"
        >
          <Skull aria-hidden="true" className="size-4" />
          Haunted
        </Button>
      </CardContent>
      {overlayVisible ? (
        <HalloweenJumpscareOverlay onDismiss={() => setOverlayVisible(false)} />
      ) : null}
    </Card>
  );
}
