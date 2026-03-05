"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface SignalTimelineProps {
  signals: SignalData[];
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  className?: string;
}

export interface SignalData {
  id: string;
  domain: string;
  source_type: string;
  created_at: string;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const DATE_RANGES = [
  { id: "7d", label: "7 days" },
  { id: "14d", label: "14 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

const DOMAIN_COLORS: Record<string, string> = {
  engineering: "#3b82f6",
  financial: "#10b981",
  customer: "#8b5cf6",
  product: "#06b6d4",
  marketing: "#f59e0b",
  sales: "#f43f5e",
  support: "#ec4899",
  hr: "#14b8a6",
  operations: "#a78bfa",
  default: "#6b7280",
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function getDomainColor(domain: string): string {
  return DOMAIN_COLORS[domain] || DOMAIN_COLORS.default;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr?.slice(0, 10) ?? "?";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function SignalTimeline({ signals, dateRange, onDateRangeChange, className }: SignalTimelineProps) {
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);

  // Aggregate signals into daily buckets by domain
  const { chartData, domains, totalSignals } = useMemo(() => {
    const days = parseInt(dateRange) || 30;
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Create day buckets
    const buckets: Record<string, Record<string, number>> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = {};
    }

    // Collect unique domains
    const domainSet = new Set<string>();

    // Count signals per day per domain
    let total = 0;
    for (const sig of signals) {
      const day = sig.created_at?.slice(0, 10);
      if (!day || !buckets[day]) continue;
      const domain = sig.domain || "unknown";
      domainSet.add(domain);
      buckets[day][domain] = (buckets[day][domain] || 0) + 1;
      total++;
    }

    const domainList = Array.from(domainSet).sort();

    // Convert to recharts format
    const data = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => {
        const entry: Record<string, any> = { date: formatDate(date) };
        for (const d of domainList) {
          entry[d] = counts[d] || 0;
        }
        entry.total = Object.values(counts).reduce((a, b) => a + b, 0);
        return entry;
      });

    return { chartData: data, domains: domainList, totalSignals: total };
  }, [signals, dateRange]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
    return (
      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg max-w-xs">
        <div className="text-[10px] text-muted mb-1.5 font-medium">{label}</div>
        <div className="text-sm font-semibold mb-1.5">{total.toLocaleString()} signals</div>
        <div className="space-y-0.5">
          {payload
            .filter((p: any) => p.value > 0)
            .sort((a: any, b: any) => b.value - a.value)
            .map((p: any) => (
              <div key={p.dataKey} className="flex items-center justify-between gap-3 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                  <span className="capitalize text-muted-foreground">{p.dataKey}</span>
                </div>
                <span className="font-mono tabular-nums text-foreground">{p.value}</span>
              </div>
            ))}
        </div>
      </div>
    );
  };

  if (signals.length === 0) {
    return (
      <div className={cn("rounded-xl bg-card border border-border-subtle p-6", className)}>
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <svg className="w-8 h-8 text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h4 className="text-sm font-medium text-muted-foreground">No signal data yet</h4>
          <p className="text-xs text-muted mt-1">Connect data sources to see cross-domain activity over time</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl bg-card border border-border-subtle", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <div>
          <h3 className="text-sm font-medium">Signal Activity Timeline</h3>
          <p className="text-[10px] text-muted mt-0.5">
            {totalSignals.toLocaleString()} signals across {domains.length} domain{domains.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => onDateRangeChange(r.id)}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                dateRange === r.id
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-foreground hover:bg-surface-hover"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#71717a" }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#71717a" }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            {domains.map((domain) => (
              <Bar
                key={domain}
                dataKey={domain}
                stackId="signals"
                fill={getDomainColor(domain)}
                opacity={hoveredDomain && hoveredDomain !== domain ? 0.2 : 0.85}
                radius={domain === domains[domains.length - 1] ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                onMouseEnter={() => setHoveredDomain(domain)}
                onMouseLeave={() => setHoveredDomain(null)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Domain Legend */}
      <div className="flex flex-wrap gap-3 px-5 pb-4">
        {domains.map((domain) => (
          <button
            key={domain}
            onMouseEnter={() => setHoveredDomain(domain)}
            onMouseLeave={() => setHoveredDomain(null)}
            className={cn(
              "flex items-center gap-1.5 text-[10px] transition-opacity",
              hoveredDomain && hoveredDomain !== domain ? "opacity-40" : "opacity-100"
            )}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getDomainColor(domain) }} />
            <span className="capitalize text-muted-foreground">{domain}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
