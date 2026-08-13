import { ImageResponse } from "next/og";
import { renderIconMark } from "./icon-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
// See apple-icon.tsx's identical comment — required for static export.
export const dynamic = "force-static";

export default function Icon() {
  return new ImageResponse(renderIconMark(size.width), size);
}
