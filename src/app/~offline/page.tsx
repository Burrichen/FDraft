import { WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Offline" };

/**
 * The service worker's last-resort navigation fallback (see
 * `src/app/sw.ts`'s `fallbacks.entries` and docs/product-spec.md, "PWA /
 * OFFLINE APPLICATION SHELL" — Prompt 9.5D: "sensible offline
 * navigation"). Only ever reached when the browser is offline AND the
 * requested page was never cached (a route this device has genuinely
 * never opened before) — every previously-visited route instead renders
 * normally from the service worker's own page cache, never this fallback.
 * A plain, static page on purpose: it has to render with nothing else
 * available — no profile, no repositories, no network.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff aria-hidden="true" className="text-muted-foreground size-10" />
      <h1 className="page-heading">You&apos;re offline</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page hasn&apos;t been opened on this device before, so there&apos;s
        nothing cached for it yet. Pages you&apos;ve already visited still work
        fully offline.
      </p>
      <Button nativeButton={false} render={<Link href="/" />}>
        Back to FDraft
      </Button>
    </main>
  );
}
