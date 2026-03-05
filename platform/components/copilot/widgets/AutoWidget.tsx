"use client";

/**
 * AutoWidget — Generic fallback renderer for any widget the LLM invents.
 *
 * When the LLM emits a ```widget {"kind":"anything", "data":{...}}``` block
 * and "anything" is not in WIDGET_MAP, this component inspects the data shape
 * and automatically picks the best visualization:
 *
 *   data.rows + data.columns  → auto table
 *   data.metrics[]            → auto metric grid
 *   data.values[]             → auto sparkline / bar
 *   data.score (0–100)        → auto ring
 *   data.items[]              → auto bullet list
 *   data.steps[]              → auto step list
 *   data.series + data.rows   → auto chart
 *   fallback                  → styled key-value card
 *
 * The LLM can invent any kind name — no pre-registration needed.
 */

import dynamic from "next/dynamic";
import type { WidgetProps } from "./widget-registry";
import { KpiCard, StatGrid, StatCard, HealthRing } from "@/components/copilot/artifact-renderers/shared";
import type { ChartSpec } from "@/components/copilot/chart-utils";

const InlineChart = dynamic(
  () => import("@/components/copilot/InlineChart").then((m) => ({ default: m.InlineChart })),
  { ssr: false },
);

const SparklineWidget = dynamic(
  () => import("./SparklineWidget").then((m) => ({ default: m.SparklineWidget })),
  { ssr: false },
);

// ── Shape detectors ──────────────────────────────────────────────────────────

function isTable(data: Record<string, unknown>) {
  return (
    Array.isArray(data.rows) &&
    (Array.isArray(data.columns) || (data.rows as unknown[]).length > 0)
  );
}

function isMetricGrid(data: Record<string, unknown>) {
  return Array.isArray(data.metrics) && (data.metrics as unknown[]).length > 0;
}

function isSingleMetric(data: Record<string, unknown>) {
  return data.value !== undefined && !Array.isArray(data.value);
}

function isSparkline(data: Record<string, unknown>) {
  return Array.isArray(data.values) && typeof (data.values as unknown[])[0] === "number";
}

function isChart(data: Record<string, unknown>) {
  return Array.isArray(data.series) && Array.isArray(data.rows ?? data.data);
}

function isRing(data: Record<string, unknown>) {
  return typeof data.score === "number" || (typeof data.score === "string" && !isNaN(Number(data.score)));
}

function isItemList(data: Record<string, unknown>) {
  return Array.isArray(data.items) && (data.items as unknown[]).length > 0;
}

function isStepList(data: Record<string, unknown>) {
  return Array.isArray(data.steps) && (data.steps as unknown[]).length > 0;
}

// ── Sub-renderers ────────────────────────────────────────────────────────────

function AutoTable({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as Array<Record<string, unknown>>) ?? [];
  const columns: string[] =
    Array.isArray(data.columns)
      ? (data.columns as string[])
      : rows.length > 0
      ? Object.keys(rows[0])
      : [];

  if (columns.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle my-2">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-border-subtle bg-surface/40">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-muted uppercase tracking-wider">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle/40 last:border-0 hover:bg-surface/20">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-foreground">
                  {String(row[col] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AutoItemList({ data, kind }: { data: Record<string, unknown>; kind: string }) {
  const items = data.items ?? data.steps ?? [];
  const isSteps = kind.includes("step") || Array.isArray(data.steps);

  return (
    <div className="my-2 space-y-1.5">
      {(items as unknown[]).map((item, i) => {
        const text = typeof item === "string" ? item : (item as Record<string, unknown>).label ?? (item as Record<string, unknown>).title ?? String(item);
        const detail = typeof item === "object" ? String((item as Record<string, unknown>).description ?? (item as Record<string, unknown>).detail ?? "") || null : null;
        return (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            {isSteps ? (
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
            ) : (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60 mt-2" />
            )}
            <div>
              <span className="text-foreground">{String(text)}</span>
              {detail && <p className="text-xs text-muted mt-0.5">{String(detail)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AutoKVCard({ data, kind, title }: { data: Record<string, unknown>; kind: string; title?: string }) {
  // Render remaining keys as a formatted card
  const skip = new Set(["kind", "title", "subtitle"]);
  const entries = Object.entries(data).filter(([k]) => !skip.has(k));

  const formatKey = (k: string) =>
    k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (Array.isArray(v)) return v.map(String).join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="my-2 rounded-xl border border-border-subtle overflow-hidden">
      {(title ?? kind) && (
        <div className="px-3 py-2 bg-surface/40 border-b border-border-subtle">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
            {title ?? kind.replace(/_/g, " ")}
          </span>
        </div>
      )}
      <div className="divide-y divide-border-subtle/40">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between px-3 py-2 text-xs gap-4">
            <span className="text-muted shrink-0">{formatKey(k)}</span>
            <span className="text-foreground text-right font-medium">{formatValue(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shape detection ───────────────────────────────────────────────────────────

type DataShape = "ring" | "metric" | "metric_grid" | "chart" | "sparkline" | "table" | "list" | "kv";

function detectShape(data: Record<string, unknown>): DataShape {
  if (isRing(data))        return "ring";
  if (isMetricGrid(data))  return "metric_grid";
  if (isSingleMetric(data)) return "metric";
  if (isChart(data))       return "chart";
  if (isSparkline(data))   return "sparkline";
  if (isTable(data))       return "table";
  if (isItemList(data) || isStepList(data)) return "list";
  return "kv";
}

// ── Main AutoWidget ───────────────────────────────────────────────────────────

export function AutoWidget({ kind, title, subtitle, data }: WidgetProps) {
  const label = kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const shape = detectShape(data);

  return (
    <div className="my-2">
      {/* Kind badge — shows the LLM-invented widget name */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
          {title ?? label}
        </span>
        {subtitle && <span className="text-[10px] text-muted/60">· {subtitle}</span>}
      </div>

      {shape === "ring" && (
        <div className="flex items-center gap-3">
          <HealthRing score={Number(data.score)} size={56} />
          {(data.label ?? title) && (
            <span className="text-sm font-medium text-foreground">{String(data.label ?? title)}</span>
          )}
        </div>
      )}

      {shape === "metric" && (
        <KpiCard
          label={title ?? label}
          value={String(data.value ?? "—")}
          sub={data.sub ? String(data.sub) : data.change ? String(data.change) : undefined}
          color={data.color as string | undefined}
        />
      )}

      {shape === "metric_grid" && (
        <StatGrid cols={(data.cols as 2 | 3 | 4) ?? 2}>
          {(data.metrics as Array<{ label: string; value: string; color?: string }>).map((m, i) => (
            <StatCard key={i} label={m.label} value={String(m.value)} color={m.color} />
          ))}
        </StatGrid>
      )}

      {shape === "chart" && (
        <InlineChart
          spec={{
            type: (data.type as ChartSpec["type"]) ?? "bar",
            title,
            subtitle,
            xKey: String(data.xKey ?? "x"),
            series: data.series as ChartSpec["series"],
            data: (data.rows ?? data.data ?? []) as ChartSpec["data"],
          }}
        />
      )}

      {shape === "sparkline" && (
        <SparklineWidget kind={kind} title={title} data={data} />
      )}

      {shape === "table" && <AutoTable data={data} />}

      {shape === "list" && <AutoItemList data={data} kind={kind} />}

      {shape === "kv" && <AutoKVCard data={data} kind={kind} title={title} />}
    </div>
  );
}
