import type { ComponentType, SVGProps } from "react";
import type { EventArtPack } from "@/domain/events/event-art-pack";
import type {
  DecorationSeedInputs,
  EventDecorationLayout,
} from "@/domain/events/event-decoration-slots";
import {
  EventDecorationLayer,
  type DecorationAssetRegistry,
  type EventDecorationSlotPositions,
} from "./event-decoration-layer";

/**
 * The SHARED EVENT ART API (see docs/updates, "EVENT ART SYSTEM —
 * CHRISTMAS READINESS" §1) — the one generic surface a page/component
 * reaches for an event's manifest data, nav icon, modal art, slot
 * layouts, or interactive asset sets, instead of importing that event's
 * own hand-named constants directly (`HALLOWEEN_ART`, `HALLOWEEN_PAGE_
 * DECORATION_LAYOUT`, ...). Every field here is OPTIONAL except `eventId`
 * and `artPack` — see each field's own comment for what "not present"
 * means; nothing in this file assumes every event has a nav icon, a
 * decoration registry, or any particular named surface (§3: "do not
 * hardcode assumptions").
 *
 * This is a plain in-memory registry (a `Map`, populated once at app
 * startup by each event's own small `<event>-art-registration.ts` file
 * — see `register-event-art.ts`, imported once for its side effects from
 * `app-shell.tsx`), not a persisted store — it exists purely to give
 * generic code (like `EventArtSystemPreviewSection`, the dev-only
 * Christmas readiness proof) one lookup surface that works identically
 * for every registered event, present or future.
 */
export interface EventDecorationSurfaceConfig {
  layout: EventDecorationLayout;
  positions: EventDecorationSlotPositions;
}

export interface EventArtRegistration {
  eventId: string;
  displayName: string;
  /** The parsed, validated manifest — see `event-art-pack.ts`. */
  artPack: EventArtPack;
  /** Absent for an event with no registered nav icon yet — a real, expected state (see `getEventNavIcon`), not an error. */
  navIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Absent for an event with no ambient/page/modal decoration wired up at all. */
  decorationRegistry?: DecorationAssetRegistry;
  /** Keyed by surface name (`"page"`, `"modal"`, `"ambient"`, ...) — an event registers only the surfaces it actually has; there is no fixed required set. */
  surfaces?: Record<string, EventDecorationSurfaceConfig>;
}

const registry = new Map<string, EventArtRegistration>();

/** Called once per event, at module-load time, by that event's own `<event>-art-registration.ts`. Re-registering the same `eventId` (e.g. a hot-reload) simply replaces the previous entry. */
export function registerEventArt(registration: EventArtRegistration): void {
  registry.set(registration.eventId, registration);
}

/** `undefined` for an event that hasn't registered at all — a normal, expected state for an event that doesn't exist yet (e.g. Carnival), never thrown for. */
export function getEventArtRegistration(
  eventId: string,
): EventArtRegistration | undefined {
  return registry.get(eventId);
}

export function getEventArtPack(eventId: string): EventArtPack | undefined {
  return registry.get(eventId)?.artPack;
}

export function getEventNavIcon(
  eventId: string,
): ComponentType<SVGProps<SVGSVGElement>> | undefined {
  return registry.get(eventId)?.navIcon;
}

export function getEventDecorationSurface(
  eventId: string,
  surfaceKey: string,
): EventDecorationSurfaceConfig | undefined {
  return registry.get(eventId)?.surfaces?.[surfaceKey];
}

/** Every currently-registered event id, in registration order — lets generic code (e.g. a dev preview) enumerate "every event with art" without hardcoding any event's name. */
export function listRegisteredEventIds(): string[] {
  return Array.from(registry.keys());
}

export interface EventDecorationSurfaceProps {
  eventId: string;
  surfaceKey: string;
  /** `layoutKey` is always derived from `eventId`/`surfaceKey` here, never caller-supplied — see below. */
  seedInputs?: Omit<
    DecorationSeedInputs,
    "sessionSeed" | "eventId" | "layoutKey"
  >;
  className?: string;
}

/**
 * The generic way to render a registered event's decoration surface by
 * id — resolves `eventId`/`surfaceKey` through the registry above and
 * hands the result to the already-generic `EventDecorationLayer`.
 * Renders nothing (never throws) when the event isn't registered at all,
 * has no decoration registry, or has no surface under that key — every
 * one of those is "this event has no art here yet," not a bug (see §4,
 * "if an event has no art pack loaded: degrade safely").
 */
export function EventDecorationSurface({
  eventId,
  surfaceKey,
  seedInputs,
  className,
}: EventDecorationSurfaceProps) {
  const registration = getEventArtRegistration(eventId);
  const surface = registration?.surfaces?.[surfaceKey];
  if (!registration || !registration.decorationRegistry || !surface) {
    return null;
  }

  return (
    <EventDecorationLayer
      layout={surface.layout}
      positions={surface.positions}
      registry={registration.decorationRegistry}
      seedInputs={{
        ...seedInputs,
        eventId,
        layoutKey: `${eventId}-${surfaceKey}`,
      }}
      className={className}
    />
  );
}
