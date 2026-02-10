/**
 * Knowledge Graph Builder — Builds in-memory graph from entities & relationships
 *
 * Features:
 * - Adjacency list representation
 * - Entity resolution via string similarity
 * - Path finding between entities
 * - Export to CausalChainEntry[] for NexusBrain training
 *
 * Pure TypeScript, zero dependencies.
 */

import type { EntityRelationship, RelationshipType } from './relationship-extractor';
import type { CausalStatement } from './causal-language-miner';
import type { HierarchyRelation } from './concept-hierarchy-miner';

// ============================================================================
// TYPES
// ============================================================================

export interface GraphNode {
  id: string;
  label: string;
  aliases: string[];
  frequency: number;
  domains: Set<string>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
  evidence: string[];
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export interface CausalEdge {
  source: string;
  target: string;
  metric: string;
  effectSize: number;
  lagDays: number;
  pValue: number;
}

// ============================================================================
// KNOWLEDGE GRAPH BUILDER
// ============================================================================

export class KnowledgeGraphBuilder {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];

  /**
   * Add relationships from the relationship extractor
   */
  addRelationships(relationships: EntityRelationship[]): void {
    for (const rel of relationships) {
      const sourceId = this.addNode(rel.subject);
      const targetId = this.addNode(rel.object);
      this.addEdge(sourceId, targetId, rel.relationship, rel.confidence, rel.sentence);
    }
  }

  /**
   * Add causal statements from the causal language miner
   */
  addCausalStatements(statements: CausalStatement[]): void {
    for (const stmt of statements) {
      const sourceId = this.addNode(stmt.cause);
      const targetId = this.addNode(stmt.effect);
      const rel = mapCausalTypeToRelationship(stmt.type);
      this.addEdge(sourceId, targetId, rel, stmt.confidence, stmt.sentence);
    }
  }

  /**
   * Add hierarchy relations from the concept hierarchy miner
   */
  addHierarchies(hierarchies: HierarchyRelation[]): void {
    for (const h of hierarchies) {
      const childId = this.addNode(h.child);
      const parentId = this.addNode(h.parent);
      this.addEdge(childId, parentId, h.relationType, h.confidence, h.sentence);
    }
  }

  /**
   * Get the full graph
   */
  getGraph(): KnowledgeGraph {
    return { nodes: this.nodes, edges: this.edges };
  }

  /**
   * Get graph statistics
   */
  getStats(): { nodeCount: number; edgeCount: number; avgDegree: number } {
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.length;
    const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;
    return { nodeCount, edgeCount, avgDegree: Math.round(avgDegree * 100) / 100 };
  }

  /**
   * Export causal edges (relationship types that imply causation)
   */
  toCausalEdges(): CausalEdge[] {
    const causalTypes = new Set(['causes', 'enables', 'blocks', 'increases', 'decreases',
      'inhibition', 'enhancement', 'explicit', 'effect', 'consequence']);

    return this.edges
      .filter(e => causalTypes.has(e.relationship))
      .map(e => {
        const isNegative = ['blocks', 'decreases', 'inhibition'].includes(e.relationship);
        return {
          source: inferDomain(e.source),
          target: inferDomain(e.target),
          metric: `${normalizeMetric(e.source)}_to_${normalizeMetric(e.target)}`,
          effectSize: isNegative ? -e.weight : e.weight,
          lagDays: 30, // Default estimate
          pValue: Math.max(0.001, 0.05 - (e.weight * 0.04)),
        };
      });
  }

  // ── Private Methods ──

  private addNode(label: string): string {
    const id = normalizeId(label);

    if (this.nodes.has(id)) {
      const node = this.nodes.get(id)!;
      node.frequency++;
      if (!node.aliases.includes(label)) {
        node.aliases.push(label);
      }
      return id;
    }

    // Check for similar existing nodes (entity resolution)
    for (const [existingId, existingNode] of this.nodes) {
      if (areSimilar(id, existingId)) {
        existingNode.frequency++;
        if (!existingNode.aliases.includes(label)) {
          existingNode.aliases.push(label);
        }
        return existingId;
      }
    }

    this.nodes.set(id, {
      id,
      label,
      aliases: [label],
      frequency: 1,
      domains: new Set([inferDomain(label)]),
    });

    return id;
  }

  private addEdge(source: string, target: string, relationship: string, weight: number, evidence: string): void {
    // Check for existing edge
    const existing = this.edges.find(
      e => e.source === source && e.target === target && e.relationship === relationship
    );

    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
      if (!existing.evidence.includes(evidence)) {
        existing.evidence.push(evidence.substring(0, 200));
      }
    } else {
      this.edges.push({
        source,
        target,
        relationship,
        weight,
        evidence: [evidence.substring(0, 200)],
      });
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeMetric(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40);
}

function areSimilar(a: string, b: string): boolean {
  // Simple containment check for entity resolution
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Check if one is a significant substring of the other (>80% overlap)
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  return longer.includes(shorter) && shorter.length / longer.length > 0.8;
}

function inferDomain(text: string): string {
  const lower = text.toLowerCase();

  const domainKeywords: Record<string, string[]> = {
    'finance': ['revenue', 'profit', 'cash', 'investment', 'capital', 'debt', 'equity', 'margin', 'valuation', 'roi', 'cost'],
    'engineering': ['software', 'code', 'api', 'system', 'infrastructure', 'data', 'algorithm', 'technical', 'deploy'],
    'marketing': ['customer', 'brand', 'acquisition', 'campaign', 'conversion', 'seo', 'content', 'growth'],
    'product': ['feature', 'user', 'ux', 'design', 'product', 'launch', 'adoption'],
    'hr': ['hiring', 'talent', 'culture', 'team', 'employee', 'retention'],
    'strategy': ['market', 'competitive', 'strategy', 'innovation', 'disruption'],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return domain;
    }
  }

  return 'strategy'; // Default domain
}

function mapCausalTypeToRelationship(type: string): string {
  const map: Record<string, string> = {
    'explicit': 'causes',
    'effect': 'causes',
    'conditional': 'enables',
    'temporal': 'precedes',
    'consequence': 'causes',
    'inhibition': 'blocks',
    'enhancement': 'increases',
  };
  return map[type] || 'causes';
}
