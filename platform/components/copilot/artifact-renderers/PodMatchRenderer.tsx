"use client";
import { StatGrid, StatCard, TechChip, ArtifactHeader } from "./shared";
import { cn } from "@/lib/utils";

interface PodMatch {
  podName: string;
  matchScore: number;
  avgCycleTime: string;
  prsPerWeek: number;
  techStack: string[];
  pastEngagements: { name: string; score: number }[];
}

export function PodMatchRenderer({ data }: { data: Record<string, any> }) {
  // ── Normalise to array of pod matches ─────────────────────────────────────
  const matches: PodMatch[] = data?.pod_matches
    ?? data?.podMatches
    ?? data?.matches
    ?? [{
      podName: data?.podName ?? "Pod Alpha",
      matchScore: data?.matchScore ?? 87,
      avgCycleTime: data?.avgCycleTime ?? "18h",
      prsPerWeek: data?.prsPerWeek ?? 24,
      techStack: data?.techStack ?? ["TypeScript", "Python", "PostgreSQL", "Redis", "Kafka", "React"],
      pastEngagements: data?.pastEngagements ?? [
        { name: "DBS FRAML 5.x", score: 88 },
        { name: "UOB AML", score: 79 },
      ],
    }];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🎯" title="Pod Match" />
      <div className="flex-1 overflow-y-auto p-4">
        {matches.map((pod, idx) => {
          const score = pod.matchScore ?? 0;
          const scoreColor = score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-danger";
          const label = idx === 0 ? "Recommended Pod" : `Alternative ${idx}`;

          return (
            <div key={pod.podName ?? idx} className={cn(
              "border border-border-subtle rounded-xl p-3 mb-2 bg-card",
              idx === 0 && "border-success/20"
            )}>
              {/* ── Pod header + match score ──────────────────────── */}
              <div className="flex justify-between items-center mb-2.5">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wider font-medium">{label}</div>
                  <div className="text-base font-bold text-foreground">{pod.podName}</div>
                </div>
                <div className="text-right">
                  <span className={cn("text-2xl font-extrabold", scoreColor)}>
                    {Math.round(score)}<span className="text-[13px] font-normal text-muted">%</span>
                  </span>
                  <div className="text-[10px] text-muted">match</div>
                </div>
              </div>

              {/* ── Stat cards ────────────────────────────────────── */}
              <StatGrid>
                <StatCard label="Avg Cycle Time" value={pod.avgCycleTime} color="blue" />
                <StatCard label="PRs / Week" value={pod.prsPerWeek} color="green" />
              </StatGrid>

              {/* ── Tech stack ────────────────────────────────────── */}
              {pod.techStack?.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">Tech Stack</div>
                  <div className="flex flex-wrap">
                    {pod.techStack.map((t: string) => <TechChip key={t} label={t} />)}
                  </div>
                </div>
              )}

              {/* ── Past engagements ──────────────────────────────── */}
              {pod.pastEngagements?.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted mb-1 mt-2 font-medium uppercase tracking-wider">Past Engagements</div>
                  <div className="flex gap-1.5">
                    {pod.pastEngagements.map((pe) => {
                      const peColor = pe.score >= 80 ? "text-success" : pe.score >= 60 ? "text-warning" : "text-danger";
                      return (
                        <div key={pe.name} className="flex-1 px-2.5 py-2 rounded-lg bg-surface border border-border-subtle">
                          <div className="text-[12px] font-semibold text-foreground">{pe.name}</div>
                          <div className="text-[10px] text-muted">Score: <span className={cn("font-semibold", peColor)}>{pe.score}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
