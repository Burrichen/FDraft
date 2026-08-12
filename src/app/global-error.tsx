"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Catches a crash in the root layout itself (or a client provider it
 * mounts — `SerwistProvider`, `TooltipProvider`, `Toaster`) — the one
 * failure `app/error.tsx`/`(app)/error.tsx` structurally cannot catch,
 * since neither wraps the layout above it. Without this, that failure was
 * a true blank white screen in production — see docs/product-spec.md,
 * "COMPLETE PRODUCT AUDIT".
 *
 * Must define its own `<html>`/`<body>` (it replaces the root layout when
 * active) and can't rely on anything the root layout would normally
 * provide — no theme class from a shared ancestor, no font variables from
 * `next/font`, no `TooltipProvider`. `dark` is applied directly since this
 * app has no light/dark toggle to read from; `globals.css` is imported
 * directly so Tailwind's utility classes still resolve here.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col items-center justify-center px-4">
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <div className="space-y-1">
            <p className="text-foreground text-sm font-medium">
              FDraft couldn&apos;t start
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Something went wrong before the app could load. Reloading usually
              fixes this — your data is stored on this device and is unaffected.
            </p>
          </div>
          <button
            type="button"
            onClick={() => retry()}
            className="border-border bg-card hover:bg-accent focus-visible:outline-ring rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
