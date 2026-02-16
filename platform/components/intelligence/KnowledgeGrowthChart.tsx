"use client";

import { Card, CardTitle } from "@/components/ui/Card";
import { MetricChart } from "@/components/ui/MetricChart";

interface KnowledgeGrowthChartProps {
  data: { date: string; edges: number; signals: number }[];
  className?: string;
}

export function KnowledgeGrowthChart({ data, className }: KnowledgeGrowthChartProps) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3">
        <CardTitle>Knowledge Growth</CardTitle>
        <span className="text-[10px] text-muted">Past 30 days</span>
      </div>
      <MetricChart
        data={data}
        dataKey="edges"
        xKey="date"
        type="area"
        color="accent"
        height={140}
        showAxis={false}
        formatValue={(v) => `${v} edges`}
        formatLabel={(l) => {
          const d = new Date(l);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        }}
      />
    </Card>
  );
}
