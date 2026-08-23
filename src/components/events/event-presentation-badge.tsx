import { getEventDefinition } from "@/domain/events/event-registry";
import { Badge } from "@/components/ui/badge";
import { resolveEventTheme } from "./event-visual-themes";

/**
 * The one place a draft's event ownership becomes a themed badge (see
 * docs/product-spec.md, event system Phase 8: "clean separation between
 * event mechanics and event visuals") — every page that shows a draft
 * (Active Draft, Draft History) renders this instead of its own
 * event-name/icon logic, so no page ever needs its own event-id
 * conditionals.
 *
 * Renders nothing at all — not even a plain text badge — whenever:
 * `eventVisualsEnabled` is off (turning visuals off removes this
 * presentation entirely, never alters it), `sourceEventId` is `null` (a
 * normal, non-event draft), or the event id no longer resolves to a
 * registered `EventDefinition` (safe fallback for a removed/unknown
 * event, matching the same fallback `resolveDraftCompletionReward`
 * already uses for reward currency). When the event IS resolved but has
 * no recognized `visualTheme` (every currently-registered event happens
 * to have one today, but this stays a real, tested fallback for whenever
 * that isn't true), this still shows the plain name badge, just without
 * an icon — only the icon specifically is what "falls back," not the
 * fact that the draft belongs to a real event.
 */
export function EventPresentationBadge({
  sourceEventId,
  eventVisualsEnabled,
}: {
  sourceEventId: string | null;
  eventVisualsEnabled: boolean;
}) {
  if (!eventVisualsEnabled || !sourceEventId) {
    return null;
  }
  const event = getEventDefinition(sourceEventId);
  if (!event) {
    return null;
  }
  const theme = resolveEventTheme(event, eventVisualsEnabled);

  return (
    <Badge variant="secondary" className="align-middle">
      {theme ? <theme.icon aria-hidden="true" /> : null}
      {event.name}
    </Badge>
  );
}
