"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CausalGraph } from "@/components/dashboard/CausalGraph";
import { BrainContextSidebar } from "@/components/brain/BrainContextSidebar";
import { NodeDetailPanel } from "@/components/brain/NodeDetailPanel";
import { EdgeDetailPanel } from "@/components/brain/EdgeDetailPanel";
import { TabGroup } from "@/components/ui/TabGroup";
import { Badge, DomainTag } from "@/components/ui/Badge";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { StatusDot } from "@/components/ui/StatusDot";

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

export function BrainClient({ causalEdges, entities, snapshot }: BrainClientProps) {
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [confidenceMin, setConfidenceMin] = useState<number>(0);
  const [entitySearch, setEntitySearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState("graph");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CausalEdge | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

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
    { id: "layers", label: "Layers", count: LAYERS.length },
    { id: "regions", label: "Regions", count: REGIONS.filter((r) => r.status === "active").length },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Brain Explorer</h1>
          <p className="text-xs text-muted mt-0.5">Knowledge atlas — causal graph, layers, and regions</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="accent" size="sm">{causalEdges.length} edges</Badge>
          <Badge variant="default" size="sm">{entities.length} entities</Badge>
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
                />
              </div>
            )}

            {activeTab === "list" && (
              <div className="space-y-2">
                {filteredEdges.length === 0 ? (
                  <div className="rounded-xl bg-card border border-border-subtle p-12 text-center">
                    <p className="text-sm text-muted">No edges match the current filters</p>
                    <p className="text-xs text-muted/60 mt-1">Try adjusting the domain or confidence threshold</p>
                  </div>
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
                      <div className="text-right shrink-0 w-16">
                        <div className="text-[10px] text-muted">p-value</div>
                        <div className="text-xs font-mono text-muted-foreground">{edge.p_value?.toFixed(4)}</div>
                      </div>
                      <div className="shrink-0 w-14 text-right">
                        <div className="text-[10px] text-muted">Lag</div>
                        <div className="text-xs font-mono text-muted-foreground">{edge.lag_periods}p</div>
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

      {/* Layers Tab */}
      {activeTab === "layers" && (
        <div className="space-y-2">
          {LAYERS.map((layer) => (
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
              <StatusDot type="active" size="sm" pulse />
            </div>
          ))}
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
