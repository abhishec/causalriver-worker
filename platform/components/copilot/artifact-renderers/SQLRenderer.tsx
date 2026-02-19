"use client";
import { FindingRow, InsightBox, ArtifactHeader } from "./shared";

export function SQLRenderer({ data }: { data: Record<string, any> }) {
  const query = data?.query ?? `SELECT * FROM transactions t
JOIN alerts a ON t.id = a.transaction_id
WHERE t.created_at > '2025-01-01'`;
  const findings = data?.findings ?? [
    { severity: "critical" as const, text: "Full table scan on 450M rows" },
    { severity: "high" as const, text: "SELECT * — 42 columns, only 6 needed" },
    { severity: "medium" as const, text: "Missing LIMIT — could return 10M+ rows" },
  ];
  const fix = data?.fix ?? "Add INDEX on created_at, explicit columns, LIMIT 1000.";

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🗄️" title="SQL Analysis" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="font-mono text-[11px] text-info leading-relaxed p-2.5 bg-surface rounded-lg border border-border-subtle mb-2 whitespace-pre-wrap">
          {query.split(/\b(SELECT|FROM|JOIN|WHERE|ON|AND|OR|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|INTO|VALUES|SET|HAVING|LIMIT|OFFSET|UNION|NOT|NULL|IS|LIKE|IN|BETWEEN|EXISTS|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END)\b/g).map((part: string, i: number) => {
            const keywords = ["SELECT","FROM","JOIN","WHERE","ON","AND","OR","INSERT","UPDATE","DELETE","CREATE","ALTER","DROP","TABLE","INDEX","INTO","VALUES","SET","HAVING","LIMIT","OFFSET","UNION","NOT","NULL","IS","LIKE","IN","BETWEEN","EXISTS","AS","DISTINCT","COUNT","SUM","AVG","MIN","MAX","CASE","WHEN","THEN","ELSE","END"];
            return keywords.includes(part)
              ? <span key={i} className="text-brain-training font-medium">{part}</span>
              : <span key={i}>{part}</span>;
          })}
        </div>
        {findings.map((f: any, i: number) => (
          <FindingRow key={i} severity={f.severity} text={f.text} />
        ))}
        <InsightBox><strong>Fix:</strong> {fix}</InsightBox>
      </div>
    </div>
  );
}
