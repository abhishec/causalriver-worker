"use client";

/**
 * ProductFeatureWidget
 * ────────────────────
 * Structured product feature grid with tier availability badges.
 * data shape:
 * {
 *   product?: string,
 *   tiers?: string[],                  // e.g. ["Free", "Pro", "Enterprise"]
 *   features: Array<{
 *     name: string,
 *     category?: string,
 *     description?: string,
 *     available: Array<boolean | string> // one per tier — true/false or "100/mo"/"Unlimited"
 *   }>
 * }
 */

import type { WidgetProps } from "./widget-registry";

interface ProductFeature {
  name: string;
  category?: string;
  description?: string;
  available: Array<boolean | string>;
}

const TIER_COLORS: Record<string, string> = {
  free: "bg-muted/40 text-muted-foreground",
  starter: "bg-blue-500/15 text-blue-400",
  pro: "bg-violet-500/15 text-violet-400",
  business: "bg-amber-500/15 text-amber-500",
  enterprise: "bg-emerald-500/15 text-emerald-400",
};

function getTierColor(tier: string) {
  return TIER_COLORS[tier.toLowerCase()] ?? "bg-primary/10 text-primary";
}

function AvailCell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
    ) : (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface text-muted text-xs border border-border-subtle">—</span>
    );
  }
  return <span className="text-xs font-medium text-foreground">{value}</span>;
}

export function ProductFeatureWidget({ title, subtitle, data }: WidgetProps) {
  const product = data.product as string | undefined;
  const tiers = (data.tiers as string[] | undefined) ?? [];
  const features = (data.features as ProductFeature[] | undefined) ?? [];

  if (!features.length) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface/30 px-4 py-3 text-sm text-muted my-2">
        No feature data available.
      </div>
    );
  }

  const categories = Array.from(new Set(features.map((f) => f.category ?? "Features")));

  return (
    <div className="my-3 rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface/40">
        <div className="text-sm font-semibold text-foreground">{title ?? product ?? "Product Features"}</div>
        {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
        {tiers.length > 0 && (
          <div className="flex gap-1.5 mt-2">
            {tiers.map((tier, i) => (
              <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getTierColor(tier)}`}>
                {tier}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          {tiers.length > 0 && (
            <thead>
              <tr className="bg-surface/60 border-b border-border-subtle">
                <th className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">Feature</th>
                {tiers.map((t, i) => (
                  <th key={i} className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-center ${getTierColor(t).split(" ")[1]}`}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {categories.map((cat) => {
              const catFeatures = features.filter((f) => (f.category ?? "Features") === cat);
              return (
                <>
                  {categories.length > 1 && (
                    <tr key={`cat-${cat}`} className="bg-surface/20">
                      <td
                        colSpan={tiers.length + 1}
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
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-foreground">{feat.name}</div>
                        {feat.description && (
                          <div className="text-xs text-muted mt-0.5 max-w-xs">{feat.description}</div>
                        )}
                      </td>
                      {tiers.length > 0
                        ? feat.available.map((val, vi) => (
                            <td key={vi} className="px-3 py-2 text-center">
                              <AvailCell value={val} />
                            </td>
                          ))
                        : null}
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
