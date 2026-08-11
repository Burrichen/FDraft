import { ImageResponse } from "next/og";
import { renderIconMark } from "../icon-mark";

const SIZE = 192;

/**
 * A plain Route Handler, not the special `icon.tsx` file convention — used
 * here specifically because `app/manifest.ts`'s `icons` array needs a
 * stable, explicitly-known URL to reference, and the special icon
 * convention's served path includes a Next-generated cache-busting query
 * string that isn't meant to be hand-predicted (see docs/product-spec.md
 * Prompt 9.5D). `favicon`/`apple-icon` still use the special convention
 * (`icon.tsx`, `apple-icon.tsx`) since nothing else needs to reference
 * their URLs directly — Next wires those into `<head>` itself.
 */
// Plain Route Handlers don't get the special icon convention's automatic
// build-time caching — without this, the icon would be re-rendered by
// Satori on every single request, including every offline service-worker
// precache fetch. `force-static` (this app doesn't enable Cache Components,
// so the older route segment config model applies) makes it a real static
// asset, generated once at build time.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(renderIconMark(SIZE), { width: SIZE, height: SIZE });
}
