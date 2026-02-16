import { Skeleton } from "@/components/ui/Skeleton";

export default function BrainLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 animate-fade-in-up">
      {/* Left sidebar skeleton */}
      <div className="w-64 border-r border-border-subtle p-4 space-y-4">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded" />
          ))}
        </div>
      </div>

      {/* Center graph skeleton */}
      <div className="flex-1 flex items-center justify-center bg-surface/20">
        <div className="text-center space-y-3">
          <Skeleton className="w-12 h-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>

      {/* Right panel skeleton */}
      <div className="w-72 border-l border-border-subtle p-4 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-32" />
      </div>
    </div>
  );
}
