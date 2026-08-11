import { ImageResponse } from "next/og";
import { renderIconMark } from "./icon-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS applies its own rounded-square mask over whatever it's given, so this is deliberately NOT pre-rounded — a doubly-rounded icon looks visibly wrong on a home screen. */
export default function AppleIcon() {
  return new ImageResponse(
    renderIconMark(size.width, { rounded: false }),
    size,
  );
}
