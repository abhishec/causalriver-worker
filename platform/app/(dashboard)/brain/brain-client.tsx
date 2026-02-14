"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CausalGraph } from "@/components/dashboard/CausalGraph";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CausalEdge {
  id: string;
  source_entity: string;
  target_entity: string;
  strength: number;
  p_value: number;
  lag_periods: number;
  method: string;
  domain: string;
  created_at: string;
}

interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  domain: string;
  aliases: string[];
  confidence: number;
  created_at: string;
}

interface Snapshot {
  snapshot_date: string;
  total_signals: number;
  total_causal_edges: number;
  prediction_accuracy: number;
  regions_active: string[];
  top_discoveries: string[];
  brain_health_score: number;
}

interface BrainClientProps {
  causalEdges: CausalEdge[];
  entities: Entity[];
  snapshot: Snapshot | null;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ALL_REGIONS = [
  "financial",
  "customer",
  "product",
  "marketing",
  "sales",
  "support",
  "engineering",
  "hr",
  "operations",
  "legal",
  "executive",
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function strengthColor(strength: number): string {
  if (strength > 0.7) return "bg-success";
  if (strength >= 0.4) return "bg-warning";
  return "bg-danger";
}

function strengthLabel(strength: number): string {
  if (strength > 0.7) return "text-success";
  if (strength >= 0.4) return "text-warning";
  return "text-danger";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function BrainClient({ causalEdges, entities, snapshot }: BrainClientProps) {
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [confidenceMin, setConfidenceMin] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");

  // Extract unique domains from the edges
  const domains = useMemo(() => {
    const set = new Set<string>();
    causalEdges.forEach((e) => {
      if (e.domain) set.add(e.domain);
    });
    return Array.from(set).sort();
  }, [causalEdges]);

  // Filter edges
  const filteredEdges = useMemo(() => {
    return causalEdges.filter((edge) => {
      if (domainFilter !== "all" && edge.domain !== domainFilter) return false;
      if (edge.strength < confidenceMin) return false;
      return true;
    });
  }, [causalEdges, domainFilter, confidenceMin]);

  const activeRegions = snapshot?.regions_active || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Brain Explorer</h1>
          <p className="text-muted text-sm mt-1">
            Explore the causal knowledge graph and brain regions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium">
            {causalEdges.length} edges loaded
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-surface text-muted-foreground text-xs">
            {entities.length} entities
          </div>
        </div>
      </div>

      {/* Main layout: graph + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left content: 3 cols */}
        <div className="lg:col-span-3 space-y-6">
          {/* Causal Knowledge Graph section */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Causal Knowledge Graph</h2>
                  <p className="text-xs text-muted mt-0.5">
                    Statistical relationships discovered by the brain
                  </p>
                </div>
                {/* View toggle */}
                <div className="flex items-center rounded-lg bg-surface border border-border/30 p-0.5">
                  <button
                    onClick={() => setViewMode("graph")}
                    className={cn(
                      "px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
                      viewMode === "graph" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
                    )}
                  >
                    Graph
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
                      viewMode === "list" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
                    )}
                  >
                    List
                  </button>
                </div>
              </div>

              {/* Filter controls */}
              <div className="flex items-center gap-3">
                {/* Domain dropdown */}
                <select
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  className="text-xs bg-input border border-input-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="all">All domains</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                {/* Confidence slider placeholder */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted whitespace-nowrap">
                    Min strength
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={confidenceMin * 100}
                    onChange={(e) =>
                      setConfidenceMin(Number(e.target.value) / 100)
                    }
                    className="w-20 h-1 accent-accent"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono w-8">
                    {confidenceMin.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Graph View */}
            {viewMode === "graph" && (
              <CausalGraph edges={filteredEdges} domainFilter={domainFilter} />
            )}

            {/* Edge list */}
            {viewMode === "list" && filteredEdges.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="w-10 h-10 text-muted/30 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <p className="text-sm text-muted">
                  No causal edges match the current filters
                </p>
                <p className="text-xs text-muted/60 mt-1">
                  Try adjusting the domain or confidence threshold
                </p>
              </div>
            ) : viewMode === "list" ? (
              <div className="space-y-2">
                {filteredEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className="group flex items-center gap-4 px-4 py-3 rounded-lg bg-surface/50 border border-border/30 hover:border-accent/20 hover:bg-surface-hover transition-all"
                  >
                    {/* Source -> Target */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium truncate">
                          {edge.source_entity}
                        </span>
                        <svg
                          className="w-4 h-4 text-muted shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                          />
                        </svg>
                        <span className="font-medium truncate">
                          {edge.target_entity}
                        </span>
                      </div>
                      {edge.domain && (
                        <span className="text-[10px] text-muted uppercase tracking-wider">
                          {edge.domain}
                        </span>
                      )}
                    </div>

                    {/* Strength bar */}
                    <div className="w-28 shrink-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-muted">Strength</span>
                        <span
                          className={cn(
                            "text-xs font-mono font-medium",
                            strengthLabel(edge.strength)
                          )}
                        >
                          {edge.strength?.toFixed(3)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            strengthColor(edge.strength)
                          )}
                          style={{ width: `${(edge.strength ?? 0) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* p-value */}
                    <div className="text-right shrink-0 w-20">
                      <div className="text-[10px] text-muted">p-value</div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {edge.p_value?.toFixed(4)}
                      </div>
                    </div>

                    {/* Lag */}
                    <div className="text-right shrink-0 w-14">
                      <div className="text-[10px] text-muted">Lag</div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {edge.lag_periods}p
                      </div>
                    </div>

                    {/* Method */}
                    <div className="shrink-0 w-20">
                      <div className="text-[10px] text-muted">Method</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {edge.method}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Recent Discoveries */}
          {snapshot?.top_discoveries && snapshot.top_discoveries.length > 0 && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <h3 className="text-sm font-semibold mb-4">Recent Discoveries</h3>
              <div className="space-y-3">
                {snapshot.top_discoveries.map((discovery, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 rounded-lg bg-surface/50 border border-border/30"
                  >
                    <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs text-accent font-medium">
                        {i + 1}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {discovery}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: Brain Regions */}
        <div className="space-y-6">
          {/* Brain Regions Status */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h3 className="text-sm font-semibold mb-1">Brain Regions</h3>
            <p className="text-xs text-muted mb-4">
              {activeRegions.length} of {ALL_REGIONS.length} active
            </p>

            <div className="space-y-2">
              {ALL_REGIONS.map((region) => {
                const isActive = activeRegions.includes(region);
                return (
                  <div
                    key={region}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50"
                  >
                    <span
                      className={cn(
                        "text-sm capitalize",
                        isActive ? "text-foreground" : "text-muted"
                      )}
                    >
                      {region}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full",
                        isActive
                          ? "bg-success/15 text-success"
                          : "bg-surface text-muted/60"
                      )}
                    >
                      {isActive ? "active" : "sleeping"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Brain Health Summary */}
          {snapshot && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <h3 className="text-sm font-semibold mb-3">Brain Health</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted">Health Score</span>
                    <span className="text-xs font-mono font-medium text-foreground">
                      {snapshot.brain_health_score ?? "N/A"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{
                        width: `${snapshot.brain_health_score ?? 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Prediction Accuracy</span>
                  <span className="font-mono text-foreground">
                    {snapshot.prediction_accuracy?.toFixed(1) ?? "N/A"}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Total Signals</span>
                  <span className="font-mono text-foreground">
                    {snapshot.total_signals?.toLocaleString() ?? "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Causal Edges</span>
                  <span className="font-mono text-foreground">
                    {snapshot.total_causal_edges?.toLocaleString() ?? "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Snapshot Date</span>
                  <span className="font-mono text-foreground">
                    {snapshot.snapshot_date}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Entity Count */}
          {entities.length > 0 && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <h3 className="text-sm font-semibold mb-3">Resolved Entities</h3>
              <div className="space-y-1.5">
                {entities.slice(0, 10).map((entity) => (
                  <div
                    key={entity.id}
                    className="flex items-center justify-between px-2 py-1.5 text-xs"
                  >
                    <span className="text-foreground truncate max-w-[140px]">
                      {entity.canonical_name}
                    </span>
                    <span className="text-muted uppercase text-[10px]">
                      {entity.entity_type}
                    </span>
                  </div>
                ))}
                {entities.length > 10 && (
                  <p className="text-[10px] text-muted text-center pt-1">
                    +{entities.length - 10} more entities
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
