export default function TaskQueueLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-36 bg-surface-hover rounded-lg" />
          <div className="h-4 w-56 bg-surface-hover rounded-lg mt-2" />
        </div>
        <div className="h-8 w-20 bg-surface-hover rounded-lg" />
      </div>

      {/* Stat cards skeleton */}
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex-1 px-4 py-3 bg-card border border-border-subtle rounded-xl">
            <div className="h-3 w-16 bg-surface-hover rounded mb-2" />
            <div className="h-7 w-8 bg-surface-hover rounded" />
          </div>
        ))}
      </div>

      {/* Task list skeleton */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-card border border-border-subtle rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 bg-surface-hover rounded" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-4 w-3/4 bg-surface-hover rounded" />
              <div className="h-3 w-1/3 bg-surface-hover rounded" />
            </div>
            <div className="h-5 w-16 bg-surface-hover rounded-full" />
            <div className="h-4 w-8 bg-surface-hover rounded" />
            <div className="h-3 w-12 bg-surface-hover rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
