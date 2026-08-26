import { EventArtImage } from "./event-art-image";
import { HALLOWEEN_ART } from "./halloween-art";
import type { DecorationAssetRegistry } from "./event-decoration-layer";
import {
  HalloweenBat,
  HalloweenBunting,
  HalloweenCandle,
  HalloweenCandy,
  HalloweenCobwebCorner,
  HalloweenGhost,
  HalloweenHangingOrnament,
  HalloweenLeaf,
  HalloweenLollipop,
  HalloweenMoon,
  HalloweenSkull,
  HalloweenStar,
  HalloweenTinyPumpkin,
  HalloweenWrappedCandy,
} from "./halloween-decorations";
import {
  HalloweenCandleExtinguished,
  HalloweenCloud,
} from "./halloween-ending-decorations";

/**
 * Every decorative piece Halloween's Designed Slots can pick, keyed by
 * the asset id its slot configs reference (see
 * `halloween-decoration-layout.ts`) — the ONLY place this project maps
 * an abstract slot pick to an actual rendered thing. `EventDecorationLayer`
 * itself never imports any of these directly.
 *
 * Each entry owns its own base size/tint — a slot config's `scale`/
 * `opacity` tweaks adjust FROM that base, they never replace it, so a
 * registry entry always looks reasonable even with no tweak at all.
 *
 * `ghost-1` is the bundled raster hero (`public/events/halloween/modal/
 * ghost.png`, via `HALLOWEEN_ART`/`EventArtImage`); every other entry is
 * one of the small hand-authored inline SVGs from `halloween-decorations.
 * tsx` — exactly the PNG-for-hero/SVG-for-small-accent split the asset
 * pack's own format rule already established. `cobweb-mirrored` and the
 * three composed entries (`moon-and-bats`, `pumpkin-cluster`,
 * `candy-scatter`, `ornament-row`) don't add any new artwork — they
 * reuse the existing pieces above, just combined or transformed, which is
 * exactly what "designed slots" needs: several ways to dress the same
 * spot without drawing anything new.
 */
export const HALLOWEEN_DECORATION_REGISTRY: DecorationAssetRegistry = {
  "ghost-1": () => (
    <EventArtImage src={HALLOWEEN_ART.ghost} className="size-14" />
  ),
  "ghost-2": () => <HalloweenGhost className="size-8" />,
  bat: () => <HalloweenBat className="halloween-bat-sway size-6" />,
  moon: () => <HalloweenMoon className="size-8" />,
  star: () => <HalloweenStar className="size-3" />,
  cobweb: () => <HalloweenCobwebCorner className="size-20" />,
  "cobweb-mirrored": () => (
    <HalloweenCobwebCorner className="size-20 -scale-x-100" />
  ),
  "tiny-pumpkin": () => <HalloweenTinyPumpkin className="size-6" />,
  skull: () => <HalloweenSkull className="size-5" />,
  leaf: () => <HalloweenLeaf className="size-5 rotate-12" />,
  bunting: () => <HalloweenBunting className="w-28" />,
  candle: () => <HalloweenCandle className="size-6" />,
  lollipop: () => (
    <HalloweenLollipop className="text-halloween-purple size-5" />
  ),

  /** Moon plus a swaying bat sharing one small composition — see the "header-right: moon / bats / moon+bats composition" example (docs/updates, "EVENT ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS" §7). */
  "moon-and-bats": () => (
    <div className="relative size-10">
      <HalloweenMoon className="absolute top-0 right-0 size-8" />
      <HalloweenBat className="halloween-bat-sway absolute bottom-0 left-0 size-5" />
    </div>
  ),

  /** Three tiny pumpkins at varied scale/offset — a genuine "cluster," not a single repeated icon at one size. */
  "pumpkin-cluster": () => (
    <div className="relative size-16">
      <HalloweenTinyPumpkin className="absolute bottom-0 left-0 size-7" />
      <HalloweenTinyPumpkin className="absolute bottom-1 left-6 size-5 opacity-90" />
      <HalloweenTinyPumpkin className="absolute bottom-0 left-10 size-6" />
    </div>
  ),

  /** A small scatter of the three distinct candy silhouettes — reuses the same pieces the candy bowl easter egg already draws from. */
  "candy-scatter": () => (
    <div className="relative size-14">
      <HalloweenCandy className="text-halloween-pumpkin absolute top-0 left-1 size-4 -rotate-6" />
      <HalloweenLollipop className="text-halloween-purple absolute top-4 left-7 size-5 rotate-12" />
      <HalloweenWrappedCandy className="absolute bottom-0 left-2 size-4 -rotate-3" />
    </div>
  ),

  /** Three hanging ornaments strung along a thread, evenly spaced — the modal's old always-present top-edge bunting row, now one pickable slot instead of unconditional. */
  "ornament-row": () => (
    <div className="flex items-start justify-around gap-6">
      <HalloweenHangingOrnament className="halloween-ornament-sway aspect-[12/30] h-6" />
      <HalloweenHangingOrnament className="halloween-ornament-sway aspect-[12/30] h-8 [animation-delay:400ms]" />
      <HalloweenHangingOrnament className="halloween-ornament-sway aspect-[12/30] h-5 [animation-delay:200ms]" />
    </div>
  ),

  // Below: the Event-ending scene's own quieter pieces (see docs/updates,
  // "EVENT SYSTEM — EVENT-OVER EXPERIENCE" §8) — the party's over, so
  // every one of these reads as faded, empty, or departing rather than
  // festive. Reused from artwork that already exists for a different
  // purpose (the interactive pumpkin/candy bowl easter eggs' own "rotting"/
  // "empty" states) wherever real bundled art already covers it, per
  // "Do not create another parallel art pipeline" — only the cloud and
  // extinguished candle above are genuinely new shapes.
  "pumpkin-faded": () => (
    <EventArtImage
      src={HALLOWEEN_ART.pumpkinRotting}
      className="size-12 opacity-80 grayscale-[35%]"
    />
  ),
  "candy-bowl-empty": () => (
    <EventArtImage src={HALLOWEEN_ART.candyBowlEmpty} className="size-14" />
  ),
  "candle-out": () => (
    <HalloweenCandleExtinguished className="size-6 opacity-80" />
  ),
  "ghost-departing": () => (
    <HalloweenGhost className="halloween-ghost-depart size-9 opacity-60" />
  ),
  "moon-clearing": () => (
    <div className="relative size-10">
      <HalloweenMoon className="absolute top-0 right-0 size-8 opacity-90" />
      <HalloweenCloud className="halloween-cloud-drift absolute top-1 left-0 w-9" />
    </div>
  ),
  "cobweb-sparse": () => (
    <HalloweenCobwebCorner className="size-14 opacity-30" />
  ),
  "leaf-fallen": () => (
    <HalloweenLeaf className="size-5 rotate-[100deg] opacity-60" />
  ),
  "bunting-fallen": () => (
    <HalloweenBunting className="w-24 rotate-[8deg] opacity-50" />
  ),
};
