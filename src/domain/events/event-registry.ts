import type { EventDefinition } from "./event-definition";

/**
 * The single place a real event gets registered as data, once one exists
 * — the "one engine instead of hardcoding January/Sci-Fi/Western logic
 * throughout the app" this phase exists for. Empty until the first real
 * event ships; nothing in this phase populates it.
 */
export const EVENT_DEFINITIONS: readonly EventDefinition[] = [];

export function getEventDefinition(id: string): EventDefinition | null {
  return EVENT_DEFINITIONS.find((event) => event.id === id) ?? null;
}
