/**
 * Nexus Memory Stack - Causal Graph Builder Module Tests
 *
 * Comprehensive tests for DAG construction, causal path finding,
 * root cause analysis, PageRank ranking, edge pruning, and serialization.
 */

import { describe, it, expect } from 'vitest';
import { createCausalGraphBuilder } from '../causality/causal-graph-builder';
import type { CausalEdge } from '../causality/causal-graph-builder';
import type { GrangerResult } from '../causality/granger-causality';
import type { ConfidenceInterval } from '../causality/statistical-tests';

// ============================================================================
// HELPERS
// ============================================================================

const defaultCI: ConfidenceInterval = { lower: 0.05, upper: 0.25, level: 0.95 };

function makeEdge(
  source: string,
  target: string,
  overrides: Partial<CausalEdge> = {}
): CausalEdge {
  return {
    source,
    target,
    effectSize: 0.15,
    confidenceInterval: { ...defaultCI },
    lagDays: 7,
    pValue: 0.01,
    fStatistic: 12.5,
    sampleSize: 100,
    discoveredAt: new Date(),
    lastValidated: new Date(),
    isActive: true,
    ...overrides,
  };
}

function makeGrangerResult(
  sourceDomain: string,
  targetDomain: string,
  overrides: Partial<GrangerResult> = {}
): GrangerResult {
  return {
    sourceDomain,
    targetDomain,
    fStatistic: 10.0,
    pValue: 0.01,
    optimalLag: 3,
    isSignificant: true,
    effectSize: 0.20,
    confidenceInterval: { ...defaultCI },
    sampleSize: 120,
    naturalLanguage: `${sourceDomain} Granger-causes ${targetDomain}`,
    ...overrides,
  };
}

// ============================================================================
// createCausalGraphBuilder FACTORY
// ============================================================================

describe('createCausalGraphBuilder', () => {
  it('should return an object with the expected API methods', () => {
    const builder = createCausalGraphBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.addEdge).toBe('function');
    expect(typeof builder.addGrangerResults).toBe('function');
    expect(typeof builder.findCausalPaths).toBe('function');
    expect(typeof builder.findRootCauses).toBe('function');
    expect(typeof builder.findTerminalEffects).toBe('function');
    expect(typeof builder.getMostInfluential).toBe('function');
    expect(typeof builder.pruneStaleEdges).toBe('function');
    expect(typeof builder.recomputeGraphProperties).toBe('function');
    expect(typeof builder.toJSON).toBe('function');
    expect(typeof builder.getGraph).toBe('function');
  });

  it('should initialise an empty acyclic graph with no nodes or edges', () => {
    const builder = createCausalGraphBuilder();
    const graph = builder.getGraph();
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.isAcyclic).toBe(true);
    expect(graph.stronglyConnectedComponents).toEqual([]);
  });

  it('should accept custom configuration', () => {
    // A very strict threshold should reject results that default would accept
    const builder = createCausalGraphBuilder({
      significanceThreshold: 0.001,
      minEffectSize: 0.50,
      maxEdgeAge: 30,
    });
    // Feed a result that passes the default but not this config
    builder.addGrangerResults([
      makeGrangerResult('A', 'B', { effectSize: 0.10 }),
    ]);
    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(0);
  });
});

// ============================================================================
// addEdge
// ============================================================================

describe('addEdge', () => {
  it('should create source and target nodes when they do not exist', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('sales', 'revenue'));

    const graph = builder.getGraph();
    expect(graph.nodes.has('sales')).toBe(true);
    expect(graph.nodes.has('revenue')).toBe(true);
    expect(graph.edges).toHaveLength(1);
  });

  it('should not duplicate nodes when adding multiple edges from the same source', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('A', 'C'));

    const graph = builder.getGraph();
    expect(graph.nodes.size).toBe(3); // A, B, C
    expect(graph.edges).toHaveLength(2);
  });

  it('should update an existing edge when new evidence has a lower p-value', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { pValue: 0.04, sampleSize: 50 }));
    builder.addEdge(makeEdge('A', 'B', { pValue: 0.01, sampleSize: 50 }));

    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].pValue).toBe(0.01);
  });

  it('should update an existing edge when new evidence has a larger sample size', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { pValue: 0.03, sampleSize: 50 }));
    builder.addEdge(makeEdge('A', 'B', { pValue: 0.03, sampleSize: 200 }));

    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].sampleSize).toBe(200);
  });

  it('should NOT update an existing edge when new evidence is weaker', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { pValue: 0.01, sampleSize: 200 }));
    builder.addEdge(makeEdge('A', 'B', { pValue: 0.04, sampleSize: 100 }));

    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].pValue).toBe(0.01);
    expect(graph.edges[0].sampleSize).toBe(200);
  });

  it('should mark the graph as cyclic when a cycle is introduced', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('B', 'C'));
    expect(builder.getGraph().isAcyclic).toBe(true);

    builder.addEdge(makeEdge('C', 'A'));
    expect(builder.getGraph().isAcyclic).toBe(false);
  });
});

// ============================================================================
// addGrangerResults
// ============================================================================

describe('addGrangerResults', () => {
  it('should add edges from significant results that exceed min effect size', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('marketing', 'sales'),
      makeGrangerResult('sales', 'revenue'),
    ]);

    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.size).toBe(3);
  });

  it('should skip non-significant results', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('A', 'B', { isSignificant: false }),
    ]);

    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes.size).toBe(0);
  });

  it('should skip results below minEffectSize', () => {
    const builder = createCausalGraphBuilder({ minEffectSize: 0.30 });
    builder.addGrangerResults([
      makeGrangerResult('A', 'B', { effectSize: 0.10 }),
    ]);

    const graph = builder.getGraph();
    expect(graph.edges).toHaveLength(0);
  });

  it('should recompute graph properties (degrees, PageRank) after adding results', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('A', 'B'),
      makeGrangerResult('A', 'C'),
    ]);

    const graph = builder.getGraph();
    const nodeA = graph.nodes.get('A')!;
    expect(nodeA.outDegree).toBe(2);
    expect(nodeA.inDegree).toBe(0);

    const nodeB = graph.nodes.get('B')!;
    expect(nodeB.inDegree).toBe(1);
    expect(nodeB.outDegree).toBe(0);
  });
});

// ============================================================================
// findCausalPaths
// ============================================================================

describe('findCausalPaths', () => {
  it('should find a direct path between two connected nodes', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { effectSize: 0.5, lagDays: 3, pValue: 0.01 }));
    builder.recomputeGraphProperties();

    const paths = builder.findCausalPaths('A', 'B');
    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toEqual(['A', 'B']);
    expect(paths[0].cumulativeLag).toBe(3);
  });

  it('should find a multi-hop path (A -> B -> C)', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { effectSize: 0.8, lagDays: 2, pValue: 0.01 }));
    builder.addEdge(makeEdge('B', 'C', { effectSize: 0.6, lagDays: 5, pValue: 0.02 }));
    builder.recomputeGraphProperties();

    const paths = builder.findCausalPaths('A', 'C');
    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toEqual(['A', 'B', 'C']);
    expect(paths[0].cumulativeLag).toBe(7);
    // totalEffectSize = 1 * 0.8 * 0.6
    expect(paths[0].totalEffectSize).toBeCloseTo(0.48, 5);
  });

  it('should find multiple paths and sort them by total effect size descending', () => {
    const builder = createCausalGraphBuilder();
    // Path 1: A -> B -> D  (effect 0.8 * 0.3 = 0.24)
    builder.addEdge(makeEdge('A', 'B', { effectSize: 0.8 }));
    builder.addEdge(makeEdge('B', 'D', { effectSize: 0.3 }));
    // Path 2: A -> C -> D  (effect 0.9 * 0.5 = 0.45)
    builder.addEdge(makeEdge('A', 'C', { effectSize: 0.9 }));
    builder.addEdge(makeEdge('C', 'D', { effectSize: 0.5 }));
    builder.recomputeGraphProperties();

    const paths = builder.findCausalPaths('A', 'D');
    expect(paths).toHaveLength(2);
    // Highest effect path first
    expect(paths[0].totalEffectSize).toBeGreaterThan(paths[1].totalEffectSize);
    expect(paths[0].nodes).toEqual(['A', 'C', 'D']);
    expect(paths[1].nodes).toEqual(['A', 'B', 'D']);
  });

  it('should return an empty array when no path exists', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('C', 'D'));
    builder.recomputeGraphProperties();

    const paths = builder.findCausalPaths('A', 'D');
    expect(paths).toHaveLength(0);
  });

  it('should respect the maxLength parameter', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('B', 'C'));
    builder.addEdge(makeEdge('C', 'D'));
    builder.recomputeGraphProperties();

    // maxLength = 2 means path array cannot exceed length 2 => only direct edges
    const paths = builder.findCausalPaths('A', 'D', 2);
    expect(paths).toHaveLength(0);

    // maxLength = 4 should allow A->B->C->D (length 4)
    const longerPaths = builder.findCausalPaths('A', 'D', 4);
    expect(longerPaths).toHaveLength(1);
  });

  it('should avoid cycles during path search', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('B', 'A')); // creates a cycle
    builder.addEdge(makeEdge('B', 'C'));
    builder.recomputeGraphProperties();

    // Should still find A->B->C without infinite loop
    const paths = builder.findCausalPaths('A', 'C');
    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toEqual(['A', 'B', 'C']);
  });
});

// ============================================================================
// findRootCauses
// ============================================================================

describe('findRootCauses', () => {
  it('should return nodes with no incoming edges and at least one outgoing edge', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('root1', 'mid'),
      makeGrangerResult('root2', 'mid'),
      makeGrangerResult('mid', 'leaf'),
    ]);

    const roots = builder.findRootCauses();
    const rootIds = roots.map(n => n.id);
    expect(rootIds).toContain('root1');
    expect(rootIds).toContain('root2');
    expect(rootIds).not.toContain('mid');
    expect(rootIds).not.toContain('leaf');
  });

  it('should sort root causes by totalCausalInfluence descending', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('weakRoot', 'X', { effectSize: 0.10 }),
      makeGrangerResult('strongRoot', 'Y', { effectSize: 0.90 }),
    ]);

    const roots = builder.findRootCauses();
    expect(roots[0].id).toBe('strongRoot');
    expect(roots[1].id).toBe('weakRoot');
  });

  it('should return an empty array for an empty graph', () => {
    const builder = createCausalGraphBuilder();
    const roots = builder.findRootCauses();
    expect(roots).toEqual([]);
  });
});

// ============================================================================
// findTerminalEffects
// ============================================================================

describe('findTerminalEffects', () => {
  it('should return nodes with no outgoing edges and at least one incoming edge', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('A', 'terminal1'),
      makeGrangerResult('B', 'terminal1'),
      makeGrangerResult('A', 'terminal2'),
    ]);

    const terminals = builder.findTerminalEffects();
    const terminalIds = terminals.map(n => n.id);
    expect(terminalIds).toContain('terminal1');
    expect(terminalIds).toContain('terminal2');
    expect(terminalIds).not.toContain('A');
    expect(terminalIds).not.toContain('B');
  });

  it('should sort terminal effects by inDegree descending', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('X', 'highIn'),
      makeGrangerResult('Y', 'highIn'),
      makeGrangerResult('Z', 'highIn'),
      makeGrangerResult('X', 'lowIn'),
    ]);

    const terminals = builder.findTerminalEffects();
    expect(terminals[0].id).toBe('highIn');
    expect(terminals[0].inDegree).toBe(3);
    expect(terminals[1].id).toBe('lowIn');
    expect(terminals[1].inDegree).toBe(1);
  });

  it('should return an empty array for an empty graph', () => {
    const builder = createCausalGraphBuilder();
    const terminals = builder.findTerminalEffects();
    expect(terminals).toEqual([]);
  });
});

// ============================================================================
// getMostInfluential
// ============================================================================

describe('getMostInfluential', () => {
  it('should return nodes sorted by PageRank descending', () => {
    const builder = createCausalGraphBuilder();
    // Hub topology: A points to B, C, D  =>  B, C, D get PageRank from A
    builder.addGrangerResults([
      makeGrangerResult('hub', 'spoke1'),
      makeGrangerResult('hub', 'spoke2'),
      makeGrangerResult('hub', 'spoke3'),
    ]);

    const top = builder.getMostInfluential(4);
    expect(top.length).toBe(4);
    // Each successive node should have >= pageRank of the next
    for (let i = 0; i < top.length - 1; i++) {
      expect(top[i].pageRank).toBeGreaterThanOrEqual(top[i + 1].pageRank);
    }
  });

  it('should respect the limit parameter', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([
      makeGrangerResult('A', 'B'),
      makeGrangerResult('B', 'C'),
      makeGrangerResult('C', 'D'),
      makeGrangerResult('D', 'E'),
    ]);

    const top2 = builder.getMostInfluential(2);
    expect(top2).toHaveLength(2);
  });

  it('should return all nodes when limit exceeds graph size', () => {
    const builder = createCausalGraphBuilder();
    builder.addGrangerResults([makeGrangerResult('A', 'B')]);

    const top = builder.getMostInfluential(100);
    expect(top).toHaveLength(2);
  });
});

// ============================================================================
// pruneStaleEdges
// ============================================================================

describe('pruneStaleEdges', () => {
  it('should deactivate edges older than maxEdgeAge days', () => {
    const builder = createCausalGraphBuilder({ maxEdgeAge: 30 });

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 60); // 60 days ago

    builder.addEdge(makeEdge('A', 'B', { lastValidated: staleDate }));
    builder.recomputeGraphProperties();

    const pruned = builder.pruneStaleEdges();
    expect(pruned).toBe(1);

    const graph = builder.getGraph();
    expect(graph.edges[0].isActive).toBe(false);
  });

  it('should NOT deactivate edges within maxEdgeAge', () => {
    const builder = createCausalGraphBuilder({ maxEdgeAge: 90 });

    builder.addEdge(makeEdge('A', 'B', { lastValidated: new Date() }));
    builder.recomputeGraphProperties();

    const pruned = builder.pruneStaleEdges();
    expect(pruned).toBe(0);
    expect(builder.getGraph().edges[0].isActive).toBe(true);
  });

  it('should recompute graph properties after pruning', () => {
    const builder = createCausalGraphBuilder({ maxEdgeAge: 10 });

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 20);

    builder.addEdge(makeEdge('A', 'B', { lastValidated: staleDate }));
    builder.recomputeGraphProperties();
    expect(builder.getGraph().nodes.get('A')!.outDegree).toBe(1);

    builder.pruneStaleEdges();
    // After pruning the edge is inactive so outDegree recomputes to 0
    expect(builder.getGraph().nodes.get('A')!.outDegree).toBe(0);
  });

  it('should return 0 when there are no stale edges', () => {
    const builder = createCausalGraphBuilder();
    const pruned = builder.pruneStaleEdges();
    expect(pruned).toBe(0);
  });
});

// ============================================================================
// recomputeGraphProperties
// ============================================================================

describe('recomputeGraphProperties', () => {
  it('should calculate correct in/out degrees', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('A', 'C'));
    builder.addEdge(makeEdge('B', 'C'));
    builder.recomputeGraphProperties();

    const graph = builder.getGraph();
    expect(graph.nodes.get('A')!.outDegree).toBe(2);
    expect(graph.nodes.get('A')!.inDegree).toBe(0);
    expect(graph.nodes.get('B')!.outDegree).toBe(1);
    expect(graph.nodes.get('B')!.inDegree).toBe(1);
    expect(graph.nodes.get('C')!.outDegree).toBe(0);
    expect(graph.nodes.get('C')!.inDegree).toBe(2);
  });

  it('should compute averageEffectSize correctly', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { effectSize: 0.4 }));
    builder.addEdge(makeEdge('A', 'C', { effectSize: 0.6 }));
    builder.recomputeGraphProperties();

    const nodeA = builder.getGraph().nodes.get('A')!;
    expect(nodeA.averageEffectSize).toBeCloseTo(0.5, 5);
    expect(nodeA.totalCausalInfluence).toBeCloseTo(1.0, 5);
  });

  it('should compute betweenness centrality for a chain graph', () => {
    const builder = createCausalGraphBuilder();
    // Chain: A -> B -> C -> D
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('B', 'C'));
    builder.addEdge(makeEdge('C', 'D'));
    builder.recomputeGraphProperties();

    const graph = builder.getGraph();
    // B is on the shortest path from A to C and A to D
    // C is on the shortest path from A to D and B to D
    expect(graph.nodes.get('B')!.betweenness).toBeGreaterThan(0);
    expect(graph.nodes.get('C')!.betweenness).toBeGreaterThan(0);
    // End nodes have zero betweenness
    expect(graph.nodes.get('A')!.betweenness).toBe(0);
    expect(graph.nodes.get('D')!.betweenness).toBe(0);
  });

  it('should detect strongly connected components (cycles)', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('B', 'C'));
    builder.addEdge(makeEdge('C', 'A')); // cycle A -> B -> C -> A
    builder.recomputeGraphProperties();

    const sccs = builder.getGraph().stronglyConnectedComponents;
    expect(sccs.length).toBeGreaterThanOrEqual(1);
    const flatSCC = sccs.flat();
    expect(flatSCC).toContain('A');
    expect(flatSCC).toContain('B');
    expect(flatSCC).toContain('C');
  });
});

// ============================================================================
// toJSON / getGraph SERIALIZATION
// ============================================================================

describe('toJSON / getGraph', () => {
  it('toJSON should return a plain serializable object', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('X', 'Y'));
    builder.recomputeGraphProperties();

    const json = builder.toJSON() as Record<string, unknown>;
    expect(json).toHaveProperty('nodes');
    expect(json).toHaveProperty('edges');
    expect(json).toHaveProperty('createdAt');
    expect(json).toHaveProperty('lastUpdated');
    expect(json).toHaveProperty('isAcyclic');
    expect(json).toHaveProperty('stronglyConnectedComponents');
    // Nodes should be serialized as an array, not a Map
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.edges)).toBe(true);
    // Dates should be ISO strings
    expect(typeof json.createdAt).toBe('string');
    expect(typeof json.lastUpdated).toBe('string');
  });

  it('getGraph should return the internal CausalDAG with Map-based nodes', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('M', 'N'));
    builder.recomputeGraphProperties();

    const graph = builder.getGraph();
    expect(graph.nodes instanceof Map).toBe(true);
    expect(graph.nodes.has('M')).toBe(true);
    expect(graph.nodes.has('N')).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  it('empty graph: findCausalPaths returns empty array', () => {
    const builder = createCausalGraphBuilder();
    expect(builder.findCausalPaths('X', 'Y')).toEqual([]);
  });

  it('empty graph: findRootCauses returns empty array', () => {
    const builder = createCausalGraphBuilder();
    expect(builder.findRootCauses()).toEqual([]);
  });

  it('empty graph: findTerminalEffects returns empty array', () => {
    const builder = createCausalGraphBuilder();
    expect(builder.findTerminalEffects()).toEqual([]);
  });

  it('empty graph: getMostInfluential returns empty array', () => {
    const builder = createCausalGraphBuilder();
    expect(builder.getMostInfluential()).toEqual([]);
  });

  it('empty graph: recomputeGraphProperties does not throw', () => {
    const builder = createCausalGraphBuilder();
    expect(() => builder.recomputeGraphProperties()).not.toThrow();
  });

  it('self-loop: should be detected as a cycle', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'A'));

    expect(builder.getGraph().isAcyclic).toBe(false);
  });

  it('disconnected components: nodes in separate subgraphs are independent', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B'));
    builder.addEdge(makeEdge('C', 'D'));
    builder.recomputeGraphProperties();

    const graph = builder.getGraph();
    expect(graph.nodes.size).toBe(4);
    expect(graph.edges).toHaveLength(2);

    // No path between disconnected components
    expect(builder.findCausalPaths('A', 'D')).toEqual([]);
    expect(builder.findCausalPaths('C', 'B')).toEqual([]);

    // Each component has its own root and terminal
    const roots = builder.findRootCauses().map(n => n.id);
    expect(roots).toContain('A');
    expect(roots).toContain('C');

    const terminals = builder.findTerminalEffects().map(n => n.id);
    expect(terminals).toContain('B');
    expect(terminals).toContain('D');
  });

  it('inactive edges should be excluded from degree calculations', () => {
    const builder = createCausalGraphBuilder();
    builder.addEdge(makeEdge('A', 'B', { isActive: true }));
    builder.addEdge(makeEdge('A', 'C', { isActive: false }));
    builder.recomputeGraphProperties();

    const nodeA = builder.getGraph().nodes.get('A')!;
    // Only the active edge counts
    expect(nodeA.outDegree).toBe(1);
  });
});
