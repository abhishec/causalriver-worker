"use client";
import { StatGrid, StatCard, MonoBlock, ArtifactHeader } from "./shared";

export function HLDLLDRenderer({ data }: { data: Record<string, any> }) {
  const diagram = data?.diagram ?? `┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  API Gateway │────▶│  Screening   │────▶│ Rule Engine  │
│   (FastAPI)  │     │   Service    │     │  (Python)    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       ▼                    ▼                     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│    Kafka     │     │    Redis     │     │ PostgreSQL  │
└──────┬───────┘     └──────────────┘     └─────────────┘
       ▼
┌─────────────┐     ┌──────────────┐
│Case Manager │────▶│  Reporting   │
└─────────────┘     └──────────────┘`;

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="📐" title="HLD/LLD — FRAML 6.2" />
      <div className="flex-1 overflow-y-auto p-4">
        <MonoBlock>{diagram}</MonoBlock>
        <StatGrid cols={4}>
          <StatCard label="Transactions" value="450M" color="blue" />
          <StatCard label="Rules" value="2,400" color="purple" />
          <StatCard label="Cases/mo" value="12K" color="amber" />
          <StatCard label="Alerts/mo" value="45K" color="red" />
        </StatGrid>
      </div>
    </div>
  );
}
