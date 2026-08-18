import type { EventDefinition } from "./event-definition";

/**
 * The one gate every themed UI surface reads through to decide whether to
 * show an event's visual treatment (see docs/product-spec.md, event
 * system Phase 8: "clean separation between event mechanics and event
 * visuals"). Deliberately the only place `EventSettings.
 * eventVisualsEnabled` and `EventDefinition.visualTheme` are combined —
 * opt-in, eligibility, drafting, draft ownership, completion, and reward
 * currency resolution (`event-eligibility.ts`, `draft-completion-reward.ts`,
 * `event-opt-in.ts`, `local-draft-service.ts`) never import this module
 * and never read `eventVisualsEnabled` at all, so turning visuals off can
 * only ever change what's drawn on screen, never any of that.
 *
 * Returns the theme id a presentation layer should look up, or `null`
 * whenever: visuals are off, there's no active event, or the event has no
 * `visualTheme` configured — every one of these is a safe "render
 * standard FDraft presentation instead" signal, never an error. A
 * `visualTheme` id this function returns that the presentation layer
 * itself doesn't recognize (e.g. a theme id that's since been retired) is
 * that layer's own safe-fallback concern, not this function's — this
 * only ever forwards the id or withholds it, it never validates it
 * against a theme registry (which would make this domain module depend
 * on the UI layer's theme assets).
 */
export function resolveEventVisualThemeId(params: {
  event: Pick<EventDefinition, "visualTheme"> | null;
  eventVisualsEnabled: boolean;
}): string | null {
  if (!params.eventVisualsEnabled) {
    return null;
  }
  return params.event?.visualTheme ?? null;
}
