"use client";
import { StatGrid, StatCard, MonoBlock, ArtifactHeader } from "./shared";

export function CodebaseQARenderer({ data }: { data: Record<string, any> }) {
  const modules = data?.modules ?? 3;
  const databases = data?.databases ?? 2;
  const queue = data?.queue ?? 1;
  const endpoints = data?.endpoints ?? 8;
  const pipeline = data?.pipeline ?? "Ingest → Kafka → Enrich → Screen → Alert → Case → Export";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="💬" title="Codebase Q&A" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Modules" value={modules} color="blue" />
          <StatCard label="Databases" value={databases} color="purple" />
          <StatCard label="Queue" value={queue} color="amber" />
          <StatCard label="Endpoints" value={endpoints} color="green" />
        </StatGrid>
        <MonoBlock>{pipeline}</MonoBlock>
      </div>
    </div>
  );
}
