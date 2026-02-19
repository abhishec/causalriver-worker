'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface VelocitySnapshot {
  id: string;
  snapshot_date: string;
  prs_merged: number;
  mean_pr_cycle_time_hours?: number;
  [key: string]: unknown;
}

interface VelocityTrendChartProps {
  snapshots: VelocitySnapshot[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-medium mb-1">{d.dateLabel}</div>
      <div className="text-muted">{d.prs_merged} PRs merged</div>
      {d.cycleTimeDays != null && (
        <div className="text-muted">Cycle time: {d.cycleTimeDays}d</div>
      )}
    </div>
  );
};

export function VelocityTrendChart({ snapshots }: VelocityTrendChartProps) {
  const data = snapshots
    .slice(0, 14)
    .reverse()
    .map((s) => ({
      ...s,
      dateLabel: new Date(s.snapshot_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      cycleTimeDays: s.mean_pr_cycle_time_hours
        ? Number((s.mean_pr_cycle_time_hours / 24).toFixed(1))
        : null,
    }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="velFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c6cf0" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c6cf0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="prs_merged"
          stroke="#7c6cf0"
          strokeWidth={2}
          fill="url(#velFill)"
          dot={{ r: 3, fill: '#7c6cf0', stroke: '#18181b', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: '#7c6cf0' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
