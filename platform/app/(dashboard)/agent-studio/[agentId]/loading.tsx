export default function AgentEditorLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-surface-hover rounded-lg" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-surface-hover rounded" />
            <div className="h-6 w-36 bg-surface-hover rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 bg-surface-hover rounded-lg" />
          <div className="h-8 w-16 bg-surface-hover rounded-lg" />
        </div>
      </div>

      {/* Description skeleton */}
      <div className="h-4 w-80 bg-surface-hover rounded" />

      {/* Tabs skeleton */}
      <div className="border-b border-border-subtle pb-px">
        <div className="flex gap-1">
          {["Soul", "Rules", "Tools", "Gathering", "Settings"].map(tab => (
            <div key={tab} className="px-4 py-2.5">
              <div className="h-4 w-14 bg-surface-hover rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Tab content skeleton */}
      <div className="bg-card border border-border-subtle rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-surface-hover rounded" />
          <div className="h-32 w-full bg-surface-hover rounded-lg" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-32 bg-surface-hover rounded" />
          <div className="h-24 w-full bg-surface-hover rounded-lg" />
        </div>
      </div>
    </div>
  );
}
