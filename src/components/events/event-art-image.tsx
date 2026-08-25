"use client";

import { useState } from "react";
import type { ImgHTMLAttributes } from "react";

/**
 * The one place every Event art-pack image actually renders (see
 * docs/updates, "EVENT ART SYSTEM — FOUNDATION") — a thin `<img>` wrapper
 * that hides itself instead of showing a broken-image icon if the file a
 * path points at is missing or corrupt on disk. This is deliberately a
 * DIFFERENT failure mode from `resolveEventArtPath` throwing: that one
 * catches "the manifest and the code disagree on slot names" (a bug,
 * fails loudly at import time); this one catches "the path is valid but
 * whatever's actually at that path right now can't be decoded" (e.g. a
 * non-engineer overwrote a placeholder with a truncated/corrupt export),
 * which can only ever be detected once the browser actually tries to load
 * the file.
 *
 * Defaults to `alt=""`/`aria-hidden`/`draggable={false}` — every current
 * caller uses this purely decoratively — but a caller passing a real
 * `alt` overrides that default and this stops being `aria-hidden`.
 */
export function EventArtImage({
  alt = "",
  draggable = false,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a bundled local asset resolved through an event art pack (see event-art-pack.ts); next/image is unused app-wide, see next.config.ts
    <img
      alt={alt}
      aria-hidden={alt === "" ? "true" : undefined}
      draggable={draggable}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
