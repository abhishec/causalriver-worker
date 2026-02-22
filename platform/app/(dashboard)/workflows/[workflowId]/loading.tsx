export default function WorkflowDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-surface-hover rounded-lg" />
          <div>
            <div className="h-7 w-48 bg-surface-hover rounded-lg" />
            <div className="h-3 w-64 bg-surface-hover rounded mt-1.5" />
          </div>
        </div>
        <div className="h-9 w-28 bg-surface-hover rounded-lg" />
      </div>

      {/* Stats skeleton */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 px-4 py-3 bg-card border border-border-subtle rounded-xl">
            <div className="h-3 w-20 bg-surface-hover rounded mb-2" />
            <div className="h-7 w-12 bg-surface-hover rounded" />
          </div>
        ))}
      </div>

      {/* Pipeline skeleton */}
      <div className="bg-card border border-border-subtle rounded-xl p-5">
        <div className="h-3 w-16 bg-surface-hover rounded mb-3" />
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-12 w-28 bg-surface-hover rounded-lg" />
              {i < 4 && <div className="w-4 h-4 bg-surface-hover rounded" />}
            </div>
          ))}
        </div>
      </div>

      {/* Run history header */}
      <div className="h-3 w-24 bg-surface-hover rounded" />

      {/* Run history items */}
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-card border border-border-subtle rounded-xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-surface-hover rounded-full" />
              <div className="space-y-1">
                <div className="h-4 w-24 bg-surface-hover rounded" />
                <div className="h-3 w-20 bg-surface-hover rounded" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-3 w-12 bg-surface-hover rounded" />
              <div className="h-3 w-12 bg-surface-hover rounded" />
              <div className="w-4 h-4 bg-surface-hover rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
