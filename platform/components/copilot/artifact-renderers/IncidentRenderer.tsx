"use client";
import { StatGrid, StatCard, ActionItem, MonoBlock, ArtifactHeader } from "./shared";

export function IncidentRenderer({ data }: { data: Record<string, any> }) {
  const duration = data?.duration ?? "1h 24m";
  const impact = data?.impact ?? "p99 > 5s";
  const chain = data?.chain ?? `Bulk import → Redis 98% → Cache eviction
→ DB fallback → Pool exhaustion
→ Latency spike (p99 > 5s)`;
  const actions = data?.actions ?? [
    { priority: "high" as const, title: "Increase Redis maxmemory" },
    { priority: "medium" as const, title: "Add circuit breaker" },
    { priority: "low" as const, title: "Incremental list loading" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🚨" title="Incident RCA — Latency Spike" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Duration" value={duration} color="red" />
          <StatCard label="Impact" value={impact} color="amber" />
        </StatGrid>
        <MonoBlock>{chain}</MonoBlock>
        <div className="mt-2.5">
          {actions.map((a: any, i: number) => (
            <ActionItem key={i} priority={a.priority} title={a.title} />
          ))}
        </div>
      </div>
    </div>
  );
}
