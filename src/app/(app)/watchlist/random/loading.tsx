import { Skeleton } from "@/components/ui/skeleton";

export default function RandomFilmLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="mx-auto w-full max-w-xs space-y-4">
        <Skeleton className="aspect-2/3 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}
