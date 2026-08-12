import { ImageResponse } from "next/og";
import { renderIconMark } from "./icon-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
// Required for static export (the desktop/Tauri build — see
// docs/product-spec.md's Tauri integration notes) even though this route
// has no per-request dynamic behavior at all; Next doesn't infer that for
// the special icon-convention files the way it does for a plain Route
// Handler like `icon-192.png/route.tsx`.
export const dynamic = "force-static";

/** iOS applies its own rounded-square mask over whatever it's given, so this is deliberately NOT pre-rounded — a doubly-rounded icon looks visibly wrong on a home screen. */
export default function AppleIcon() {
  return new ImageResponse(
    renderIconMark(size.width, { rounded: false }),
    size,
  );
}
