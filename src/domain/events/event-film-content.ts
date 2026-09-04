import halloweenFilmsJson from "../../../public/events/halloween/films.json";
import januaryFilmsJson from "../../../public/events/january/films.json";
import christmasFilmsJson from "../../../public/events/christmas/films.json";
import {
  parseChristmasFilmContent,
  parseHalloweenFilmContent,
  parseJanuaryFilmContent,
  type ChristmasFilmContent,
  type HalloweenFilmContent,
  type JanuaryFilmContent,
} from "./event-film-content-schema";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "./event-registry";

/**
 * The one place FDraft's curated Event film content is actually loaded
 * from (see docs/updates, "STATIC EVENT FILM CONTENT PACKS") — a direct,
 * build-time `import` of each event's own `public/events/<eventId>/
 * films.json`, exactly like `halloween-art-registration.ts` already does
 * for that same folder's `manifest.json` (visual assets). No fetch, no
 * cache, no staleness check, no network dependency of any kind: this
 * content ships inside the app itself and only ever changes when a new
 * FDraft build does (see docs/event-film-lists.md for the author
 * workflow). Parsed once, eagerly, at module load — a malformed bundled
 * file is a real build-time authoring mistake (see
 * `parseHalloweenFilmContent`'s own doc comment) and should fail loudly
 * here rather than at some later, harder-to-diagnose call site.
 */
export const HALLOWEEN_FILM_CONTENT: HalloweenFilmContent =
  parseHalloweenFilmContent(halloweenFilmsJson);
export const JANUARY_FILM_CONTENT: JanuaryFilmContent =
  parseJanuaryFilmContent(januaryFilmsJson);
export const CHRISTMAS_FILM_CONTENT: ChristmasFilmContent =
  parseChristmasFilmContent(christmasFilmsJson);

export type EventFilmContentEventId =
  typeof HALLOWEEN_EVENT_ID | typeof F_YOU_ITS_JANUARY_EVENT_ID | "christmas";

/**
 * Generic per-event lookup (see docs/updates, "STATIC EVENT FILM CONTENT
 * PACKS" §11: "Do NOT hard-code individual JSON imports throughout
 * components") — the one place that needs to know which bundled constant
 * belongs to which event id, so nothing else in the app has to. Each
 * event's own return type still keeps its real category keys
 * (`horror`/`kitsch`, `curated`, `classic`/`adjacent`) rather than
 * collapsing to one generic shape — a caller working with a specific
 * event already knows which categories it has.
 */
export function getEventFilmContent(
  eventId: typeof HALLOWEEN_EVENT_ID,
): HalloweenFilmContent;
export function getEventFilmContent(
  eventId: typeof F_YOU_ITS_JANUARY_EVENT_ID,
): JanuaryFilmContent;
export function getEventFilmContent(eventId: "christmas"): ChristmasFilmContent;
export function getEventFilmContent(
  eventId: EventFilmContentEventId,
): HalloweenFilmContent | JanuaryFilmContent | ChristmasFilmContent {
  switch (eventId) {
    case HALLOWEEN_EVENT_ID:
      return HALLOWEEN_FILM_CONTENT;
    case F_YOU_ITS_JANUARY_EVENT_ID:
      return JANUARY_FILM_CONTENT;
    case "christmas":
      return CHRISTMAS_FILM_CONTENT;
  }
}
