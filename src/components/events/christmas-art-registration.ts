import { Snowflake } from "lucide-react";
import { parseEventArtPack } from "@/domain/events/event-art-pack";
import christmasManifest from "../../../public/events/christmas/manifest.json";
import { CHRISTMAS_DECORATION_REGISTRY } from "./christmas-decoration-registry";
import {
  CHRISTMAS_PAGE_DECORATION_LAYOUT,
  CHRISTMAS_PAGE_SLOT_POSITIONS,
} from "./christmas-decoration-layout";
import { registerEventArt } from "./event-art-registry";

/**
 * Registers Christmas into the shared Event Art API (see docs/updates,
 * "EVENT ART SYSTEM — CHRISTMAS READINESS" §2) — the actual proof that
 * "if/when Christmas arrives, it can load its manifest, its icon, its
 * art pack, its slot config." No `EventDefinition`, route, or nav entry
 * exists for Christmas anywhere in the app — this registration is
 * reachable ONLY through the shared registry (`getEventArtRegistration`/
 * `EventDecorationSurface`) and the dev-only `EventArtSystemPreviewSection`
 * that reads it; a normal user can never see or opt into Christmas.
 *
 * `Snowflake` is `lucide-react`'s generic snowflake icon — already
 * reserved for a future Christmas Event (see the "CHRISTMAS ICON
 * RESERVATION" note in `event-visual-themes.ts`, dating back to when
 * Halloween took over January's previous icon) and, until now, never
 * actually assigned anywhere in code. Registering it here proves the
 * icon-loading path end-to-end with a real icon instead of an empty
 * gap — it is NOT wired into `use-nav-items.ts`'s real nav item
 * resolution, which stays untouched.
 */
registerEventArt({
  eventId: "christmas",
  displayName: "Christmas",
  artPack: parseEventArtPack(christmasManifest),
  navIcon: Snowflake,
  decorationRegistry: CHRISTMAS_DECORATION_REGISTRY,
  surfaces: {
    page: {
      layout: CHRISTMAS_PAGE_DECORATION_LAYOUT,
      positions: CHRISTMAS_PAGE_SLOT_POSITIONS,
    },
  },
});
