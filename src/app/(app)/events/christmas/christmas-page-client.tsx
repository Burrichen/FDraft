"use client";

import { EventPageView } from "@/components/events/event-page-view";
import { ChristmasDraftCreationView } from "@/components/events/christmas-draft-creation-view";
import { CHRISTMAS_EVENT_ID } from "@/domain/events/event-registry";

/**
 * A `"use client"` boundary is required here — `renderEmptyState` is a
 * function prop, which a Server Component `page.tsx` cannot pass to the
 * client `EventPageView` (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE
 * AT A TIME DRAFTING"; mirrors `HalloweenPageClient`'s identical need).
 *
 * `theme-christmas` is applied HERE, once, wrapping the whole page (see
 * docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL
 * POLISH" §17) — the same one-class token reroute Halloween's and
 * January's own pages use. Everything inside it (the heading, the
 * difficulty picker's selected state, the category sliders, the Prefer
 * Watchlist control, buttons, focus rings, card grounds and borders)
 * picks up the Christmas palette through the app's own semantic tokens,
 * so no component below carries a Christmas colour of its own.
 *
 * Christmas keeps the GENERIC `EventPageView` shell rather than a bespoke
 * page like Halloween's and January's: its identity/deadline/Draft
 * presentation are all already what that shell renders, and the one thing
 * it needs on top — a real creation flow — is exactly what
 * `renderEmptyState` exists for. Nothing about the visual polish in this
 * phase required forking the shell.
 */
export function ChristmasPageClient() {
  return (
    <div className="theme-christmas">
      <EventPageView
        eventId={CHRISTMAS_EVENT_ID}
        renderEmptyState={(reload) => (
          <ChristmasDraftCreationView onCreated={reload} />
        )}
      />
    </div>
  );
}
