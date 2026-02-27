// Loading state for all admin sub-pages
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label="Loading admin panel">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm text-muted">Loading...</p>
      </div>
    </div>
  );
}
