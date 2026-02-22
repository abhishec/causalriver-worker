export default function WorkflowsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-surface-hover rounded-lg" />
          <div className="h-4 w-60 bg-surface-hover rounded-lg mt-2" />
        </div>
        <div className="h-9 w-32 bg-surface-hover rounded-lg" />
      </div>

      {/* Stat cards skeleton */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 px-4 py-3 bg-card border border-border-subtle rounded-xl">
            <div className="h-3 w-16 bg-surface-hover rounded mb-2" />
            <div className="h-7 w-8 bg-surface-hover rounded" />
          </div>
        ))}
      </div>

      {/* Service pills skeleton */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-7 w-16 bg-surface-hover rounded-md" />
        ))}
      </div>

      {/* Section header */}
      <div className="h-4 w-28 bg-surface-hover rounded" />

      {/* Workflow list skeleton */}
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card border border-border-subtle rounded-xl px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-40 bg-surface-hover rounded" />
                  <div className="h-4 w-16 bg-surface-hover rounded" />
                </div>
                <div className="h-3 w-56 bg-surface-hover rounded" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-4 w-16 bg-surface-hover rounded" />
                <div className="flex gap-2">
                  <div className="h-8 w-14 bg-surface-hover rounded-lg" />
                  <div className="h-8 w-14 bg-surface-hover rounded-lg" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="flex items-center gap-1.5">
                  <div className="h-6 w-20 bg-surface-hover rounded" />
                  {j < 4 && <div className="w-3 h-3 bg-surface-hover rounded" />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
