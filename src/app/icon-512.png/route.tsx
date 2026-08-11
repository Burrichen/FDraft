import { ImageResponse } from "next/og";
import { renderIconMark } from "../icon-mark";

const SIZE = 512;

/** See `icon-192.png/route.tsx` for why this is a plain route rather than the special `icon.tsx` convention, and why `force-static` is needed. */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(renderIconMark(SIZE), { width: SIZE, height: SIZE });
}
