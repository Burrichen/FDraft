import {
  parseEventArtPack,
  resolveEventArtPath,
} from "@/domain/events/event-art-pack";
import halloweenManifest from "../../../public/events/halloween/manifest.json";

/**
 * The single lookup between semantic Halloween art slots and the actual
 * bundled files under `public/events/halloween/` (see docs/updates,
 * "EVENT ART SYSTEM — FOUNDATION" — supersedes the earlier hand-maintained
 * literal-path version from "HALLOWEEN ART DIRECTION & ASSET PASS" §2,
 * now sourced from the real, non-engineer-editable
 * `public/events/halloween/manifest.json` instead). Every consumer still
 * imports paths from HERE, never a literal `/events/halloween/...`
 * string or a raw manifest slot name, so swapping any slot to a
 * different illustration later is a one-line edit to that JSON file, not
 * a hunt through every component that renders it, and this file's own
 * exported keys never need to change just because a filename did. Every
 * file this points at ships inside the app bundle/build output (see
 * `public/`) and is served locally — nothing here is ever fetched from a
 * third-party runtime URL, so every slot keeps working fully offline.
 *
 * `manifest.json` is imported at build time (not `fetch`ed at runtime),
 * matching how every other part of this app resolves its own bundled
 * data — zero loading state, zero network dependency, and a genuinely
 * malformed manifest fails the build/test suite immediately instead of
 * silently shipping broken art. A path that's well-formed here but whose
 * *file* is missing or corrupt on disk is a different failure mode,
 * handled where the image actually renders — see `EventArtImage`.
 */
const HALLOWEEN_ART_PACK = parseEventArtPack(halloweenManifest);

export const HALLOWEEN_ART = {
  ghost: resolveEventArtPath(HALLOWEEN_ART_PACK, "modal", "ghost"),
  pumpkinUncarved: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "pumpkin-uncarved",
  ),
  pumpkinCarved: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "pumpkin-carved",
  ),
  pumpkinLit: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "pumpkin-lit",
  ),
  pumpkinRotting: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "pumpkin-rotting",
  ),
  gravestoneClean: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "gravestone-base",
  ),
  gravestonePlain: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "gravestone-moss-overlay",
  ),
  candyBowlFull: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "candy-bowl-full",
  ),
  candyBowlMedium: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "candy-bowl-medium",
  ),
  candyBowlLow: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "candy-bowl-low",
  ),
  candyBowlEmpty: resolveEventArtPath(
    HALLOWEEN_ART_PACK,
    "interactives",
    "candy-bowl-empty",
  ),
} as const;
