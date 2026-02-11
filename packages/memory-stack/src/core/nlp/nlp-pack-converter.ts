/**
 * NLP Pack Converter — Converts NLP extraction outputs into TrainingPacks
 *
 * Takes the outputs from all NLP modules and produces TrainingPack[] that
 * can be fed directly to brain-trainer.trainInMemory().
 *
 * Conversions:
 * - CausalStatements → CausalChainEntry[]
 * - EntityRelationships → TrainingPattern[]
 * - HierarchyRelations → cascades/patterns
 * - KnowledgeGraph causal edges → CausalChainEntry[]
 *
 * Pure TypeScript, zero dependencies.
 */

import type { TrainingPack, CausalChainEntry, TrainingPattern } from '../../learning/brain-trainer';
import type { CausalStatement } from './causal-language-miner';
import type { EntityRelationship } from './relationship-extractor';
import type { HierarchyRelation } from './concept-hierarchy-miner';
import type { CausalEdge } from './knowledge-graph-builder';

// ============================================================================
// TYPES
// ============================================================================

export interface NLPExtractionResult {
  documentId: string;
  title: string;
  domain: string;
  causalStatements: CausalStatement[];
  relationships: EntityRelationship[];
  hierarchies: HierarchyRelation[];
  graphCausalEdges: CausalEdge[];
}

// ============================================================================
// CONVERTER
// ============================================================================

/**
 * Convert NLP extraction results into a TrainingPack
 */
export function convertToTrainingPack(extraction: NLPExtractionResult): TrainingPack | null {
  const { documentId, title, domain, causalStatements, relationships, hierarchies, graphCausalEdges } = extraction;

  // Need at least some extracted knowledge to produce a meaningful pack
  if (causalStatements.length === 0 && relationships.length === 0 && graphCausalEdges.length === 0) {
    return null;
  }

  // Convert causal statements → CausalChainEntry[]
  const causalChains = buildCausalChains(causalStatements, graphCausalEdges);

  // Convert relationships → TrainingPattern[]
  const patterns = buildPatterns(relationships, hierarchies, title);

  // Build cascades from high-confidence causal chains
  const cascades = buildCascades(causalStatements);

  // Build business rules from strong causal patterns
  const businessRules = buildRulesFromCausals(causalStatements);

  // Build narrative from causal statements
  const narrative = buildNarrative(title, causalStatements, relationships);

  // Determine domains from extracted content
  const domains = [...new Set([domain, ...causalChains.map(c => c.source), ...causalChains.map(c => c.target)])];

  return {
    id: `nlp-${documentId}`,
    title: `NLP Extracted: ${title}`,
    source: `NLP Pipeline (${causalStatements.length} causal, ${relationships.length} relations, ${hierarchies.length} hierarchies)`,
    industry: 'Cross-Industry',
    domains,
    confidence: calculateOverallConfidence(causalStatements, relationships),
    tags: ['nlp-extracted', 'real-data', domain, ...extractTopics(title)],
    causalChains,
    businessRules,
    cascades,
    patterns,
    outcomes: [],
    narrative: narrative.substring(0, 3000),
  };
}

// ============================================================================
// BUILDERS
// ============================================================================

function buildCausalChains(
  statements: CausalStatement[],
  graphEdges: CausalEdge[],
): CausalChainEntry[] {
  const chains: CausalChainEntry[] = [];
  const seen = new Set<string>();

  // From causal statements
  for (const stmt of statements.slice(0, 20)) {
    const sourceDomain = inferDomain(stmt.cause);
    const targetDomain = inferDomain(stmt.effect);
    const metric = toMetric(stmt.cause, stmt.effect);
    const key = `${sourceDomain}-${targetDomain}-${metric}`;

    if (!seen.has(key)) {
      seen.add(key);
      const isNeg = stmt.type === 'inhibition';
      chains.push({
        source: sourceDomain,
        target: targetDomain,
        metric,
        effectSize: isNeg ? -(stmt.confidence * 0.6) : (stmt.confidence * 0.6),
        lagDays: estimateLag(stmt),
        pValue: Math.max(0.001, 0.05 - stmt.confidence * 0.04),
      });
    }
  }

  // From knowledge graph edges
  for (const edge of graphEdges.slice(0, 15)) {
    const key = `${edge.source}-${edge.target}-${edge.metric}`;
    if (!seen.has(key)) {
      seen.add(key);
      chains.push(edge);
    }
  }

  return chains;
}

function buildPatterns(
  relationships: EntityRelationship[],
  hierarchies: HierarchyRelation[],
  title: string,
): TrainingPattern[] {
  const patterns: TrainingPattern[] = [];

  // Group relationships by type and build patterns
  const byType = new Map<string, EntityRelationship[]>();
  for (const rel of relationships) {
    if (!byType.has(rel.relationship)) byType.set(rel.relationship, []);
    byType.get(rel.relationship)!.push(rel);
  }

  for (const [relType, rels] of byType) {
    if (rels.length >= 2) {
      const topRels = rels.slice(0, 5);
      const description = topRels
        .map(r => `${r.subject} ${r.relationship} ${r.object}`)
        .join('. ');

      patterns.push({
        name: `${title}: ${relType} relationships`,
        domains: [inferDomain(title)],
        description: description.substring(0, 400),
        observed: 70 + Math.min(rels.length * 3, 25),
        expected: 30,
        total: 100,
      });
    }
  }

  // Build hierarchy patterns
  if (hierarchies.length >= 3) {
    const topH = hierarchies.slice(0, 8);
    const description = topH
      .map(h => `${h.child} ${h.relationType} ${h.parent}`)
      .join('. ');

    patterns.push({
      name: `${title}: Concept Taxonomy`,
      domains: [inferDomain(title)],
      description: `Hierarchical structure: ${description}`.substring(0, 400),
      observed: 75,
      expected: 30,
      total: 100,
    });
  }

  return patterns;
}

function buildCascades(statements: CausalStatement[]): any[] {
  // Only high-confidence causal chains become cascades
  const highConfidence = statements.filter(s => s.confidence >= 0.80);
  if (highConfidence.length === 0) return [];

  return highConfidence.slice(0, 3).map(stmt => ({
    source: inferDomain(stmt.cause),
    target: inferDomain(stmt.effect),
    type: stmt.type === 'inhibition' ? 'blocks' : 'enables',
    severity: stmt.confidence >= 0.85 ? 'high' : 'medium',
    keywords: {
      source: extractKeywords(stmt.cause),
      target: extractKeywords(stmt.effect),
    },
    reasonTemplate: `NLP extracted: ${stmt.cause} ${stmt.type} ${stmt.effect}. Confidence: ${(stmt.confidence * 100).toFixed(0)}%.`,
  }));
}

function buildRulesFromCausals(statements: CausalStatement[]): any[] {
  // Only generate rules from very high-confidence inhibition/enhancement patterns
  const strongPatterns = statements.filter(
    s => s.confidence >= 0.85 && (s.type === 'inhibition' || s.type === 'enhancement')
  );

  return strongPatterns.slice(0, 2).map(stmt => ({
    title: `NLP: ${stmt.cause.substring(0, 40)} → ${stmt.effect.substring(0, 40)}`,
    entityType: 'company',
    when: { logic: 'AND', conditions: [
      { field: `${inferDomain(stmt.cause)}.nlp_detected`, operator: 'equals', value: true },
    ]},
    then: [{ type: 'trigger_alert', params: {
      severity: stmt.type === 'inhibition' ? 'high' : 'medium',
      message: `NLP extracted pattern: ${stmt.cause} ${stmt.type === 'inhibition' ? 'inhibits' : 'enhances'} ${stmt.effect}.`,
    }}],
    naturalLanguage: `When ${stmt.cause}, expect ${stmt.type === 'inhibition' ? 'negative' : 'positive'} impact on ${stmt.effect}.`,
    priority: 60,
  }));
}

function buildNarrative(title: string, statements: CausalStatement[], relationships: EntityRelationship[]): string {
  const parts: string[] = [`Knowledge extracted from "${title}" via NLP pipeline.`];

  if (statements.length > 0) {
    parts.push(`Found ${statements.length} causal relationships.`);
    const topCausals = statements.slice(0, 3);
    for (const s of topCausals) {
      parts.push(`${s.cause} ${s.type === 'inhibition' ? 'inhibits' : s.type === 'enhancement' ? 'enhances' : 'causes'} ${s.effect}.`);
    }
  }

  if (relationships.length > 0) {
    parts.push(`Found ${relationships.length} entity relationships.`);
  }

  return parts.join(' ');
}

// ============================================================================
// HELPERS
// ============================================================================

function inferDomain(text: string): string {
  const lower = text.toLowerCase();
  const domainKeywords: Record<string, string[]> = {
    'finance': ['revenue', 'profit', 'cash', 'investment', 'capital', 'debt', 'margin', 'cost', 'price', 'budget'],
    'engineering': ['software', 'code', 'api', 'system', 'data', 'algorithm', 'deploy', 'infrastructure'],
    'marketing': ['customer', 'brand', 'acquisition', 'campaign', 'conversion', 'growth', 'seo'],
    'product': ['feature', 'user', 'ux', 'design', 'product', 'adoption'],
    'hr': ['hiring', 'talent', 'culture', 'team', 'employee'],
    'strategy': ['market', 'competitive', 'strategy', 'innovation'],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) return domain;
  }
  return 'strategy';
}

function toMetric(cause: string, effect: string): string {
  const c = cause.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 25);
  const e = effect.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 25);
  return `${c}_to_${e}`;
}

function estimateLag(stmt: CausalStatement): number {
  if (stmt.type === 'temporal') return 60;
  if (stmt.type === 'consequence') return 30;
  if (stmt.type === 'conditional') return 14;
  return 30;
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 5);
}

function extractTopics(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 3);
}

function calculateOverallConfidence(statements: CausalStatement[], relationships: EntityRelationship[]): number {
  const allConfidences = [
    ...statements.map(s => s.confidence),
    ...relationships.map(r => r.confidence),
  ];
  if (allConfidences.length === 0) return 0.60;
  const avg = allConfidences.reduce((s, c) => s + c, 0) / allConfidences.length;
  return Math.round(avg * 100) / 100;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'have', 'has',
  'been', 'were', 'are', 'was', 'will', 'can', 'may', 'also', 'such', 'more',
  'than', 'over', 'under', 'between', 'through', 'about', 'which', 'when',
  'where', 'their', 'other', 'most', 'some', 'each', 'both', 'many',
]);
