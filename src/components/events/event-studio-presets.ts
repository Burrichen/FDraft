import {
  getEventArtRegistration,
  listRegisteredEventIds,
} from "./event-art-registry";
import { EVENT_DEFINITIONS } from "@/domain/events/event-registry";

/** Event Studio's own non-event pseudo-preset — FDraft's plain, undecorated look, for previewing a page with no Event theme applied at all. Mirrors `.fdraft-theme`'s own `scope: "default"` concept (see `fdraft-theme-schema.ts`) — this id is exactly the `themeId` `public/event-themes/default.fdraft-theme` uses. */
export const DEFAULT_EVENT_STUDIO_PRESET_ID = "default";

export interface EventStudioPreset {
  id: string;
  label: string;
}

/**
 * The Event Studio preset dropdown's full option list (see docs/updates,
 * "EVENT STUDIO — PHASE 2" §9) — discovered from the central Event
 * registry rather than hand-maintained, so a future registered event
 * appears here automatically with zero changes to this file. Union of:
 *
 *  - the synthetic "Default" entry (not a real Event at all);
 *  - every real, registered `EventDefinition` (Halloween, January,
 *    Frontier, Signal from Beyond today) — a real Event even if it has
 *    no `.fdraft-theme`/art yet;
 *  - any id registered with the Event Art system
 *    (`registerEventArt`/`listRegisteredEventIds`) that ISN'T already one
 *    of those — today exactly Christmas, which has real bundled art/theme
 *    scaffolding (see docs/updates, "EVENT ART SYSTEM — CHRISTMAS
 *    READINESS") but no `EventDefinition`/route/nav entry at all, so it
 *    would otherwise never appear anywhere a normal user could reach it.
 *
 * Selecting an id from this list is Event Studio's own concern (a local
 * preview selection, see `resolveEventEndingCandidate`'s complete
 * unrelatedness to this file) — it never reads or writes real Event
 * participation, currency, or settings.
 */
export function getEventStudioPresets(): EventStudioPreset[] {
  const presets: EventStudioPreset[] = [
    { id: DEFAULT_EVENT_STUDIO_PRESET_ID, label: "Default" },
  ];
  const seen = new Set<string>([DEFAULT_EVENT_STUDIO_PRESET_ID]);

  for (const event of EVENT_DEFINITIONS) {
    presets.push({ id: event.id, label: event.name });
    seen.add(event.id);
  }

  for (const eventId of listRegisteredEventIds()) {
    if (seen.has(eventId)) {
      continue;
    }
    const registration = getEventArtRegistration(eventId);
    presets.push({ id: eventId, label: registration?.displayName ?? eventId });
    seen.add(eventId);
  }

  return presets;
}
