import { parseEventArtPack } from "@/domain/events/event-art-pack";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { HalloweenNavIcon } from "@/components/layout/nav-icons";
import halloweenManifest from "../../../public/events/halloween/manifest.json";
import { registerEventArt } from "./event-art-registry";
import {
  HALLOWEEN_AMBIENT_DECORATION_LAYOUT,
  HALLOWEEN_AMBIENT_SLOT_POSITIONS,
} from "./halloween-ambient-decoration-layout";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_HEADER_DECORATION_LAYOUT,
  HALLOWEEN_MODAL_DECORATION_LAYOUT,
  HALLOWEEN_MODAL_SLOT_POSITIONS,
  HALLOWEEN_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_SLOT_POSITIONS,
} from "./halloween-decoration-layout";
import {
  HALLOWEEN_ENDING_DECORATION_LAYOUT,
  HALLOWEEN_ENDING_SLOT_POSITIONS,
} from "./halloween-ending-decoration-layout";

/**
 * Registers Halloween into the shared Event Art API (see docs/updates,
 * "EVENT ART SYSTEM — CHRISTMAS READINESS" §1) — purely additive: none
 * of Halloween's own components (`halloween-decorative-layer.tsx`,
 * `halloween-dialog-decoration.tsx`, `halloween-ambient-decorations.tsx`,
 * `halloween-art.ts`) were changed to READ from this registry, and none
 * needed to be — they already worked. This registration exists so
 * generic code (the dev-only `EventArtSystemPreviewSection`, and any
 * future generic consumer) can resolve Halloween's art the exact same
 * way it resolves any other registered event's, proving the shared API
 * genuinely works for more than one event using real, already-shipped
 * data, not just Christmas's placeholder scaffold.
 *
 * Re-parses `manifest.json` independently of `halloween-art.ts`'s own
 * private pack (rather than importing it) — cheap and pure, and keeps
 * this registration decoupled from that file's internals.
 */
registerEventArt({
  eventId: HALLOWEEN_EVENT_ID,
  displayName: "Halloween",
  artPack: parseEventArtPack(halloweenManifest),
  navIcon: HalloweenNavIcon,
  decorationRegistry: HALLOWEEN_DECORATION_REGISTRY,
  surfaces: {
    page: {
      // Combines the always-on ambient layout with the interactive Candy
      // Bowl/ghost-02 slot purely so the dev-only preview
      // (`EventArtSystemPreviewSection`) shows every real slot at once —
      // `HalloweenPageClient` itself still renders them as two separate
      // layers so it can gate the interactive one behind
      // `isActiveForProfile` (see `halloween-decorative-layer.tsx`).
      layout: {
        ...HALLOWEEN_PAGE_DECORATION_LAYOUT,
        ...HALLOWEEN_HEADER_DECORATION_LAYOUT,
        ...HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT,
      },
      positions: HALLOWEEN_PAGE_SLOT_POSITIONS,
    },
    modal: {
      layout: HALLOWEEN_MODAL_DECORATION_LAYOUT,
      positions: HALLOWEEN_MODAL_SLOT_POSITIONS,
    },
    ambient: {
      layout: HALLOWEEN_AMBIENT_DECORATION_LAYOUT,
      positions: HALLOWEEN_AMBIENT_SLOT_POSITIONS,
    },
    ending: {
      layout: HALLOWEEN_ENDING_DECORATION_LAYOUT,
      positions: HALLOWEEN_ENDING_SLOT_POSITIONS,
    },
  },
});
