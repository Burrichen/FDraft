import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AsyncDataErrorProps {
  error: Error;
  onRetry: () => void;
  className?: string;
}

/**
 * Shared error state for every page built on `useAsyncData` — see
 * docs/product-spec.md, "COMPLETE PRODUCT AUDIT": none of the 8 pages
 * using that hook destructured its `error` return value, so a loader
 * rejection (a corrupt IndexedDB record, a failed read) rendered as a
 * permanent, silent blank content area instead of something the user
 * could act on. Mirrors `app/error.tsx`'s route-level error boundary
 * treatment, for the loader-rejection case that boundary can't catch
 * (the rejection happens inside an effect, not during render).
 */
export function AsyncDataError({
  error,
  onRetry,
  className,
}: AsyncDataErrorProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="text-destructive size-8" />
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">
          Something went wrong
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          {error.message || "This couldn't be loaded."}
        </p>
      </div>
      <Button onClick={onRetry} variant="outline">
        Try again
      </Button>
    </div>
  );
}
