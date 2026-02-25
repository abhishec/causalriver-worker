"use client";

import { useState, useMemo, useCallback } from "react";
import { cn, timeAgo } from "@/lib/utils";
import { CausalGraph } from "@/components/dashboard/CausalGraph";
import { BrainContextSidebar } from "@/components/brain/BrainContextSidebar";
import { NodeDetailPanel } from "@/components/brain/NodeDetailPanel";
import { EdgeDetailPanel } from "@/components/brain/EdgeDetailPanel";
import { SignalTimeline } from "@/components/brain/SignalTimeline";
import { CausalLagChart } from "@/components/brain/CausalLagChart";
import { TabGroup } from "@/components/ui/TabGroup";
import { Badge, DomainTag } from "@/components/ui/Badge";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { StatusDot } from "@/components/ui/StatusDot";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { EmptyState } from "@/components/ui/EmptyState";

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
  natural_language?: string;
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

interface DiscoveryEntry {
  id: string;
  source_entity: string;
  target_entity: string;
  strength: number;
  p_value: number;
  statistical_method: string;
  confidence_score: number;
  lag_days: number;
  source_domain: string;
  target_domain: string;
  created_at: string;
}

interface LayerHealthEntry {
  layer_id: string;
  layer_name: string;
  health_score: number;
  requests_processed: number;
  errors: number;
  latency_p50: number;
  created_at: string;
}

interface SignalEntry {
  id: string;
  domain: string;
  source_type: string;
  created_at: string;
}

interface BrainClientProps {
  causalEdges: CausalEdge[];
  entities: Entity[];
  snapshot: Snapshot | null;
  discoveryTimeline?: DiscoveryEntry[];
  layerHealth?: LayerHealthEntry[];
  signals?: SignalEntry[];
}

/* -------------------------------------------------------------------------- */
/*  Layers Data (absorbed from /layers page)                                   */
/* -------------------------------------------------------------------------- */

const LAYERS = [
  { id: "L1", name: "Ingestion", desc: "16 connectors, webhooks + cron, sync manager", gradient: "from-cyan-500 to-blue-500", star: false },
  { id: "L2", name: "Entity Resolution", desc: "3-tier matching (exact → fuzzy → create)", gradient: "from-blue-500 to-indigo-500", star: false },
  { id: "L3", name: "Semantic Memory", desc: "Dual-mode embeddings, memory-weighted RAG", gradient: "from-indigo-500 to-violet-500", star: false },
  { id: "L4", name: "Causal Engine", desc: "3-paradigm discovery with Bayesian judge", gradient: "from-violet-500 to-purple-500", star: true },
  { id: "L5", name: "Pattern Memory", desc: "Association mining, anomaly detection, 118 packs", gradient: "from-purple-500 to-fuchsia-500", star: false },
  { id: "L6", name: "Domain Agents", desc: "12+ personas, cascade alert pipeline", gradient: "from-fuchsia-500 to-pink-500", star: false },
  { id: "L7", name: "Intelligence Interface", desc: "Multi-turn LLM, proactive alerts", gradient: "from-pink-500 to-rose-500", star: false },
  { id: "L8", name: "Causal Imagination", desc: "Counterfactual scenario generation", gradient: "from-rose-500 to-orange-500", star: false },
  { id: "L9", name: "Theory of Mind", desc: "User intent modeling, cognitive tracking", gradient: "from-orange-500 to-amber-500", star: false },
  { id: "L10", name: "Temporal Consciousness", desc: "Rhythm detection, goal tracking", gradient: "from-amber-500 to-yellow-500", star: false },
  { id: "L11", name: "Red Team", desc: "Adversarial prediction testing", gradient: "from-red-500 to-rose-600", star: false },
  { id: "L12", name: "Experimentation", desc: "A/B test design, intervention proposals", gradient: "from-emerald-500 to-teal-500", star: false },
  { id: "L13", name: "Immune System", desc: "Signal quality validation, quarantine", gradient: "from-teal-500 to-cyan-500", star: false },
  { id: "L14", name: "Goal Planning", desc: "Goal-backward causal planning", gradient: "from-sky-500 to-blue-600", star: false },
  { id: "L15", name: "Narrative Intelligence", desc: "Executive briefings, storylines", gradient: "from-blue-600 to-indigo-600", star: false },
  { id: "L16", name: "Meta-Learning", desc: "Learning-rate adaptation, strategy selection", gradient: "from-indigo-600 to-violet-600", star: false },
  { id: "L17", name: "Transfer Learning", desc: "Cross-domain knowledge transfer, analogy engine", gradient: "from-violet-600 to-purple-600", star: false },
  { id: "L18", name: "Confidence Calibration", desc: "Prediction confidence scoring, Brier calibration", gradient: "from-purple-600 to-fuchsia-600", star: false },
  { id: "L19", name: "Attention Allocation", desc: "Dynamic resource prioritization, signal triage", gradient: "from-fuchsia-600 to-pink-600", star: false },
  { id: "L20", name: "Contradiction Detection", desc: "Cross-signal consistency checks, conflict resolution", gradient: "from-pink-600 to-rose-600", star: true },
  { id: "L21", name: "Hypothesis Generation", desc: "Abductive reasoning, root-cause proposals", gradient: "from-rose-600 to-red-600", star: false },
  { id: "L22", name: "Feedback Integration", desc: "RL reward shaping, human-in-the-loop learning", gradient: "from-red-600 to-orange-600", star: false },
  { id: "L23", name: "Drift Detection", desc: "Concept drift monitoring, distribution shift alerts", gradient: "from-orange-600 to-amber-600", star: false },
  { id: "L24", name: "Multi-Scale Reasoning", desc: "Micro/macro pattern synthesis, zoom levels", gradient: "from-amber-600 to-yellow-600", star: false },
  { id: "L25", name: "Episodic Replay", desc: "Experience replay buffer, scenario re-simulation", gradient: "from-yellow-600 to-lime-600", star: false },
  { id: "L26", name: "Skill Composition", desc: "Atomic skill chaining, workflow synthesis", gradient: "from-lime-600 to-green-600", star: false },
  { id: "L27", name: "Value Alignment", desc: "Objective function alignment, guardrail enforcement", gradient: "from-green-600 to-emerald-600", star: false },
  { id: "L28", name: "Emergent Abstraction", desc: "Auto-taxonomy, concept crystallization", gradient: "from-emerald-600 to-teal-600", star: false },
  { id: "L29", name: "Self-Evaluation", desc: "Performance introspection, capability assessment", gradient: "from-teal-600 to-cyan-600", star: false },
  { id: "L30", name: "Collective Intelligence", desc: "Multi-agent consensus, swarm optimization", gradient: "from-cyan-600 to-blue-600", star: true },
];

/* -------------------------------------------------------------------------- */
/*  Regions Data (absorbed from /regions page)                                 */
/* -------------------------------------------------------------------------- */

const REGIONS = [
  { name: "Causal Reasoning", category: "Real-time", status: "active" as const, color: "text-info" },
  { name: "Impact Scoring", category: "Real-time", status: "active" as const, color: "text-info" },
  { name: "Simulator", category: "Real-time", status: "active" as const, color: "text-info" },
  { name: "Muscle Memory", category: "Sleep cycle", status: "active" as const, color: "text-brain-training" },
  { name: "Memory Formation", category: "Sleep cycle", status: "active" as const, color: "text-brain-training" },
  { name: "Dreaming (DMN)", category: "Sleep cycle", status: "sleeping" as const, color: "text-brain-training" },
  { name: "Anomaly Sense", category: "Self-monitoring", status: "active" as const, color: "text-warning" },
  { name: "Meta-Cognition", category: "Self-monitoring", status: "active" as const, color: "text-warning" },
  { name: "Learned Attention", category: "Active learning", status: "active" as const, color: "text-success" },
  { name: "Active Explorer", category: "Active learning", status: "active" as const, color: "text-success" },
  { name: "Perception", category: "Perception", status: "active" as const, color: "text-cyan-400" },
  { name: "Deep Dreaming", category: "Cognitive Stack", status: "sleeping" as const, color: "text-rose-400" },
  { name: "Hierarchical Memory", category: "Cognitive Stack", status: "sleeping" as const, color: "text-rose-400" },
  { name: "Curiosity Engine", category: "Cognitive Stack", status: "sleeping" as const, color: "text-rose-400" },
  { name: "Self-Modifying Cognition", category: "Cognitive Stack", status: "sleeping" as const, color: "text-rose-400" },
  { name: "Intelligence Mesh", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Causal Imagination", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Theory of Mind", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Temporal Consciousness", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Red Team", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Experimentation", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Immune System", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Goal Planning", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
  { name: "Narrative Intelligence", category: "Cognitive Stack", status: "sleeping" as const, color: "text-orange-400" },
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

export function BrainClient({ causalEdges, entities, snapshot, discoveryTimeline = [], layerHealth = [], signals = [] }: BrainClientProps) {
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [confidenceMin, setConfidenceMin] = useState<number>(0);
  const [entitySearch, setEntitySearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState("graph");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CausalEdge | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [timelineDateRange, setTimelineDateRange] = useState("30d");

  // Extract unique domains from edges
  const domains = useMemo(() => {
    const set = new Set<string>();
    causalEdges.forEach((e) => { if (e.domain) set.add(e.domain); });
    return Array.from(set).sort();
  }, [causalEdges]);

  // Filter edges
  const filteredEdges = useMemo(() => {
    return causalEdges.filter((edge) => {
      if (domainFilter !== "all" && edge.domain !== domainFilter) return false;
      if (edge.strength < confidenceMin) return false;
      if (entitySearch) {
        const q = entitySearch.toLowerCase();
        if (!edge.source_entity.toLowerCase().includes(q) && !edge.target_entity.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [causalEdges, domainFilter, confidenceMin, entitySearch]);

  const activeRegions = snapshot?.regions_active || [];

  // Handlers
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEdge(null);
    setRightPanelOpen(true);
  }, []);

  const handleEdgeClick = useCallback((edge: CausalEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setRightPanelOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setRightPanelOpen(false);
  }, []);

  // Find entity for selected node
  const selectedEntity = selectedNode
    ? entities.find((e) => e.canonical_name === selectedNode) || null
    : null;

  // Connected edges for selected node
  const connectedEdges = selectedNode
    ? causalEdges.filter((e) => e.source_entity === selectedNode || e.target_entity === selectedNode)
    : [];

  const tabs = [
    { id: "graph", label: "Knowledge Graph", count: filteredEdges.length },
    { id: "list", label: "Edge List" },
    { id: "timeline", label: "Timeline", count: signals.length > 0 ? signals.length : undefined },
    { id: "discoveries", label: "Discoveries", count: discoveryTimeline.length },
    { id: "layers", label: "Layers", count: LAYERS.length },
    { id: "regions", label: "Regions", count: REGIONS.filter((r) => r.status === "active").length },
  ];

  return (
    <div className="space-y-4">
      {/* Header with Brain Health */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Brain Explorer</h1>
            <p className="text-xs text-muted mt-0.5">Knowledge atlas — causal graph, layers, and regions</p>
          </div>
          {snapshot && (
            <ProgressRing
              value={snapshot.brain_health_score || 0}
              size={44}
              strokeWidth={3}
              color="accent"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="accent" size="sm">{causalEdges.length} edges</Badge>
          <Badge variant="default" size="sm">{entities.length} entities</Badge>
          {snapshot && (
            <Badge variant="default" size="sm">
              {snapshot.regions_active?.length || 0} regions
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      {/* Three-panel layout for graph/list views */}
      {(activeTab === "graph" || activeTab === "list") && (
        <div className="flex gap-4">
          {/* Left Panel: Context Sidebar */}
          {leftPanelOpen && (
            <div className="w-64 shrink-0">
              <div className="sticky top-20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Filters</h3>
                  <button
                    onClick={() => setLeftPanelOpen(false)}
                    className="p-0.5 rounded hover:bg-surface-hover text-muted"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                    </svg>
                  </button>
                </div>
                <BrainContextSidebar
                  domains={domains}
                  domainFilter={domainFilter}
                  onDomainFilterChange={setDomainFilter}
                  confidenceMin={confidenceMin}
                  onConfidenceChange={setConfidenceMin}
                  entitySearch={entitySearch}
                  onEntitySearchChange={setEntitySearch}
                  activeRegions={activeRegions}
                  totalEdges={filteredEdges.length}
                  totalEntities={entities.length}
                />
              </div>
            </div>
          )}

          {/* Center Panel: Graph or List */}
          <div className="flex-1 min-w-0">
            {/* Collapsed sidebar toggle */}
            {!leftPanelOpen && (
              <button
                onClick={() => setLeftPanelOpen(true)}
                className="mb-3 p-1.5 rounded-lg bg-surface border border-border-subtle hover:bg-surface-hover text-muted transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            )}

            {activeTab === "graph" && (
              <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
                <CausalGraph
                  edges={filteredEdges}
                  domainFilter={domainFilter}
                  onNodeClick={handleNodeClick}
                  onEdgeClick={handleEdgeClick}
                />
              </div>
            )}

            {activeTab === "list" && (
              <div className="space-y-2">
                {filteredEdges.length === 0 ? (
                  <EmptyState
                    variant="card"
                    icon={
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                      </svg>
                    }
                    title="No edges match your filters"
                    description="Try adjusting the domain filter or lowering the confidence threshold to see more causal relationships."
                    action={{ label: "Reset Filters", onClick: () => { setDomainFilter("all"); setConfidenceMin(0); setEntitySearch(""); } }}
                  />
                ) : (
                  filteredEdges.map((edge) => (
                    <button
                      key={edge.id}
                      onClick={() => handleEdgeClick(edge)}
                      className="w-full group flex items-center gap-4 px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-accent/20 hover:bg-card-hover transition-all text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium truncate">{edge.source_entity}</span>
                          <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                          </svg>
                          <span className="font-medium truncate">{edge.target_entity}</span>
                        </div>
                        {edge.domain && <DomainTag domain={edge.domain} className="mt-1" />}
                        {edge.natural_language && (
                          <p className="text-[10px] text-muted mt-1 line-clamp-1">{edge.natural_language}</p>
                        )}
                      </div>
                      <div className="w-24 shrink-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-muted">Strength</span>
                          <span className={cn("text-xs font-mono font-medium", strengthLabel(edge.strength))}>
                            {edge.strength?.toFixed(3)}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-surface overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", strengthColor(edge.strength))}
                            style={{ width: `${(edge.strength ?? 0) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <div className="text-[10px] text-muted">Significance</div>
                        <div className={cn(
                          "text-xs font-medium",
                          edge.p_value < 0.01 ? "text-success" : edge.p_value < 0.05 ? "text-info" : "text-warning"
                        )}>
                          {edge.p_value < 0.001 ? "Very high" : edge.p_value < 0.01 ? "High" : edge.p_value < 0.05 ? "Good" : "Low"}
                        </div>
                      </div>
                      <div className="shrink-0 w-14 text-right">
                        <div className="text-[10px] text-muted">Time Lag</div>
                        <div className="text-xs text-muted-foreground">{edge.lag_periods === 0 ? "Same day" : edge.lag_periods === 1 ? "1 day" : `${edge.lag_periods} days`}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Detail */}
          {rightPanelOpen && (
            <div className="w-72 shrink-0">
              <div className="sticky top-20 rounded-xl bg-card border border-border-subtle p-4">
                {selectedNode && (
                  <NodeDetailPanel
                    nodeId={selectedNode}
                    entity={selectedEntity}
                    connectedEdges={connectedEdges}
                    onEdgeClick={handleEdgeClick}
                    onClose={handleCloseDetail}
                  />
                )}
                {selectedEdge && (
                  <EdgeDetailPanel
                    edge={selectedEdge}
                    onClose={handleCloseDetail}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline Tab — Signal Activity + Causal Lag */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          <SignalTimeline
            signals={signals}
            dateRange={timelineDateRange}
            onDateRangeChange={setTimelineDateRange}
          />
          <CausalLagChart
            edges={filteredEdges}
            onEdgeClick={handleEdgeClick}
          />
        </div>
      )}

      {/* Discoveries Tab — Timeline replay of causal discoveries */}
      {activeTab === "discoveries" && (
        <div className="space-y-1">
          {discoveryTimeline.length === 0 ? (
            <EmptyState
              variant="card"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              }
              title="No discoveries yet"
              description="The brain will surface causal relationships as it ingests signals and runs statistical analysis across your connected data sources."
            />
          ) : (
            discoveryTimeline.map((disc, idx) => (
              <div key={disc.id} className="group relative pl-8 pb-4 last:pb-0">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border-subtle group-last:hidden" />
                {/* Timeline dot */}
                <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-brain-discovery/10 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-brain-discovery" />
                </div>
                {/* Card */}
                <div className="rounded-xl bg-card border border-border-subtle p-4 hover:bg-card-hover transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {disc.source_domain && <DomainTag domain={disc.source_domain} />}
                      {disc.target_domain && disc.target_domain !== disc.source_domain && (
                        <>
                          <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                          </svg>
                          <DomainTag domain={disc.target_domain} />
                        </>
                      )}
                      <Badge variant="default" size="xs">{disc.statistical_method || "unknown"}</Badge>
                    </div>
                    <span className="text-[10px] text-muted whitespace-nowrap tabular-nums">{timeAgo(disc.created_at)}</span>
                  </div>
                  <h4 className="text-sm font-medium mb-1">
                    {disc.source_entity} → {disc.target_entity}
                  </h4>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-muted">
                    <span className="tabular-nums">
                      Strength: <span className={strengthLabel(disc.strength)}>{disc.strength?.toFixed(3)}</span>
                    </span>
                    <span className="tabular-nums">p: {disc.p_value?.toFixed(4)}</span>
                    {disc.lag_days > 0 && <span className="tabular-nums">{disc.lag_days}d lag</span>}
                    {disc.confidence_score > 0 && (
                      <span className="tabular-nums">Confidence: {(disc.confidence_score * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Layers Tab — with live health scores */}
      {activeTab === "layers" && (
        <div className="space-y-2">
          {LAYERS.map((layer) => {
            const health = layerHealth.find((lh) => lh.layer_id === layer.id);
            return (
            <div
              key={layer.id}
              className="flex items-center gap-4 px-5 py-4 rounded-xl bg-card border border-border-subtle hover:bg-card-hover transition-colors"
            >
              <div className={`h-10 w-1 rounded-full bg-gradient-to-b ${layer.gradient} shrink-0`} />
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-xs font-bold text-muted shrink-0">
                {layer.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">{layer.name}</h3>
                  {layer.star && (
                    <Badge variant="accent" size="xs">core</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{layer.desc}</p>
              </div>
              {health ? (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-xs font-mono tabular-nums">{health.health_score}%</div>
                    <div className="text-[9px] text-muted">{health.requests_processed || 0} req</div>
                  </div>
                  <StatusDot
                    type={health.health_score >= 90 ? "active" : health.health_score >= 70 ? "warning" : "error"}
                    size="sm"
                    pulse={health.health_score >= 90}
                  />
                </div>
              ) : (
                <StatusDot type="active" size="sm" pulse />
              )}
            </div>
          );
          })}
        </div>
      )}

      {/* Regions Tab */}
      {activeTab === "regions" && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-card border border-border-subtle p-4 text-center">
              <div className="text-2xl font-semibold">{REGIONS.length}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Total</div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-4 text-center">
              <div className="text-2xl font-semibold text-success">{REGIONS.filter((r) => r.status === "active").length}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Active</div>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle p-4 text-center">
              <div className="text-2xl font-semibold text-brain-training">{REGIONS.filter((r) => r.status === "sleeping").length}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Sleeping</div>
            </div>
          </div>

          {/* Regions by category */}
          {[...new Set(REGIONS.map((r) => r.category))].map((category) => {
            const group = REGIONS.filter((r) => r.category === category);
            const catColor = group[0]?.color || "text-muted";
            return (
              <div key={category}>
                <h3 className={cn("text-xs font-medium uppercase tracking-wider mb-2", catColor)}>{category}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {group.map((region) => (
                    <div
                      key={region.name}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle hover:bg-card-hover transition-colors"
                    >
                      <StatusDot
                        type={region.status === "active" ? "active" : "inactive"}
                        size="sm"
                        pulse={region.status === "active"}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium truncate">{region.name}</h4>
                      </div>
                      <span className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full",
                        region.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-surface text-muted"
                      )}>
                        {region.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
