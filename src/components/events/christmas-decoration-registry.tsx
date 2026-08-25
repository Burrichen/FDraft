import { CHRISTMAS_ART } from "./christmas-art";
import { ChristmasSnowCluster, ChristmasStar } from "./christmas-decorations";
import { EventArtImage } from "./event-art-image";
import type { DecorationAssetRegistry } from "./event-decoration-layer";

/**
 * Christmas's own asset registry, mirroring
 * `halloween-decoration-registry.tsx` exactly (see docs/updates, "EVENT
 * ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS" §8) — proof that the
 * Designed Slot engine (`event-decoration-layer.tsx`) needs nothing
 * Halloween-specific to work for a second event. Not wired into any live
 * page (no Christmas `EventDefinition`/route/nav exists yet) — this
 * registry and its matching layout (`christmas-decoration-layout.ts`)
 * exist purely to prove the placement system itself is reusable.
 */
export const CHRISTMAS_DECORATION_REGISTRY: DecorationAssetRegistry = {
  tree: () => <EventArtImage src={CHRISTMAS_ART.tree} className="h-24" />,
  presents: () => (
    <EventArtImage src={CHRISTMAS_ART.presents} className="h-16" />
  ),
  snowman: () => <EventArtImage src={CHRISTMAS_ART.snowman} className="h-20" />,
  stocking: () => (
    <EventArtImage src={CHRISTMAS_ART.stocking} className="h-16" />
  ),
  "fairy-lights": () => (
    <EventArtImage src={CHRISTMAS_ART.fairyLights} className="h-8 w-32" />
  ),
  star: () => <ChristmasStar className="size-4" />,
  "snowflake-cluster": () => <ChristmasSnowCluster className="h-6 w-12" />,
};
