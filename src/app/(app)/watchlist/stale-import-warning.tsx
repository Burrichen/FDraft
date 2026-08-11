import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { STALE_WATCHLIST_THRESHOLD_MONTHS } from "@/domain/watchlist/stale-import";

interface StaleImportWarningProps {
  stale: boolean;
  lastImportCompletedAt: string;
}

/**
 * See docs/product-spec.md, "Stale Watchlist Warning" — clear but
 * non-obnoxious: a single inline banner, not a modal or repeated toast.
 */
export function StaleImportWarning({
  stale,
  lastImportCompletedAt,
}: StaleImportWarningProps) {
  if (!stale) {
    return null;
  }

  const formatted = new Date(lastImportCompletedAt).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <Alert>
      <TriangleAlert className="text-watchlist-orange" />
      <AlertTitle>Your watchlist may be out of date</AlertTitle>
      <AlertDescription>
        Last imported on {formatted} — more than{" "}
        {STALE_WATCHLIST_THRESHOLD_MONTHS} months ago.
      </AlertDescription>
      <AlertAction>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/watchlist/import" />}
        >
          Import again
        </Button>
      </AlertAction>
    </Alert>
  );
}
