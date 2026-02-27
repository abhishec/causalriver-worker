"use client";

import { AgentLiveMonitor } from "@/components/dashboard/AgentLiveMonitor";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface AgentsTabProps {
  orgId: string;
}

export function AgentsTab({ orgId }: AgentsTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Agent Activity</h2>
        <p className="text-xs text-muted-foreground">
          Real-time view of AI agent jobs for this AI worker space. Updates live via Supabase Realtime.
        </p>
      </div>
      <ErrorBoundary>
        <AgentLiveMonitor orgId={orgId} />
      </ErrorBoundary>
    </div>
  );
}
