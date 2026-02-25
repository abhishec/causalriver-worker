"use client";

import { Card, CardTitle } from "@/components/ui/Card";
import { DomainTag } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface SignalRate {
  domain: string;
  count: number;
  rate: number; // per hour
}

interface SignalRatePanelProps {
  signals: SignalRate[];
  totalRate: number;
  className?: string;
}

export function SignalRatePanel({ signals, totalRate, className }: SignalRatePanelProps) {
  const maxCount = signals.length > 0 ? Math.max(...signals.map((s) => s.count), 1) : 1;

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3">
        <CardTitle>Signal Ingestion</CardTitle>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brain-active brain-pulse" />
          <span className="text-[11px] text-muted tabular-nums">{totalRate}/hr</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {signals.map((s) => (
          <div key={s.domain} className="flex items-center gap-3">
            <DomainTag domain={s.domain} className="w-24" />
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/60 transition-all duration-500"
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] text-muted tabular-nums w-12 text-right">
              {s.count}
            </span>
          </div>
        ))}
      </div>

      {signals.length === 0 && (
        <p className="text-xs text-muted text-center py-4">No signals yet. Connect data sources to begin.</p>
      )}
    </Card>
  );
}
