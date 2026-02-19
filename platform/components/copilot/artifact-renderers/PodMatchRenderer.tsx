"use client";
import { StatGrid, StatCard, TechChip, ArtifactHeader } from "./shared";

export function PodMatchRenderer({ data }: { data: Record<string, any> }) {
  const podName = data?.podName ?? "Pod Alpha";
  const matchScore = data?.matchScore ?? 87;
  const cycleTime = data?.avgCycleTime ?? "18h";
  const prsPerWeek = data?.prsPerWeek ?? 24;
  const techStack = data?.techStack ?? ["TypeScript", "Python", "PostgreSQL", "Redis", "Kafka", "React"];
  const pastEngagements = data?.pastEngagements ?? [
    { name: "DBS FRAML 5.x", score: 88 },
    { name: "UOB AML", score: 79 },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🎯" title="Pod Match" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="border border-border-subtle rounded-xl p-3 mb-2 bg-card">
          <div className="flex justify-between items-center mb-2.5">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider font-medium">Recommended Pod</div>
              <div className="text-base font-bold text-foreground">{podName}</div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-extrabold text-success">{matchScore}<span className="text-[13px] font-normal text-muted">%</span></span>
              <div className="text-[10px] text-muted">match</div>
            </div>
          </div>
          <StatGrid>
            <StatCard label="Avg Cycle Time" value={cycleTime} color="blue" />
            <StatCard label="PRs / Week" value={prsPerWeek} color="green" />
          </StatGrid>
          <div className="mb-2">
            <div className="text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">Tech Stack</div>
            <div className="flex flex-wrap">{techStack.map((t: string) => <TechChip key={t} label={t} />)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted mb-1 mt-2 font-medium uppercase tracking-wider">Past Engagements</div>
            <div className="flex gap-1.5">
              {pastEngagements.map((pe: any) => (
                <div key={pe.name} className="flex-1 px-2.5 py-2 rounded-lg bg-surface border border-border-subtle">
                  <div className="text-[12px] font-semibold text-foreground">{pe.name}</div>
                  <div className="text-[10px] text-muted">Score: <span className="text-success font-semibold">{pe.score}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
