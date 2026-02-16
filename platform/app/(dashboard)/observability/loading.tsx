import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function ObservabilityLoading() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-3 w-64" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-1 border-b border-border-subtle pb-px">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded" />
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="stat" />
        ))}
      </div>

      {/* Table */}
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
