/**
 * Causal Graph Diffing Engine
 * ===========================
 *
 * Compares two causal graph snapshots and produces a structured diff
 * showing what changed: added/removed/modified edges and nodes,
 * strength changes, and natural language summaries.
 *
 * Used by: POST /api/brain/graph-diff
 *
 * Storage: causal_graph_snapshots table (graph_data JSONB column)
 * The consolidation engine stores pre/post snapshots — this module
 * compares any two snapshots to show how the brain's understanding evolved.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Serialized edge stored in causal_graph_snapshots.graph_data */
export interface SerializedEdge {
  source: string;
  target: string;
  effectSize: number;
  pValue: number;
  confidence: number;
  lagDays: number;
  isSignificant: boolean;
  fStatistic?: number;
  sampleSize?: number;
}

/** Snapshot structure stored in causal_graph_snapshots.graph_data */
export interface GraphSnapshot {
  edges: SerializedEdge[];
  nodes: string[];
  metadata: {
    edgeCount: number;
    nodeCount: number;
    significantEdgeCount: number;
    avgEffectSize: number;
    avgConfidence: number;
    capturedAt: string;
  };
}

/** Reference to a snapshot in the diff result */
export interface SnapshotRef {
  id: string;
  createdAt: string;
  snapshotType: string;
  edgeCount: number;
  nodeCount: number;
}

/** A newly added or removed edge */
export interface EdgeDiff {
  source: string;
  target: string;
  effectSize: number;
  pValue: number;
  confidence: number;
  lagDays: number;
  isSignificant: boolean;
}

/** A modified edge with before/after comparison */
export interface EdgeChange {
  source: string;
  target: string;
  before: { effectSize: number; pValue: number; confidence: number; lagDays: number };
  after: { effectSize: number; pValue: number; confidence: number; lagDays: number };
  delta: { effectSize: number; pValue: number; confidence: number; lagDays: number };
  changeType: 'strengthened' | 'weakened' | 'stabilized';
  /** 0-1 scale: how impactful is this change relative to others */
  impactScore: number;
}

/** Summary statistics of the diff */
export interface DiffStats {
  totalEdgesA: number;
  totalEdgesB: number;
  netEdgeChange: number;
  totalNodesA: number;
  totalNodesB: number;
  netNodeChange: number;
  significantChanges: number;
  strengthenedEdges: number;
  weakenedEdges: number;
  avgWeightDelta: number;
  maxWeightIncrease: number;
  maxWeightDecrease: number;
}

/** Full causal graph diff result */
export interface CausalGraphDiff {
  snapshotA: SnapshotRef;
  snapshotB: SnapshotRef;

  // Structural changes
  addedEdges: EdgeDiff[];
  removedEdges: EdgeDiff[];
  modifiedEdges: EdgeChange[];
  addedNodes: string[];
  removedNodes: string[];

  // Summary statistics
  stats: DiffStats;

  // Top changes ranked by impact
  topChanges: EdgeChange[];

  // Natural language summary
  summary: string;
}

/** Options for computing the diff */
export interface DiffOptions {
  /** Minimum absolute effectSize change to count as "modified" (default: 0.01) */
  minEffectSizeDelta?: number;
  /** Number of top changes to include (default: 10) */
  topChangesLimit?: number;
  /** Include only significant edges in the diff (default: false) */
  significantOnly?: boolean;
}

// ============================================================================
// CORE DIFF ALGORITHM
// ============================================================================

/**
 * Compute a structured diff between two causal graph snapshots.
 *
 * @param snapshotA  The "before" snapshot (older)
 * @param snapshotB  The "after" snapshot (newer)
 * @param refA       Metadata reference for snapshot A
 * @param refB       Metadata reference for snapshot B
 * @param options    Diff configuration
 */
export function computeGraphDiff(
  snapshotA: GraphSnapshot,
  snapshotB: GraphSnapshot,
  refA: SnapshotRef,
  refB: SnapshotRef,
  options: DiffOptions = {},
): CausalGraphDiff {
  const {
    minEffectSizeDelta = 0.01,
    topChangesLimit = 10,
    significantOnly = false,
  } = options;

  // Build edge lookup maps: "source→target" => edge
  const edgesA = buildEdgeMap(
    significantOnly ? snapshotA.edges.filter(e => e.isSignificant) : snapshotA.edges,
  );
  const edgesB = buildEdgeMap(
    significantOnly ? snapshotB.edges.filter(e => e.isSignificant) : snapshotB.edges,
  );

  // Compute node sets
  const nodesA = new Set(snapshotA.nodes);
  const nodesB = new Set(snapshotB.nodes);

  // ── Added edges: in B but not in A ─────────────────────────
  const addedEdges: EdgeDiff[] = [];
  for (const [key, edge] of edgesB) {
    if (!edgesA.has(key)) {
      addedEdges.push(serializeEdgeDiff(edge));
    }
  }

  // ── Removed edges: in A but not in B ───────────────────────
  const removedEdges: EdgeDiff[] = [];
  for (const [key, edge] of edgesA) {
    if (!edgesB.has(key)) {
      removedEdges.push(serializeEdgeDiff(edge));
    }
  }

  // ── Modified edges: in both but changed ────────────────────
  const modifiedEdges: EdgeChange[] = [];
  for (const [key, edgeA] of edgesA) {
    const edgeB = edgesB.get(key);
    if (!edgeB) continue;

    const deltaEffect = edgeB.effectSize - edgeA.effectSize;
    const deltaPValue = edgeB.pValue - edgeA.pValue;
    const deltaConf = edgeB.confidence - edgeA.confidence;
    const deltaLag = edgeB.lagDays - edgeA.lagDays;

    // Skip trivial changes
    if (Math.abs(deltaEffect) < minEffectSizeDelta && Math.abs(deltaConf) < minEffectSizeDelta) {
      continue;
    }

    const changeType: EdgeChange['changeType'] =
      deltaEffect > minEffectSizeDelta ? 'strengthened' :
      deltaEffect < -minEffectSizeDelta ? 'weakened' : 'stabilized';

    modifiedEdges.push({
      source: edgeA.source,
      target: edgeA.target,
      before: { effectSize: edgeA.effectSize, pValue: edgeA.pValue, confidence: edgeA.confidence, lagDays: edgeA.lagDays },
      after: { effectSize: edgeB.effectSize, pValue: edgeB.pValue, confidence: edgeB.confidence, lagDays: edgeB.lagDays },
      delta: { effectSize: deltaEffect, pValue: deltaPValue, confidence: deltaConf, lagDays: deltaLag },
      changeType,
      impactScore: 0, // Computed below
    });
  }

  // ── Compute impact scores ──────────────────────────────────
  if (modifiedEdges.length > 0) {
    const maxDelta = Math.max(...modifiedEdges.map(e => Math.abs(e.delta.effectSize)), 0.001);
    for (const change of modifiedEdges) {
      // Impact = weighted combination of effect size change + confidence change
      const effectImpact = Math.abs(change.delta.effectSize) / maxDelta;
      const confImpact = Math.abs(change.delta.confidence);
      change.impactScore = Math.min(1, effectImpact * 0.7 + confImpact * 0.3);
    }
  }

  // ── Node changes ───────────────────────────────────────────
  const addedNodes = [...nodesB].filter(n => !nodesA.has(n)).sort();
  const removedNodes = [...nodesA].filter(n => !nodesB.has(n)).sort();

  // ── Statistics ─────────────────────────────────────────────
  const strengthened = modifiedEdges.filter(e => e.changeType === 'strengthened');
  const weakened = modifiedEdges.filter(e => e.changeType === 'weakened');

  const weightDeltas = modifiedEdges.map(e => e.delta.effectSize);
  const avgWeightDelta = weightDeltas.length > 0
    ? weightDeltas.reduce((a, b) => a + b, 0) / weightDeltas.length
    : 0;

  const stats: DiffStats = {
    totalEdgesA: edgesA.size,
    totalEdgesB: edgesB.size,
    netEdgeChange: edgesB.size - edgesA.size,
    totalNodesA: nodesA.size,
    totalNodesB: nodesB.size,
    netNodeChange: nodesB.size - nodesA.size,
    significantChanges: addedEdges.length + removedEdges.length + modifiedEdges.length,
    strengthenedEdges: strengthened.length,
    weakenedEdges: weakened.length,
    avgWeightDelta: round4(avgWeightDelta),
    maxWeightIncrease: round4(Math.max(...strengthened.map(e => e.delta.effectSize), 0)),
    maxWeightDecrease: round4(Math.min(...weakened.map(e => e.delta.effectSize), 0)),
  };

  // ── Top changes (sorted by impact) ─────────────────────────
  const topChanges = [...modifiedEdges]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, topChangesLimit);

  // ── Natural language summary ───────────────────────────────
  const summary = generateDiffSummary(stats, addedEdges, removedEdges, topChanges, addedNodes, removedNodes);

  return {
    snapshotA: refA,
    snapshotB: refB,
    addedEdges: addedEdges.sort((a, b) => b.effectSize - a.effectSize),
    removedEdges: removedEdges.sort((a, b) => b.effectSize - a.effectSize),
    modifiedEdges,
    addedNodes,
    removedNodes,
    stats,
    topChanges,
    summary,
  };
}

// ============================================================================
// SNAPSHOT CAPTURE
// ============================================================================

/**
 * Capture the current causal graph as a snapshot for later diffing.
 *
 * @param supabase   Supabase client (service role)
 * @param orgId      Organization ID
 * @param type       Snapshot type: pre_consolidation, post_consolidation, manual
 * @param runId      Optional consolidation run ID
 * @returns The snapshot ID and captured data
 */
export async function captureGraphSnapshot(
  supabase: { from: (table: string) => any },
  orgId: string,
  type: 'pre_consolidation' | 'post_consolidation' | 'manual' = 'manual',
  runId?: string,
): Promise<{ id: string; snapshot: GraphSnapshot }> {
  // Fetch current causal edges
  const { data: edges } = await supabase
    .from('causal_relationships_statistical')
    .select('source_domain, target_domain, effect_size, granger_p_value, evidence_weight, optimal_lag_days, is_significant, granger_f_statistic, sample_size')
    .eq('organization_id', orgId)
    .order('effect_size', { ascending: false });

  const serializedEdges: SerializedEdge[] = (edges || []).map((e: any) => ({
    source: e.source_domain,
    target: e.target_domain,
    effectSize: e.effect_size ?? 0,
    pValue: e.granger_p_value ?? 1,
    confidence: e.evidence_weight ?? 0,
    lagDays: e.optimal_lag_days ?? 7,
    isSignificant: e.is_significant ?? false,
    fStatistic: e.granger_f_statistic ?? 0,
    sampleSize: e.sample_size ?? 0,
  }));

  // Compute node set from edges
  const nodeSet = new Set<string>();
  for (const e of serializedEdges) {
    nodeSet.add(e.source);
    nodeSet.add(e.target);
  }
  const nodes = [...nodeSet].sort();

  const significantEdges = serializedEdges.filter(e => e.isSignificant);
  const avgEffect = serializedEdges.length > 0
    ? serializedEdges.reduce((s, e) => s + e.effectSize, 0) / serializedEdges.length
    : 0;
  const avgConf = serializedEdges.length > 0
    ? serializedEdges.reduce((s, e) => s + e.confidence, 0) / serializedEdges.length
    : 0;

  const snapshot: GraphSnapshot = {
    edges: serializedEdges,
    nodes,
    metadata: {
      edgeCount: serializedEdges.length,
      nodeCount: nodes.length,
      significantEdgeCount: significantEdges.length,
      avgEffectSize: round4(avgEffect),
      avgConfidence: round4(avgConf),
      capturedAt: new Date().toISOString(),
    },
  };

  // Persist to causal_graph_snapshots
  const id = crypto.randomUUID();
  const insertData: Record<string, unknown> = {
    id,
    organization_id: orgId,
    snapshot_type: type,
    node_count: nodes.length,
    edge_count: serializedEdges.length,
    significant_edge_count: significantEdges.length,
    avg_evidence_weight: round4(avgConf),
    graph_data: snapshot,
    metadata: {
      avg_effect_size: round4(avgEffect),
      captured_by: 'causal-graph-diff',
    },
  };

  if (runId) {
    insertData.consolidation_run_id = runId;
  }

  const { error } = await supabase
    .from('causal_graph_snapshots')
    .insert(insertData);

  if (error) {
    console.warn('[CausalGraphDiff] Snapshot persistence non-fatal:', error.message);
  }

  return { id, snapshot };
}

// ============================================================================
// DIFF FROM DATABASE
// ============================================================================

/**
 * Compute a diff between two stored snapshots by ID.
 */
export async function diffSnapshotsById(
  supabase: { from: (table: string) => any },
  orgId: string,
  snapshotIdA: string,
  snapshotIdB: string,
  options?: DiffOptions,
): Promise<CausalGraphDiff> {
  const { data: rows, error } = await supabase
    .from('causal_graph_snapshots')
    .select('id, organization_id, snapshot_type, node_count, edge_count, significant_edge_count, graph_data, created_at')
    .eq('organization_id', orgId)
    .in('id', [snapshotIdA, snapshotIdB]);

  if (error) throw new Error(`Failed to fetch snapshots: ${error.message}`);
  if (!rows || rows.length < 2) throw new Error('One or both snapshots not found');

  const rowA = rows.find((r: any) => r.id === snapshotIdA);
  const rowB = rows.find((r: any) => r.id === snapshotIdB);
  if (!rowA || !rowB) throw new Error('Snapshot ID mismatch');

  return computeGraphDiff(
    rowA.graph_data as GraphSnapshot,
    rowB.graph_data as GraphSnapshot,
    toSnapshotRef(rowA),
    toSnapshotRef(rowB),
    options,
  );
}

/**
 * Compute a diff between the current live graph and the most recent snapshot.
 * Useful for "what changed since last consolidation?" queries.
 */
export async function diffCurrentVsSnapshot(
  supabase: { from: (table: string) => any },
  orgId: string,
  snapshotId?: string,
  options?: DiffOptions,
): Promise<CausalGraphDiff> {
  // Capture current state
  const { id: currentId, snapshot: currentSnapshot } = await captureGraphSnapshot(
    supabase, orgId, 'manual',
  );

  // Find the comparison snapshot
  let compareRow: any;
  if (snapshotId) {
    const { data } = await supabase
      .from('causal_graph_snapshots')
      .select('id, organization_id, snapshot_type, node_count, edge_count, significant_edge_count, graph_data, created_at')
      .eq('organization_id', orgId)
      .eq('id', snapshotId)
      .single();
    compareRow = data;
  } else {
    // Get most recent non-manual snapshot
    const { data } = await supabase
      .from('causal_graph_snapshots')
      .select('id, organization_id, snapshot_type, node_count, edge_count, significant_edge_count, graph_data, created_at')
      .eq('organization_id', orgId)
      .neq('id', currentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    compareRow = data;
  }

  if (!compareRow) {
    throw new Error('No previous snapshot found for comparison');
  }

  return computeGraphDiff(
    compareRow.graph_data as GraphSnapshot,
    currentSnapshot,
    toSnapshotRef(compareRow),
    {
      id: currentId,
      createdAt: new Date().toISOString(),
      snapshotType: 'manual',
      edgeCount: currentSnapshot.metadata.edgeCount,
      nodeCount: currentSnapshot.metadata.nodeCount,
    },
    options,
  );
}

/**
 * Compute a diff between the current graph and a graph from N days ago.
 * If no snapshot exists from that period, uses the closest available one.
 */
export async function diffByTimePeriod(
  supabase: { from: (table: string) => any },
  orgId: string,
  periodDays: number,
  options?: DiffOptions,
): Promise<CausalGraphDiff> {
  const targetDate = new Date(Date.now() - periodDays * 24 * 3600_000).toISOString();

  // Find closest snapshot to the target date
  const { data: oldSnapshot } = await supabase
    .from('causal_graph_snapshots')
    .select('id, organization_id, snapshot_type, node_count, edge_count, significant_edge_count, graph_data, created_at')
    .eq('organization_id', orgId)
    .lte('created_at', targetDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!oldSnapshot) {
    // Try finding the oldest available snapshot
    const { data: oldest } = await supabase
      .from('causal_graph_snapshots')
      .select('id, organization_id, snapshot_type, node_count, edge_count, significant_edge_count, graph_data, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!oldest) {
      throw new Error(`No snapshots available for organization. Capture a baseline first.`);
    }

    return diffCurrentVsSnapshot(supabase, orgId, oldest.id, options);
  }

  return diffCurrentVsSnapshot(supabase, orgId, oldSnapshot.id, options);
}

/**
 * List available snapshots for an organization (for the UI picker).
 */
export async function listSnapshots(
  supabase: { from: (table: string) => any },
  orgId: string,
  limit = 50,
): Promise<Array<SnapshotRef & { significantEdgeCount: number; avgEvidenceWeight: number }>> {
  const { data, error } = await supabase
    .from('causal_graph_snapshots')
    .select('id, snapshot_type, node_count, edge_count, significant_edge_count, avg_evidence_weight, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list snapshots: ${error.message}`);

  return (data || []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    snapshotType: row.snapshot_type,
    edgeCount: row.edge_count,
    nodeCount: row.node_count,
    significantEdgeCount: row.significant_edge_count,
    avgEvidenceWeight: row.avg_evidence_weight,
  }));
}

// ============================================================================
// HELPERS
// ============================================================================

function buildEdgeMap(edges: SerializedEdge[]): Map<string, SerializedEdge> {
  const map = new Map<string, SerializedEdge>();
  for (const edge of edges) {
    map.set(`${edge.source}→${edge.target}`, edge);
  }
  return map;
}

function serializeEdgeDiff(edge: SerializedEdge): EdgeDiff {
  return {
    source: edge.source,
    target: edge.target,
    effectSize: edge.effectSize,
    pValue: edge.pValue,
    confidence: edge.confidence,
    lagDays: edge.lagDays,
    isSignificant: edge.isSignificant,
  };
}

function toSnapshotRef(row: any): SnapshotRef {
  return {
    id: row.id,
    createdAt: row.created_at,
    snapshotType: row.snapshot_type,
    edgeCount: row.edge_count,
    nodeCount: row.node_count,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function generateDiffSummary(
  stats: DiffStats,
  added: EdgeDiff[],
  removed: EdgeDiff[],
  topChanges: EdgeChange[],
  addedNodes: string[],
  removedNodes: string[],
): string {
  const parts: string[] = [];

  // Edge count headline
  if (stats.netEdgeChange > 0) {
    parts.push(`Graph grew by ${stats.netEdgeChange} edge${stats.netEdgeChange !== 1 ? 's' : ''} (${stats.totalEdgesA} → ${stats.totalEdgesB}).`);
  } else if (stats.netEdgeChange < 0) {
    parts.push(`Graph pruned ${Math.abs(stats.netEdgeChange)} edge${Math.abs(stats.netEdgeChange) !== 1 ? 's' : ''} (${stats.totalEdgesA} → ${stats.totalEdgesB}).`);
  } else {
    parts.push(`Graph maintained ${stats.totalEdgesB} edges.`);
  }

  // Node changes
  if (addedNodes.length > 0) {
    parts.push(`New domains discovered: ${addedNodes.slice(0, 5).join(', ')}${addedNodes.length > 5 ? ` (+${addedNodes.length - 5} more)` : ''}.`);
  }
  if (removedNodes.length > 0) {
    parts.push(`Domains removed: ${removedNodes.slice(0, 5).join(', ')}${removedNodes.length > 5 ? ` (+${removedNodes.length - 5} more)` : ''}.`);
  }

  // Structural changes
  if (added.length > 0) {
    const topAdded = added.slice(0, 3).map(e => `${e.source} → ${e.target}`);
    parts.push(`${added.length} new causal relationship${added.length !== 1 ? 's' : ''} discovered: ${topAdded.join('; ')}${added.length > 3 ? ` (+${added.length - 3} more)` : ''}.`);
  }
  if (removed.length > 0) {
    parts.push(`${removed.length} relationship${removed.length !== 1 ? 's' : ''} invalidated.`);
  }

  // Weight changes
  if (stats.strengthenedEdges > 0 || stats.weakenedEdges > 0) {
    const changeParts: string[] = [];
    if (stats.strengthenedEdges > 0) changeParts.push(`${stats.strengthenedEdges} strengthened`);
    if (stats.weakenedEdges > 0) changeParts.push(`${stats.weakenedEdges} weakened`);
    parts.push(`Edge weights: ${changeParts.join(', ')}.`);
  }

  // Top change highlight
  if (topChanges.length > 0) {
    const top = topChanges[0];
    const dir = top.changeType === 'strengthened' ? 'strengthened' : 'weakened';
    const pct = Math.abs(Math.round(top.delta.effectSize * 100));
    parts.push(`Most impactful change: ${top.source} → ${top.target} ${dir} by ${pct}%.`);
  }

  return parts.join(' ');
}
