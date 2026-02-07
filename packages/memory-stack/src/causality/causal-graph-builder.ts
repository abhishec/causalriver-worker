/**
 * Causal Graph Builder Module
 * 
 * Constructs Directed Acyclic Graphs (DAGs) representing causal relationships
 * between organizational domains based on statistical evidence.
 * 
 * The graph encodes:
 * - Which domains causally influence others (edges)
 * - Strength of causal effects (edge weights)
 * - Time delays in causal effects (edge lags)
 * - Confidence in each relationship (statistical evidence)
 * 
 * This enables:
 * - Causal path tracing (A → B → C cascades)
 * - Counterfactual reasoning ("What if we had intervened at A?")
 * - Root cause analysis (finding upstream causes)
 */

import type { GrangerResult } from './granger-causality';
import type { ConfidenceInterval } from './statistical-tests';

// ============================================================================
// TYPES
// ============================================================================

export interface CausalEdge {
  source: string;
  target: string;
  
  // Causal strength
  effectSize: number;
  confidenceInterval: ConfidenceInterval;
  
  // Temporal properties
  lagDays: number;
  
  // Statistical evidence
  pValue: number;
  fStatistic: number;
  sampleSize: number;
  
  // Metadata
  discoveredAt: Date;
  lastValidated: Date;
  isActive: boolean;
}

export interface CausalNode {
  id: string;
  domain: string;
  
  // Graph properties
  inDegree: number;      // Number of causes
  outDegree: number;     // Number of effects
  
  // Centrality measures
  betweenness: number;   // How often on shortest paths
  pageRank: number;      // Importance in the graph
  
  // Aggregate causal influence
  totalCausalInfluence: number;
  averageEffectSize: number;
}

export interface CausalDAG {
  nodes: Map<string, CausalNode>;
  edges: CausalEdge[];
  
  // Graph metadata
  createdAt: Date;
  lastUpdated: Date;
  organizationId?: string;
  
  // Validation
  isAcyclic: boolean;
  stronglyConnectedComponents: string[][];
}

export interface CausalPath {
  nodes: string[];
  edges: CausalEdge[];
  totalEffectSize: number;
  cumulativeLag: number;
  probability: number;
}

export interface CausalGraphConfig {
  significanceThreshold?: number;
  minEffectSize?: number;
  maxEdgeAge?: number; // Days before edge needs revalidation
}

// ============================================================================
// GRAPH CONSTRUCTION
// ============================================================================

/**
 * Create a causal graph builder
 */
export function createCausalGraphBuilder(
  config: CausalGraphConfig = {}
) {
  const {
    significanceThreshold = 0.05,
    minEffectSize = 0.02,
    maxEdgeAge = 90
  } = config;
  
  let graph: CausalDAG = createEmptyGraph();
  
  /**
   * Add edges from Granger causality results
   */
  function addGrangerResults(results: GrangerResult[]): void {
    for (const result of results) {
      if (!result.isSignificant) continue;
      if (result.effectSize < minEffectSize) continue;
      
      const edge: CausalEdge = {
        source: result.sourceDomain,
        target: result.targetDomain,
        effectSize: result.effectSize,
        confidenceInterval: result.confidenceInterval,
        lagDays: result.optimalLag,
        pValue: result.pValue,
        fStatistic: result.fStatistic,
        sampleSize: result.sampleSize,
        discoveredAt: new Date(),
        lastValidated: new Date(),
        isActive: true
      };
      
      addEdge(edge);
    }
    
    recomputeGraphProperties();
  }
  
  /**
   * Add a single edge to the graph
   */
  function addEdge(edge: CausalEdge): void {
    // Ensure nodes exist
    if (!graph.nodes.has(edge.source)) {
      graph.nodes.set(edge.source, createNode(edge.source));
    }
    if (!graph.nodes.has(edge.target)) {
      graph.nodes.set(edge.target, createNode(edge.target));
    }
    
    // Check for existing edge
    const existingIndex = graph.edges.findIndex(
      e => e.source === edge.source && e.target === edge.target
    );
    
    if (existingIndex >= 0) {
      // Update existing edge if new evidence is stronger
      const existing = graph.edges[existingIndex];
      if (edge.pValue < existing.pValue || edge.sampleSize > existing.sampleSize) {
        graph.edges[existingIndex] = edge;
      }
    } else {
      // Add new edge
      graph.edges.push(edge);
    }
    
    // Check for cycles
    graph.isAcyclic = !detectCycle();
  }
  
  /**
   * Create an empty node
   */
  function createNode(id: string): CausalNode {
    return {
      id,
      domain: id,
      inDegree: 0,
      outDegree: 0,
      betweenness: 0,
      pageRank: 1 / (graph.nodes.size + 1),
      totalCausalInfluence: 0,
      averageEffectSize: 0
    };
  }
  
  /**
   * Recompute graph properties after modifications
   */
  function recomputeGraphProperties(): void {
    // Reset node degrees
    for (const node of graph.nodes.values()) {
      node.inDegree = 0;
      node.outDegree = 0;
      node.totalCausalInfluence = 0;
    }
    
    // Compute degrees
    for (const edge of graph.edges) {
      if (!edge.isActive) continue;
      
      const source = graph.nodes.get(edge.source);
      const target = graph.nodes.get(edge.target);
      
      if (source) {
        source.outDegree++;
        source.totalCausalInfluence += edge.effectSize;
      }
      if (target) {
        target.inDegree++;
      }
    }
    
    // Compute average effect sizes
    for (const node of graph.nodes.values()) {
      if (node.outDegree > 0) {
        node.averageEffectSize = node.totalCausalInfluence / node.outDegree;
      }
    }
    
    // Compute PageRank
    computePageRank();
    
    // Compute betweenness centrality
    computeBetweenness();
    
    // Find strongly connected components
    graph.stronglyConnectedComponents = findSCCs();
    
    graph.lastUpdated = new Date();
  }
  
  /**
   * Detect cycles using DFS
   */
  function detectCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    function dfs(node: string): boolean {
      visited.add(node);
      recursionStack.add(node);
      
      for (const edge of graph.edges) {
        if (edge.source !== node || !edge.isActive) continue;
        
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) return true;
        } else if (recursionStack.has(edge.target)) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    }
    
    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) return true;
      }
    }
    
    return false;
  }
  
  /**
   * Compute PageRank for node importance
   */
  function computePageRank(dampingFactor: number = 0.85, iterations: number = 100): void {
    const n = graph.nodes.size;
    if (n === 0) return;
    
    // Initialize
    for (const node of graph.nodes.values()) {
      node.pageRank = 1 / n;
    }
    
    // Iterate
    for (let iter = 0; iter < iterations; iter++) {
      const newRanks = new Map<string, number>();
      
      for (const [nodeId, node] of graph.nodes) {
        let sum = 0;
        
        // Sum contributions from incoming edges
        for (const edge of graph.edges) {
          if (edge.target !== nodeId || !edge.isActive) continue;
          
          const source = graph.nodes.get(edge.source);
          if (source && source.outDegree > 0) {
            sum += source.pageRank / source.outDegree;
          }
        }
        
        newRanks.set(nodeId, (1 - dampingFactor) / n + dampingFactor * sum);
      }
      
      // Update ranks
      for (const [nodeId, rank] of newRanks) {
        const node = graph.nodes.get(nodeId);
        if (node) node.pageRank = rank;
      }
    }
  }
  
  /**
   * Compute betweenness centrality
   */
  function computeBetweenness(): void {
    const nodeIds = Array.from(graph.nodes.keys());
    
    // Initialize
    for (const node of graph.nodes.values()) {
      node.betweenness = 0;
    }
    
    // For each pair of nodes, find shortest path
    for (const source of nodeIds) {
      const distances = new Map<string, number>();
      const paths = new Map<string, string[][]>();
      
      // BFS for shortest paths
      distances.set(source, 0);
      paths.set(source, [[source]]);
      
      const queue = [source];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDist = distances.get(current)!;
        
        for (const edge of graph.edges) {
          if (edge.source !== current || !edge.isActive) continue;
          
          const neighbor = edge.target;
          if (!distances.has(neighbor)) {
            distances.set(neighbor, currentDist + 1);
            queue.push(neighbor);
          }
          
          if (distances.get(neighbor) === currentDist + 1) {
            const currentPaths = paths.get(current) || [];
            const neighborPaths = paths.get(neighbor) || [];
            
            for (const path of currentPaths) {
              neighborPaths.push([...path, neighbor]);
            }
            paths.set(neighbor, neighborPaths);
          }
        }
      }
      
      // Count paths through each node
      for (const target of nodeIds) {
        if (target === source) continue;
        
        const targetPaths = paths.get(target) || [];
        if (targetPaths.length === 0) continue;
        
        for (const nodeId of nodeIds) {
          if (nodeId === source || nodeId === target) continue;
          
          const pathsThrough = targetPaths.filter(
            path => path.includes(nodeId)
          ).length;
          
          const node = graph.nodes.get(nodeId);
          if (node) {
            node.betweenness += pathsThrough / targetPaths.length;
          }
        }
      }
    }
  }
  
  /**
   * Find strongly connected components (Tarjan's algorithm)
   */
  function findSCCs(): string[][] {
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let currentIndex = 0;
    
    function strongconnect(nodeId: string): void {
      index.set(nodeId, currentIndex);
      lowlink.set(nodeId, currentIndex);
      currentIndex++;
      stack.push(nodeId);
      onStack.add(nodeId);
      
      for (const edge of graph.edges) {
        if (edge.source !== nodeId || !edge.isActive) continue;
        
        const neighbor = edge.target;
        if (!index.has(neighbor)) {
          strongconnect(neighbor);
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(neighbor)!));
        } else if (onStack.has(neighbor)) {
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, index.get(neighbor)!));
        }
      }
      
      if (lowlink.get(nodeId) === index.get(nodeId)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== nodeId);
        
        if (scc.length > 1) {
          sccs.push(scc);
        }
      }
    }
    
    for (const nodeId of graph.nodes.keys()) {
      if (!index.has(nodeId)) {
        strongconnect(nodeId);
      }
    }
    
    return sccs;
  }
  
  /**
   * Find all causal paths between two nodes
   */
  function findCausalPaths(
    source: string,
    target: string,
    maxLength: number = 5
  ): CausalPath[] {
    const paths: CausalPath[] = [];
    
    function dfs(
      current: string,
      path: string[],
      edges: CausalEdge[],
      totalEffect: number,
      totalLag: number,
      probability: number
    ): void {
      if (path.length > maxLength) return;
      
      if (current === target && path.length > 1) {
        paths.push({
          nodes: [...path],
          edges: [...edges],
          totalEffectSize: totalEffect,
          cumulativeLag: totalLag,
          probability
        });
        return;
      }
      
      for (const edge of graph.edges) {
        if (edge.source !== current || !edge.isActive) continue;
        if (path.includes(edge.target)) continue; // Avoid cycles
        
        dfs(
          edge.target,
          [...path, edge.target],
          [...edges, edge],
          totalEffect * edge.effectSize,
          totalLag + edge.lagDays,
          probability * (1 - edge.pValue)
        );
      }
    }
    
    dfs(source, [source], [], 1, 0, 1);
    
    return paths.sort((a, b) => b.totalEffectSize - a.totalEffectSize);
  }
  
  /**
   * Find root causes (nodes with high out-degree and no in-degree)
   */
  function findRootCauses(): CausalNode[] {
    return Array.from(graph.nodes.values())
      .filter(node => node.inDegree === 0 && node.outDegree > 0)
      .sort((a, b) => b.totalCausalInfluence - a.totalCausalInfluence);
  }
  
  /**
   * Find terminal effects (nodes with high in-degree and no out-degree)
   */
  function findTerminalEffects(): CausalNode[] {
    return Array.from(graph.nodes.values())
      .filter(node => node.outDegree === 0 && node.inDegree > 0)
      .sort((a, b) => b.inDegree - a.inDegree);
  }
  
  /**
   * Get the most influential nodes (by PageRank)
   */
  function getMostInfluential(limit: number = 5): CausalNode[] {
    return Array.from(graph.nodes.values())
      .sort((a, b) => b.pageRank - a.pageRank)
      .slice(0, limit);
  }
  
  /**
   * Prune stale edges
   */
  function pruneStaleEdges(): number {
    const now = new Date();
    let pruned = 0;
    
    for (const edge of graph.edges) {
      const age = (now.getTime() - edge.lastValidated.getTime()) / (1000 * 60 * 60 * 24);
      if (age > maxEdgeAge) {
        edge.isActive = false;
        pruned++;
      }
    }
    
    if (pruned > 0) {
      recomputeGraphProperties();
    }
    
    return pruned;
  }
  
  /**
   * Export graph to serializable format
   */
  function toJSON(): object {
    return {
      nodes: Array.from(graph.nodes.values()),
      edges: graph.edges,
      createdAt: graph.createdAt.toISOString(),
      lastUpdated: graph.lastUpdated.toISOString(),
      organizationId: graph.organizationId,
      isAcyclic: graph.isAcyclic,
      stronglyConnectedComponents: graph.stronglyConnectedComponents
    };
  }
  
  /**
   * Get the current graph
   */
  function getGraph(): CausalDAG {
    return graph;
  }
  
  return {
    addGrangerResults,
    addEdge,
    findCausalPaths,
    findRootCauses,
    findTerminalEffects,
    getMostInfluential,
    pruneStaleEdges,
    recomputeGraphProperties,
    toJSON,
    getGraph
  };
}

/**
 * Create an empty graph
 */
function createEmptyGraph(): CausalDAG {
  return {
    nodes: new Map(),
    edges: [],
    createdAt: new Date(),
    lastUpdated: new Date(),
    isAcyclic: true,
    stronglyConnectedComponents: []
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type CausalGraphBuilder = ReturnType<typeof createCausalGraphBuilder>;
