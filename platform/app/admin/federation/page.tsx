"use client";

export default function AdminFederationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Federation</h1>
        <p className="text-muted text-sm mt-1">How knowledge flows between organizations and the core brain</p>
      </div>

      {/* Federation Graph Placeholder */}
      <div className="rounded-xl bg-card border border-border/50 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          {/* Core brain in center */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center glow-accent">
              <div className="text-center">
                <div className="text-lg font-bold text-accent">Core</div>
                <div className="text-[10px] text-muted">Brain</div>
              </div>
            </div>

            {/* Orbiting org nodes */}
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center">
              <span className="text-xs font-medium text-muted">Org A</span>
            </div>
            <div className="absolute top-1/2 -right-20 -translate-y-1/2 w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center">
              <span className="text-xs font-medium text-muted">Org B</span>
            </div>
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center">
              <span className="text-xs font-medium text-muted">Org C</span>
            </div>
            <div className="absolute top-1/2 -left-20 -translate-y-1/2 w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center">
              <span className="text-xs font-medium text-muted">Org D</span>
            </div>
          </div>

          <p className="text-sm text-muted mt-16 text-center max-w-md">
            Federation enables knowledge sharing between organizations while maintaining data isolation.
            Patterns discovered in one org can strengthen the core brain and benefit all connected organizations.
          </p>
        </div>
      </div>

      {/* Federation Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Shared Patterns</div>
          <div className="text-2xl font-bold">0</div>
          <div className="text-xs text-muted mt-1">Core to orgs</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Contributed Back</div>
          <div className="text-2xl font-bold">0</div>
          <div className="text-xs text-muted mt-1">Orgs to core</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Cascade Alerts</div>
          <div className="text-2xl font-bold">0</div>
          <div className="text-xs text-muted mt-1">Cross-org detections</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Approval Queue</div>
          <div className="text-2xl font-bold">0</div>
          <div className="text-xs text-muted mt-1">Pending reviews</div>
        </div>
      </div>

      {/* Federation Settings */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <h3 className="text-sm font-medium mb-4">Federation Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm">Global Federation</div>
              <div className="text-xs text-muted">Enable knowledge sharing across all organizations</div>
            </div>
            <div className="w-10 h-5 rounded-full bg-success/20 flex items-center justify-end px-0.5 cursor-pointer">
              <div className="w-4 h-4 rounded-full bg-success" />
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border/20">
            <div>
              <div className="text-sm">Approval Mode</div>
              <div className="text-xs text-muted">Require manual review for federated patterns</div>
            </div>
            <span className="text-xs text-muted-foreground">Auto-approve</span>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border/20">
            <div>
              <div className="text-sm">Data Isolation Level</div>
              <div className="text-xs text-muted">How much data is shared between orgs</div>
            </div>
            <span className="text-xs text-muted-foreground">Moderate</span>
          </div>
        </div>
      </div>
    </div>
  );
}
