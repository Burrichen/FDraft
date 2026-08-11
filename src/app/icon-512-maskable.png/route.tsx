import { ImageResponse } from "next/og";
import { renderIconMark } from "../icon-mark";

const SIZE = 512;

/**
 * A "maskable" purpose icon (see the `icons` array in `app/manifest.ts`) is
 * given no control over its own final shape — Android applies its own
 * circle/squircle/rounded-square mask on top, cropping anything outside an
 * inner ~80% "safe zone". `renderIconMark`'s `padded` option shrinks the
 * glyph and fills flush to every edge (no pre-rounded corners of its own)
 * so nothing meaningful is lost to that crop.
 */
/** See `icon-192.png/route.tsx` for why `force-static` is needed here too. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    renderIconMark(SIZE, { rounded: false, padded: true }),
    { width: SIZE, height: SIZE },
  );
}
