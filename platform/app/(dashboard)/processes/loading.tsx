import { Skeleton } from "@/components/ui/Skeleton";

export default function ProcessesLoading() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 border-b border-border-subtle last:border-b-0 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
