import {
  parseEventArtPack,
  resolveEventArtPath,
} from "@/domain/events/event-art-pack";
import christmasManifest from "../../../public/events/christmas/manifest.json";

/**
 * Christmas's own semantic art lookup, mirroring `halloween-art.ts` (see
 * docs/updates, "EVENT ART SYSTEM — FOUNDATION") — sourced from the real,
 * non-engineer-editable `public/events/christmas/manifest.json`. Every
 * file this points at is currently a placeholder-quality scaffold asset
 * (see that manifest's own README note in `public/events/README.md`) —
 * this lookup itself is real and reusable, only the pictures behind it
 * are temporary.
 */
const CHRISTMAS_ART_PACK = parseEventArtPack(christmasManifest);

export const CHRISTMAS_ART = {
  tree: resolveEventArtPath(
    CHRISTMAS_ART_PACK,
    "interactives",
    "christmas-tree",
  ),
  presents: resolveEventArtPath(CHRISTMAS_ART_PACK, "interactives", "presents"),
  snowman: resolveEventArtPath(CHRISTMAS_ART_PACK, "interactives", "snowman"),
  stocking: resolveEventArtPath(CHRISTMAS_ART_PACK, "interactives", "stocking"),
  fairyLights: resolveEventArtPath(
    CHRISTMAS_ART_PACK,
    "decorations",
    "fairy-lights",
  ),
} as const;
