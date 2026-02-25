import { Skeleton } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-1 border-b border-border-subtle pb-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="rounded-xl bg-card border border-border-subtle p-6 space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
