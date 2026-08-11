import { Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Compass aria-hidden="true" className="text-muted-foreground size-8" />
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">Page not found</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/watchlist" />}>
        Back to watchlist
      </Button>
    </div>
  );
}
