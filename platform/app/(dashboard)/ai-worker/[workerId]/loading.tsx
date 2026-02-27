export default function AIWorkerLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-surface-hover rounded-lg animate-pulse" />
          <div className="h-4 w-40 bg-surface-hover rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-surface-hover rounded-lg animate-pulse" />
          <div className="h-9 w-24 bg-surface-hover rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex items-center gap-1 border-b border-border-subtle pb-0">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 bg-surface-hover rounded-t-lg animate-pulse" />
        ))}
      </div>

      {/* Two-column content skeleton */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left column */}
        <div className="col-span-3 space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
            <div className="h-4 w-32 bg-surface-hover rounded animate-pulse" />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-surface-hover rounded-lg animate-pulse" />
              ))}
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-surface-hover rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
            <div className="h-4 w-24 bg-surface-hover rounded animate-pulse" />
            <div className="h-16 w-full bg-surface-hover rounded-lg animate-pulse" />
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
            <div className="h-4 w-28 bg-surface-hover rounded animate-pulse" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-surface-hover rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
