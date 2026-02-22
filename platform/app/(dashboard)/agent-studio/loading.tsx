export default function AgentStudioLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 bg-surface-hover rounded-lg" />
          <div className="h-4 w-64 bg-surface-hover rounded-lg mt-2" />
        </div>
        <div className="h-9 w-28 bg-surface-hover rounded-lg" />
      </div>

      {/* Owner pills skeleton */}
      <div className="flex items-center gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 w-24 bg-surface-hover rounded-lg" />
        ))}
      </div>

      {/* Filter row skeleton */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-7 w-16 bg-surface-hover rounded-md" />
          ))}
        </div>
        <div className="h-5 w-px bg-border-subtle" />
        <div className="h-7 w-48 bg-surface-hover rounded-lg" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="bg-card border border-border-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-surface-hover" />
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-surface-hover rounded" />
                  <div className="h-3 w-12 bg-surface-hover rounded" />
                </div>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3].map(d => (
                  <div key={d} className="w-1.5 h-1.5 rounded-full bg-surface-hover" />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-3 w-full bg-surface-hover rounded" />
              <div className="h-3 w-2/3 bg-surface-hover rounded" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 h-8 bg-surface-hover rounded-lg" />
              <div className="h-8 w-16 bg-surface-hover rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
