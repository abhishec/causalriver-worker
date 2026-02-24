export default function DashboardLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-7 w-64 rounded-md skeleton-shimmer mb-2" />
        <div className="h-4 w-96 rounded-md skeleton-shimmer" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border-subtle bg-surface p-5 space-y-4"
          >
            <div className="h-5 w-40 rounded skeleton-shimmer" />
            <div className="h-4 w-24 rounded skeleton-shimmer" />
            <div className="h-4 w-32 rounded skeleton-shimmer" />
            <div className="flex gap-2 mt-4">
              <div className="h-7 w-16 rounded-full skeleton-shimmer" />
              <div className="h-7 w-16 rounded-full skeleton-shimmer" />
              <div className="h-7 w-16 rounded-full skeleton-shimmer" />
            </div>
            <div className="h-9 w-full rounded-lg skeleton-shimmer mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
