"use client";

/**
 * WidgetRenderer — central dispatch for the Dynamic Widget System.
 *
 * Receives a WidgetPayload, looks up the renderer in WIDGET_MAP, renders it.
 * Adapters wrap existing shared components (KpiCard, StatGrid, InlineChart, HealthRing).
 */

import dynamic from "next/dynamic";
import { getWidgetComponent, registerWidget } from "./widget-registry";
import type { WidgetPayload } from "@/components/copilot/types";
import type { WidgetProps } from "./widget-registry";
import { KpiCard, StatGrid, StatCard, HealthRing } from "@/components/copilot/artifact-renderers/shared";
import type { ChartSpec } from "@/components/copilot/chart-utils";

// ── Lazy-load recharts-heavy widgets ────────────────────────────────────────
const SparklineWidget = dynamic(
  () => import("./SparklineWidget").then((m) => ({ default: m.SparklineWidget })),
  { ssr: false },
);
const DataTableWidget = dynamic(
  () => import("./DataTableWidget").then((m) => ({ default: m.DataTableWidget })),
  { ssr: false },
);
const InlineChart = dynamic(
  () => import("@/components/copilot/InlineChart").then((m) => ({ default: m.InlineChart })),
  { ssr: false },
);
const ComparisonTableWidget = dynamic(
  () => import("./ComparisonTableWidget").then((m) => ({ default: m.ComparisonTableWidget })),
  { ssr: false },
);
const ProductFeatureWidget = dynamic(
  () => import("./ProductFeatureWidget").then((m) => ({ default: m.ProductFeatureWidget })),
  { ssr: false },
);
const UserStoryWidget = dynamic(
  () => import("./UserStoryWidget").then((m) => ({ default: m.UserStoryWidget })),
  { ssr: false },
);
const KBSummaryWidget = dynamic(
  () => import("./KBSummaryWidget").then((m) => ({ default: m.KBSummaryWidget })),
  { ssr: false },
);
const AgentJobWidget = dynamic(
  () => import("./AgentJobWidget").then((m) => ({ default: m.AgentJobWidget })),
  { ssr: false },
);

// ── Inline adapters: wrap shared components to match WidgetProps ─────────────

function MetricCardWidget({ title, data }: WidgetProps) {
  return (
    <div className="my-2">
      <KpiCard
        label={title ?? String(data.label ?? "Metric")}
        value={String(data.value ?? "\u2014")}
        sub={data.sub ? String(data.sub) : undefined}
        color={data.color as string | undefined}
      />
    </div>
  );
}

function MetricGridWidget({ title, data }: WidgetProps) {
  const metrics = Array.isArray(data.metrics)
    ? (data.metrics as Array<{ label: string; value: string; color?: string }>)
    : [];
  const cols = (data.cols as 2 | 3 | 4) ?? (metrics.length <= 2 ? 2 : metrics.length === 3 ? 3 : 4);
  return (
    <div className="my-2">
      {title && (
        <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-1.5">
          {title}
        </div>
      )}
      <StatGrid cols={cols}>
        {metrics.map((m, i) => (
          <StatCard key={i} label={m.label} value={m.value} color={m.color} />
        ))}
      </StatGrid>
    </div>
  );
}

function BarChartWidget({ title, subtitle, data }: WidgetProps) {
  const spec: ChartSpec = {
    type: "bar",
    title,
    subtitle,
    xKey: String(data.xKey ?? "x"),
    series: (data.series as ChartSpec["series"]) ?? [],
    data: (data.rows ?? data.data ?? []) as ChartSpec["data"],
  };
  return <InlineChart spec={spec} />;
}

function LineChartWidget({ title, subtitle, data }: WidgetProps) {
  const spec: ChartSpec = {
    type: "line",
    title,
    subtitle,
    xKey: String(data.xKey ?? "x"),
    series: (data.series as ChartSpec["series"]) ?? [],
    data: (data.rows ?? data.data ?? []) as ChartSpec["data"],
  };
  return <InlineChart spec={spec} />;
}

function ProgressRingWidget({ title, data }: WidgetProps) {
  const score = Number(data.score ?? data.value ?? 0);
  return (
    <div className="flex items-center gap-3 my-2">
      <HealthRing score={score} size={56} />
      {title && <span className="text-sm font-medium text-foreground">{title}</span>}
    </div>
  );
}

// ── Bootstrap registry ────────────────────────────────────────────────────────
registerWidget("metric_card", MetricCardWidget);
registerWidget("metric_grid", MetricGridWidget);
registerWidget("bar_chart", BarChartWidget);
registerWidget("line_chart", LineChartWidget);
registerWidget("sparkline", SparklineWidget as unknown as React.ComponentType<WidgetProps>);
registerWidget("data_table", DataTableWidget as unknown as React.ComponentType<WidgetProps>);
registerWidget("progress_ring", ProgressRingWidget);
// ── New general-purpose widgets (Loop 1) ──
registerWidget("comparison_table", ComparisonTableWidget as unknown as React.ComponentType<WidgetProps>);
registerWidget("product_feature_grid", ProductFeatureWidget as unknown as React.ComponentType<WidgetProps>);
registerWidget("user_story_card", UserStoryWidget as unknown as React.ComponentType<WidgetProps>);
registerWidget("kb_summary", KBSummaryWidget as unknown as React.ComponentType<WidgetProps>);
registerWidget("agent_job", AgentJobWidget as unknown as React.ComponentType<WidgetProps>);

// ── Main dispatch component ───────────────────────────────────────────────────

export function WidgetRenderer({ widget }: { widget: WidgetPayload }) {
  const { kind, title, subtitle, data } = widget;
  const Component = getWidgetComponent(kind);

  if (!Component) {
    return (
      <div className="rounded-xl bg-surface/30 border border-border-subtle px-3 py-2 text-xs text-muted my-2">
        Widget type <code className="font-mono">{kind}</code> not registered
      </div>
    );
  }

  return <Component kind={kind} title={title} subtitle={subtitle} data={data} />;
}
