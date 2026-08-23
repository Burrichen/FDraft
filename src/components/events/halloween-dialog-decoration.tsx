import {
  HalloweenBat,
  HalloweenCandy,
  HalloweenCobwebCorner,
  HalloweenMoon,
} from "./halloween-decorations";

/**
 * The opt-in modal's decoration (see docs/updates, "PROMPT 20 —
 * HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER EGGS" §4) — a crescent moon,
 * two cobweb corners, and a scatter of candy along the bottom edge, all
 * inline SVG/CSS (no external/copyrighted images). Rendered by
 * `EventIntroDialog` via `EventVisualTheme.renderDecoration` — a fully
 * generic hook, so this is the ONLY Halloween-specific file involved; the
 * dialog component itself stays free of any per-event branch. Absolutely
 * positioned within the dialog's now-`relative` content, `aria-hidden`,
 * `pointer-events-none` so it never intercepts a click meant for the real
 * buttons underneath.
 */
export function renderHalloweenDialogDecoration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <HalloweenCobwebCorner className="absolute top-0 left-0 size-10" />
      <HalloweenCobwebCorner className="absolute top-0 right-0 size-10 -scale-x-100" />
      <HalloweenMoon className="absolute top-3 right-10 size-5" />
      <HalloweenBat className="halloween-bat-sway absolute top-4 left-12 size-4" />
      <div className="absolute right-6 -bottom-1 left-6 flex items-end justify-between opacity-70">
        <HalloweenCandy className="size-4 -rotate-6" />
        <HalloweenCandy className="size-3 rotate-12" />
        <HalloweenCandy className="size-4 -rotate-3" />
        <HalloweenCandy className="size-3 rotate-6" />
      </div>
    </div>
  );
}
