"use client";
import { StatGrid, StatCard, FindingRow, TechChip, ArtifactHeader } from "./shared";

export function ArchitectureRenderer({ data }: { data: Record<string, any> }) {
  const services = data?.services ?? 8;
  const flows = data?.flows ?? 12;
  const teams = data?.teams ?? 4;
  const risks = data?.risks ?? 2;

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🏛️" title="Architecture — FRAML 6.2" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Services" value={services} color="blue" />
          <StatCard label="Flows" value={flows} color="purple" />
          <StatCard label="Teams" value={teams} color="green" />
          <StatCard label="Risks" value={risks} color="red" />
        </StatGrid>
        <FindingRow severity="critical" text="SPOF in Rule Engine — no redundancy" />
        <FindingRow severity="high" text="No circuit breaker on external APIs" />
        <div className="mt-2 flex flex-wrap">
          <TechChip label="Platform (3)" color="purple" />
          <TechChip label="ML (2)" color="green" />
          <TechChip label="Compliance (2)" color="amber" />
          <TechChip label="DevOps (1)" color="blue" />
        </div>
      </div>
    </div>
  );
}
