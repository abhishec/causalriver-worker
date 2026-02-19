"use client";
import { ScoreBar, InsightBox, ArtifactHeader } from "./shared";

export function LogQueryRenderer({ data }: { data: Record<string, any> }) {
  const totalErrors = data?.totalErrors ?? "12,847";
  const patterns = data?.patterns ?? [
    { name: "ConnectionPoolExhausted (8,234)", value: 64 },
    { name: "KafkaConsumerTimeout (2,891)", value: 22 },
    { name: "SanctionsListParseError (1,234)", value: 10 },
    { name: "AuthTokenExpired (488)", value: 4 },
  ];
  const rootCause = data?.rootCause ?? "64% linked to Redis cache eviction incident.";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="📋" title="Log Analysis — 24h" badge={totalErrors} badgeColor="red" />
      <div className="flex-1 overflow-y-auto p-4">
        {patterns.map((p: any) => (
          <ScoreBar key={p.name} value={p.value} label={p.name} />
        ))}
        <InsightBox><strong>Root Cause:</strong> {rootCause}</InsightBox>
      </div>
    </div>
  );
}
