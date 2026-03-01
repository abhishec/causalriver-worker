import { Skeleton } from "@/components/ui/Skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Worker grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
