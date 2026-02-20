/** Lightweight chart spec types + parser — no recharts dependency. */

export interface ChartSpec {
  type: "bar" | "line" | "area" | "stacked-bar";
  title?: string;
  subtitle?: string;
  xKey: string;
  series: Array<{
    key: string;
    label?: string;
    color?: string;
  }>;
  data: Array<Record<string, any>>;
}

export function parseChartSpec(content: string): ChartSpec | null {
  try {
    const trimmed = content.trim();
    const parsed = JSON.parse(trimmed);

    // Validate minimum required fields
    if (!parsed.data || !Array.isArray(parsed.data) || parsed.data.length === 0) return null;
    if (!parsed.xKey || typeof parsed.xKey !== "string") return null;
    if (!parsed.series || !Array.isArray(parsed.series) || parsed.series.length === 0) return null;

    const type = ["bar", "line", "area", "stacked-bar"].includes(parsed.type)
      ? parsed.type
      : "bar";

    return {
      type,
      title: parsed.title || undefined,
      subtitle: parsed.subtitle || undefined,
      xKey: parsed.xKey,
      series: parsed.series.map((s: any) => ({
        key: String(s.key || s.dataKey || "value"),
        label: s.label || s.name || s.key || "Value",
        color: s.color || undefined,
      })),
      data: parsed.data,
    };
  } catch {
    return null;
  }
}
