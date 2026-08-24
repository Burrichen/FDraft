"use client";

import { Skull } from "lucide-react";
import { useState } from "react";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { HalloweenJumpscareOverlay } from "./halloween-jumpscare-overlay";

/**
 * The "Haunted" settings control (see docs/updates, "PROMPT 20 —
 * HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER EGGS" §11) — only visible
 * while Halloween is currently joined AND naturally available, the exact
 * same rule navigation itself uses (see `resolveVisibleEventPages`,
 * docs/updates "EVENT LIFECYCLE REPAIR" §3/§9). Read from the shared
 * `EventDiscoveryProvider` snapshot rather than a raw `EventSettings.
 * activeEvent` check — that single slot can point at a DIFFERENT event a
 * profile joined more recently even while Halloween's own occurrence is
 * still genuinely joined, which would have hidden this section
 * incorrectly. Both `armed`/`triggered` are plain component state — never
 * a profile setting, never persisted — so a reload always starts back at
 * the unarmed state ("reloading may reset it... do not persist Haunted
 * usage").
 */
export function HauntedSection() {
  const { result } = useEventDiscovery();
  const [armed, setArmed] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const halloweenStatus = result.statuses.find(
    (status) => status.event.id === HALLOWEEN_EVENT_ID,
  );
  const isHalloweenActive = halloweenStatus
    ? isOccurrenceActiveNow(halloweenStatus)
    : false;

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
