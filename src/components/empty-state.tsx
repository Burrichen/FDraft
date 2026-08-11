import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared empty-state layout so every page that might have nothing to show
 * (no watchlist yet, no drafts yet, no stats yet, ...) renders one
 * consistent, deliberate treatment instead of an ad hoc blank area — see
 * docs/product-spec.md, "proper loading/error/empty states".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="text-muted-foreground size-8" />
      ) : null}
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
