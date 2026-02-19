"use client";
import { TechChip, MonoBlock, BalanceCheck, ArtifactHeader } from "./shared";

export function LineageRenderer({ data }: { data: Record<string, any> }) {
  const upstream = data?.upstream ?? ["Bank Feed API", "Manual Entry", "Bulk Import"];
  const downstream = data?.downstream ?? ["alerts", "cases", "reports", "sanctions_results", "velocity_metrics", "audit_log", "compliance_export"];
  const flow = data?.flow ?? "raw → cleaned → enriched → aggregated";
  const compliant = data?.compliant ?? true;
  const complianceLabel = data?.complianceLabel ?? "PDPA-compliant — PII encrypted at rest";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🔗" title="Data Lineage — transactions" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] font-semibold uppercase text-muted tracking-wider mb-1">Upstream ({upstream.length})</div>
        <div className="flex flex-wrap mb-2.5">{upstream.map((u: string) => <TechChip key={u} label={u} />)}</div>
        <div className="text-[10px] font-semibold uppercase text-muted tracking-wider mb-1">Downstream ({downstream.length})</div>
        <div className="flex flex-wrap mb-2.5">{downstream.map((d: string) => <TechChip key={d} label={d} />)}</div>
        <MonoBlock>{flow}</MonoBlock>
        <div className="mt-2">
          <BalanceCheck balanced={compliant} label={complianceLabel} />
        </div>
      </div>
    </div>
  );
}
