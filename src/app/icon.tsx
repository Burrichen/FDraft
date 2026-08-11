import { ImageResponse } from "next/og";
import { renderIconMark } from "./icon-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(renderIconMark(size.width), size);
}
