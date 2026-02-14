"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  domain: string;
}

interface CascadeStep {
  entity: string;
  change: number;
  confidence: number;
  lagDays: number;
  domain: string;
}

interface SimulatorClientProps {
  entities: Entity[];
  domains: string[];
}

export function SimulatorClient({ entities, domains }: SimulatorClientProps) {
  const [selectedEntity, setSelectedEntity] = useState("");
  const [magnitude, setMagnitude] = useState(10);
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [timeHorizon, setTimeHorizon] = useState(90);
  const [selectedDomain, setSelectedDomain] = useState("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CascadeStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSimulate() {
    if (!selectedEntity) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: selectedEntity,
          magnitude: direction === "decrease" ? -magnitude : magnitude,
          timeHorizon,
          domain: selectedDomain === "all" ? null : selectedDomain,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Simulation failed");
      setResults(data.cascade || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Fallback: generate mock cascade for demo
      setResults(generateMockCascade(selectedEntity, direction === "decrease" ? -magnitude : magnitude));
    } finally {
      setLoading(false);
    }
  }

  function generateMockCascade(entity: string, change: number): CascadeStep[] {
    const mockSteps: CascadeStep[] = [
      { entity, change, confidence: 1.0, lagDays: 0, domain: "input" },
      { entity: "lead_volume", change: change * 0.6, confidence: 0.85, lagDays: 14, domain: "marketing" },
      { entity: "pipeline_value", change: change * 0.4, confidence: 0.72, lagDays: 30, domain: "sales" },
      { entity: "monthly_revenue", change: change * 0.25, confidence: 0.58, lagDays: 60, domain: "financial" },
      { entity: "customer_satisfaction", change: change * 0.15, confidence: 0.45, lagDays: 45, domain: "customer" },
    ];
    return mockSteps;
  }

  const totalImpact = results?.reduce((sum, r) => sum + Math.abs(r.change), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">What-If Simulator</h1>
        <p className="text-muted text-sm mt-1">
          Simulate causal cascades — see how changes propagate through your business
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="rounded-xl bg-card border border-border/50 p-6 space-y-5">
          <h2 className="text-sm font-semibold">Scenario Builder</h2>

          {/* Entity picker */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">If this changes:</label>
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Select an entity...</option>
              {entities.map((e) => (
                <option key={e.id} value={e.canonical_name}>
                  {e.canonical_name} ({e.domain})
                </option>
              ))}
            </select>
          </div>

          {/* Direction + magnitude */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Direction</label>
              <div className="flex rounded-lg bg-surface border border-border/30 p-0.5">
                <button
                  onClick={() => setDirection("increase")}
                  className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", direction === "increase" ? "bg-success/20 text-success" : "text-muted")}
                >
                  + Increase
                </button>
                <button
                  onClick={() => setDirection("decrease")}
                  className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", direction === "decrease" ? "bg-danger/20 text-danger" : "text-muted")}
                >
                  - Decrease
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">By {magnitude}%</label>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={magnitude}
                onChange={(e) => setMagnitude(Number(e.target.value))}
                className="w-full h-2 accent-accent"
              />
            </div>
          </div>

          {/* Time horizon */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Time Horizon</label>
            <div className="flex gap-2">
              {[30, 60, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setTimeHorizon(days)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium border transition-colors",
                    timeHorizon === days ? "bg-accent/10 border-accent/30 text-accent" : "border-border text-muted hover:text-foreground"
                  )}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          {/* Domain scope */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Domain Scope</label>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="all">All domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">{error}</div>
          )}

          <button
            onClick={handleSimulate}
            disabled={loading || !selectedEntity}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Simulating..." : "Run Simulation"}
          </button>
        </div>

        {/* Results Panel */}
        <div className="rounded-xl bg-card border border-border/50 p-6">
          <h2 className="text-sm font-semibold mb-4">Cascade Results</h2>

          {!results ? (
            <div className="text-center py-16">
              <svg className="w-12 h-12 text-muted/20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-muted">Configure a scenario and hit simulate</p>
              <p className="text-xs text-muted/60 mt-1">The brain will model causal cascades</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cascade steps */}
              <div className="space-y-2">
                {results.map((step, i) => (
                  <div key={i} className="relative">
                    {i > 0 && (
                      <div className="absolute left-5 -top-2 w-px h-2 bg-border" />
                    )}
                    <div className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all",
                      i === 0 ? "bg-accent/5 border-accent/30" : "bg-surface/50 border-border/30"
                    )}>
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        step.change > 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                      )}>
                        {step.change > 0 ? "+" : ""}{step.change.toFixed(1)}%
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{step.entity}</div>
                        <div className="flex items-center gap-3 text-[10px] text-muted mt-0.5">
                          <span>{step.domain}</span>
                          <span>Confidence: {(step.confidence * 100).toFixed(0)}%</span>
                          {step.lagDays > 0 && <span>Lag: {step.lagDays}d</span>}
                        </div>
                      </div>
                      {/* Confidence bar */}
                      <div className="w-16 shrink-0">
                        <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${step.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="p-4 rounded-lg bg-surface border border-border/30">
                <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Impact Summary</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-lg font-bold text-foreground">{results.length}</div>
                    <div className="text-[10px] text-muted">Cascade steps</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">{totalImpact.toFixed(1)}%</div>
                    <div className="text-[10px] text-muted">Total impact</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-foreground">{timeHorizon}d</div>
                    <div className="text-[10px] text-muted">Time horizon</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
