import { z } from "zod";

/**
 * The typed model for an EVENT ART PACK — the file-based, non-engineer-
 * editable asset manifest each event's decorative/illustration files load
 * through (see docs/updates, "EVENT ART SYSTEM — FOUNDATION"). This is a
 * DIFFERENT "manifest" from `event-manifest-schema.ts`/`manifests/`, which
 * describes a remotely-hosted curated FILM list — the two systems are
 * unrelated and never share a file or a schema. To keep that distinct,
 * this file always says "art pack," never bare "manifest," in its own
 * exports.
 *
 * Each event that wants art gets exactly one file:
 * `public/events/<eventId>/manifest.json` (the literal filename the
 * product spec asked for — the JSON file itself, not this schema, is what
 * a non-engineer actually opens and edits). It's a flat, five-category
 * bag of `slotName -> path` string maps — deliberately NOT modelling
 * Halloween's specific slot names (`pumpkinLit`, `gravestoneBase`, ...) in
 * this shared schema, so a wholly different event (Christmas: `tree`,
 * `stocking`, ...) needs zero changes here. Giving semantic meaning to a
 * slot name is left entirely to that event's own small components-layer
 * facade (see `halloween-art.ts`) — this file only guarantees "the JSON
 * parses, every path is a real-looking string, and a lookup either
 * returns a path or fails loudly with a clear message," nothing more.
 *
 * Every path is repo-root-relative from `public/` (e.g.
 * `"interactives/pumpkin-lit.png"`, resolved by `resolveEventArtPath`
 * into the real `/events/<eventId>/interactives/pumpkin-lit.png` URL) —
 * so the JSON itself never repeats the `/events/<eventId>/` prefix, and
 * moving an entire event's art pack to a different folder name is a
 * one-line change instead of a find-and-replace across every path.
 */
export const EVENT_ART_CATEGORIES = [
  "icons",
  "decorations",
  "modal",
  "interactives",
  "backgrounds",
] as const;

export type EventArtCategory = (typeof EVENT_ART_CATEGORIES)[number];

const artSlotMapSchema = z.record(
  z.string(),
  z.string().trim().min(1).max(300),
);

export const eventArtPackSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
  icons: artSlotMapSchema.default({}),
  decorations: artSlotMapSchema.default({}),
  modal: artSlotMapSchema.default({}),
  interactives: artSlotMapSchema.default({}),
  backgrounds: artSlotMapSchema.default({}),
});

export type EventArtPack = z.infer<typeof eventArtPackSchema>;

/**
 * Parses raw JSON (e.g. a build-time `import` of a `manifest.json` file)
 * into a validated `EventArtPack`. Unlike the remote film manifest's
 * `safeParse`-and-swallow convention, this one THROWS on a malformed
 * pack — an art pack is a file this project ships and controls (not
 * untrusted network input), so a broken one is a real authoring mistake
 * that should fail loudly (a build/test error) rather than silently
 * degrade into "no art" at runtime.
 */
export function parseEventArtPack(raw: unknown): EventArtPack {
  return eventArtPackSchema.parse(raw);
}

/**
 * Turns a category + slot name into the real, servable URL under
 * `public/`. Throws if the slot itself isn't declared in the pack — that
 * means the code and the art pack have drifted (a real bug to fix at the
 * source, not something to paper over) — which is a DIFFERENT failure
 * mode from "the file at that path is missing/corrupt on disk," a case
 * this function can't see at all; that one is handled where the path is
 * actually rendered (see `EventArtImage`'s `onError` fallback).
 */
export function resolveEventArtPath(
  pack: EventArtPack,
  category: EventArtCategory,
  slot: string,
): string {
  const relativePath = pack[category][slot];
  if (!relativePath) {
    throw new Error(
      `Event art pack "${pack.eventId}" has no "${category}.${slot}" slot.`,
    );
  }
  return `/events/${pack.eventId}/${relativePath}`;
}

/**
 * Generic "map a domain state to an image path" resolver (see
 * docs/updates, "EVENT ART SYSTEM — CHRISTMAS READINESS" §1, "interactive
 * asset sets") — the shared version of the `Record<State, string>` +
 * lookup pattern Halloween's `halloween-pumpkin.tsx`/`halloween-gravestone.
 * tsx`/`halloween-candy-bowl.tsx` each currently hand-roll. A future
 * event's own interactive prop can call this instead of reinventing the
 * same lookup — nothing here assumes a fixed number of states, a
 * particular prop name, or that every event even HAS an interactive prop
 * at all (an event that never calls this simply never needs to).
 * `TState` is whatever string union the calling domain module already
 * defines for its own prop (e.g. `HalloweenPumpkinState`) — this stays
 * generic over it rather than inventing a shared state shape.
 */
export function resolveInteractiveAssetPath<TState extends string>(
  pack: EventArtPack,
  category: EventArtCategory,
  slotByState: Record<TState, string>,
  state: TState,
): string {
  return resolveEventArtPath(pack, category, slotByState[state]);
}
