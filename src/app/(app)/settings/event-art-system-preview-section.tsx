"use client";

import {
  EventDecorationSurface,
  getEventArtRegistration,
  listRegisteredEventIds,
} from "@/components/events/event-art-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ART_CATEGORIES = [
  "icons",
  "decorations",
  "modal",
  "interactives",
  "backgrounds",
] as const;

/**
 * A dev-only proof that the shared Event Art API (see docs/updates,
 * "EVENT ART SYSTEM — CHRISTMAS READINESS" §2) genuinely works for more
 * than Halloween — NOT a way to enable Christmas, or any other event,
 * for real use. Lists every event currently registered with
 * `registerEventArt` (`register-event-art.ts`) purely by asking the
 * registry (`listRegisteredEventIds`) — this component has no idea
 * "Halloween" or "Christmas" exist as concepts; a future event
 * (Carnival, ...) shows up here automatically the moment it registers,
 * with zero changes needed to this file.
 *
 * For each registered event: its nav icon if one is registered (absent
 * is a normal, rendered-as-"none" state, not an error), how many art
 * pack slots exist per category, and a small live decoration surface
 * preview — proving the manifest, icon, art pack, and slot config all
 * actually resolve and render, not just parse.
 */
export function EventArtSystemPreviewSection() {
  const eventIds = listRegisteredEventIds();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Event art system (dev preview)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground text-sm">
          Internal readiness check for the shared asset-pack/Designed Slot
          system — confirms a registered event&apos;s manifest, nav icon, art
          pack, and slot config all resolve and render. This does not enable any
          event for real use.
        </p>
        {eventIds.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No events are currently registered with the art system.
          </p>
        ) : null}
        {eventIds.map((eventId) => {
          const registration = getEventArtRegistration(eventId);
          if (!registration) {
            return null;
          }
          const NavIcon = registration.navIcon;
          return (
            <div
              key={eventId}
              className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-2">
                {NavIcon ? (
                  <NavIcon aria-hidden="true" className="size-5" />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    (no nav icon registered)
                  </span>
                )}
                <span className="font-medium">{registration.displayName}</span>
                <span className="text-muted-foreground text-xs">
                  ({eventId})
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {ART_CATEGORIES.map(
                  (category) =>
                    `${category}: ${Object.keys(registration.artPack[category]).length}`,
                ).join(" · ")}
              </p>
              <div className="bg-muted/30 relative h-28 overflow-hidden rounded border">
                <EventDecorationSurface
                  eventId={eventId}
                  surfaceKey="page"
                  seedInputs={{ profileId: null }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
