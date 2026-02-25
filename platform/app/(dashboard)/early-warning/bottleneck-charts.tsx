'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface ReviewerData {
  reviewer: string;
  reviewCount: number;
  share: number;
  avgLatencyHours: number;
  betweennessCentrality: number;
}

interface BottleneckChartsProps {
  reviewerBreakdown: ReviewerData[];
  riskScore: number;
  giniCoefficient: number;
  hhi: number;
  topReviewerShare: number;
  reviewerCount: number;
  maxBetweenness: number;
  avgLatencyHours: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-medium mb-1">{d.reviewer}</div>
      <div className="text-muted">
        {d.reviewCount} reviews ({(d.share * 100).toFixed(1)}%)
      </div>
      <div className="text-muted">
        Avg latency: {d.avgLatencyHours.toFixed(1)}h
      </div>
      {d.betweennessCentrality > 0 && (
        <div className="text-muted">
          Centrality: {(d.betweennessCentrality * 100).toFixed(1)}
        </div>
      )}
    </div>
  );
};

function getBarColor(share: number): string {
  if (share > 0.4) return '#ef4444';  // danger
  if (share > 0.25) return '#f59e0b'; // warning
  return '#7c6cf0';                    // accent
}

export function ReviewerDistributionChart({ reviewerBreakdown }: { reviewerBreakdown: ReviewerData[] }) {
  if (!reviewerBreakdown || reviewerBreakdown.length === 0) {
    return (
      <div className="text-sm text-muted py-6 text-center">
        No reviewer data available. Run analysis to generate reviewer distribution.
      </div>
    );
  }

  // Show top 10 reviewers
  const data = reviewerBreakdown.slice(0, 10).map((r) => ({
    ...r,
    reviewer: r.reviewer.length > 12 ? r.reviewer.slice(0, 11) + '…' : r.reviewer,
    fullName: r.reviewer,
    sharePercent: Math.round(r.share * 100),
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 28 + 20)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: '#71717a' }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="reviewer"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            width={100}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="sharePercent" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((entry, i) => (
              <Cell key={i} fill={getBarColor(entry.share)} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {reviewerBreakdown.length > 10 && (
        <div className="text-[10px] text-muted text-center mt-1">
          Showing top 10 of {reviewerBreakdown.length} reviewers
        </div>
      )}
    </div>
  );
}

/** Visual breakdown of the 6-factor BRS (Bottleneck Risk Score) */
export function BRSBreakdown({
  riskScore,
  giniCoefficient,
  hhi,
  topReviewerShare,
  reviewerCount,
  maxBetweenness,
  avgLatencyHours,
}: BottleneckChartsProps) {
  // Calculate each component exactly as the BRS formula does
  const components = [
    {
      label: 'Inequality (Gini)',
      value: Math.min(giniCoefficient, 1.0) * 25,
      max: 25,
      raw: giniCoefficient.toFixed(3),
      color: '#7c6cf0',
    },
    {
      label: 'Concentration (HHI)',
      value: Math.min(hhi / 0.5, 1.0) * 20,
      max: 20,
      raw: hhi.toFixed(3),
      color: hhi > 0.25 ? '#ef4444' : '#3b82f6',
    },
    {
      label: 'Top Reviewer Share',
      value: topReviewerShare * 20,
      max: 20,
      raw: `${(topReviewerShare * 100).toFixed(0)}%`,
      color: topReviewerShare > 0.4 ? '#ef4444' : '#f59e0b',
    },
    {
      label: 'Few Reviewers',
      value: Math.min((1 / Math.max(reviewerCount, 1)) * 15, 15),
      max: 15,
      raw: `${reviewerCount} reviewers`,
      color: '#38bdf8',
    },
    {
      label: 'Gatekeeper (Centrality)',
      value: Math.min((maxBetweenness ?? 0) * 100, 10),
      max: 10,
      raw: ((maxBetweenness ?? 0) * 100).toFixed(1),
      color: '#a78bfa',
    },
    {
      label: 'Latency Spike',
      value: Math.min((avgLatencyHours ?? 0) / 48, 1.0) * 10,
      max: 10,
      raw: `${(avgLatencyHours ?? 0).toFixed(1)}h avg`,
      color: (avgLatencyHours ?? 0) > 48 ? '#ef4444' : '#22c55e',
    },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted font-medium">BRS Component Breakdown</span>
        <span className="font-bold tabular-nums">
          {riskScore.toFixed(0)}<span className="text-muted font-normal">/100</span>
        </span>
      </div>
      {components.map((c) => (
        <div key={c.label} className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted">{c.label}</span>
            <span className="tabular-nums text-foreground">
              {c.value.toFixed(1)}/{c.max}{' '}
              <span className="text-muted">({c.raw})</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(c.value / c.max) * 100}%`,
                backgroundColor: c.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
