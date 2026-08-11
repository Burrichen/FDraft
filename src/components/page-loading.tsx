import { Skeleton } from "@/components/ui/skeleton";

/** Generic segment-loading skeleton for pages that are a heading plus one content block. */
export function PageLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
