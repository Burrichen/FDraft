import { Skeleton } from "@/components/ui/skeleton";

export default function WatchlistLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <li key={index}>
            <Skeleton className="aspect-2/3 w-full rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}
