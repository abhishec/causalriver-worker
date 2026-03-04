"use client";

/**
 * ComparisonTableWidget
 * ─────────────────────
 * Side-by-side feature comparison table.
 * data shape:
 * {
 *   competitors: string[],            // e.g. ["Our Product", "Competitor A", "Competitor B"]
 *   features: Array<{
 *     name: string,
 *     category?: string,
 *     values: Array<string | boolean>  // one per competitor, in same order
 *   }>
 * }
 */

import type { WidgetProps } from "./widget-registry";

interface ComparisonFeature {
  name: string;
  category?: string;
  values: Array<string | boolean>;
}

function ValueCell({ value, isFirst }: { value: string | boolean; isFirst: boolean }) {
  if (typeof value === "boolean") {
    return (
      <td className={`px-3 py-2 text-center text-sm ${isFirst ? "font-medium" : ""}`}>
        {value ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
        ) : (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/10 text-muted text-xs">✗</span>
        )}
      </td>
    );
  }
  return (
    <td className={`px-3 py-2 text-sm ${isFirst ? "text-foreground font-medium" : "text-muted-foreground"}`}>
      {value || <span className="text-muted text-xs">—</span>}
    </td>
  );
}

export function ComparisonTableWidget({ title, subtitle, data }: WidgetProps) {
  const competitors = (data.competitors as string[] | undefined) ?? [];
  const features = (data.features as ComparisonFeature[] | undefined) ?? [];

  if (!competitors.length || !features.length) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface/30 px-4 py-3 text-sm text-muted my-2">
        No comparison data available.
      </div>
    );
  }

  // Group features by category
  const categories = Array.from(new Set(features.map((f) => f.category ?? "General")));

  return (
    <div className="my-3 rounded-xl border border-border-subtle overflow-hidden">
      {(title || subtitle) && (
        <div className="px-4 py-2.5 border-b border-border-subtle bg-surface/40">
          {title && <div className="text-sm font-semibold text-foreground">{title}</div>}
          {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface/60 border-b border-border-subtle">
              <th className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider w-40">Feature</th>
              {competitors.map((c, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                    i === 0 ? "text-primary" : "text-muted"
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const catFeatures = features.filter((f) => (f.category ?? "General") === cat);
              return (
                <>
                  {categories.length > 1 && (
                    <tr key={`cat-${cat}`} className="bg-surface/20">
                      <td
                        colSpan={competitors.length + 1}
                        className="px-3 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider border-t border-border-subtle/50"
                      >
                        {cat}
                      </td>
                    </tr>
                  )}
                  {catFeatures.map((feat, fi) => (
                    <tr
                      key={`${cat}-${fi}`}
                      className="border-t border-border-subtle/40 hover:bg-surface/30 transition-colors"
                    >
                      <td className="px-3 py-2 text-sm text-foreground font-medium">{feat.name}</td>
                      {feat.values.map((val, vi) => (
                        <ValueCell key={vi} value={val} isFirst={vi === 0} />
                      ))}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
