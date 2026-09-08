import type { DecorationAssetRegistry } from "./event-decoration-layer";
import {
  JanuaryCloudParting,
  JanuaryRainFading,
  JanuarySoftSun,
} from "./january-ending-decorations";

/**
 * Every decorative piece January's Designed Slots can pick, keyed by the
 * asset id its slot configs reference (see
 * `january-ending-decoration-layout.ts`) — the same registry pattern
 * Halloween's `halloween-decoration-registry.tsx` established.
 * January has no join-modal decoration today (its own `EventVisualTheme`
 * entry is just an icon — see `event-visual-themes.ts`), so this registry
 * exists solely for the Event-ending scene for now.
 */
export const JANUARY_DECORATION_REGISTRY: DecorationAssetRegistry = {
  "cloud-parting": () => (
    <JanuaryCloudParting className="january-cloud-drift w-14" />
  ),
  "soft-sun": () => <JanuarySoftSun className="january-sun-glow size-9" />,
  "rain-fading": () => <JanuaryRainFading className="h-10 w-8" />,
};
