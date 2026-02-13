/**
 * Universal Brain Context Builder — The Prefrontal Cortex
 * ═══════════════════════════════════════════════════════════
 *
 * Assembles context from ALL 16 brain regions into a structured,
 * LLM-ready prompt. Works for ANY domain — code, finance, research,
 * legal, operations, processes.
 *
 * Architecture:
 *   - All brain regions are optional (use what's available)
 *   - Intent-driven: detects what the user is asking, queries the RIGHT regions
 *   - Confidence-aware: reports uncertainty so the LLM knows its limits
 *   - Generic: lives in the SDK, reusable by any app
 *
 * Brain Analog: The Prefrontal Cortex — selects which memories to bring
 * to working memory for a specific question.
 *
 * @packageDocumentation
 */

import type { KnowledgeDependencyGraphInstance } from '../core/knowledge-dependency-graph';
import type { ExpertiseGraphInstance } from '../core/expertise-graph';
import type { CollaborationGraphInstance } from '../core/collaboration-graph';
import type { CausalDAG } from '../causality/continuous-learner';
import type { MultiHopPrediction, ReasoningPath } from '../causality/multi-hop-reasoner';
import type { BrainHealthMonitor } from '../causality/brain-health-monitor';

// =============================================================================
// TYPES
// =============================================================================

/**
 * All brain regions the context builder can use. All are optional —
 * pass only what's available. The builder gracefully skips missing regions.
 */
export interface BrainRegions {
  // Structural Intelligence
  dependencyGraph?: KnowledgeDependencyGraphInstance;
  expertiseGraph?: ExpertiseGraphInstance;
  collaborationGraph?: CollaborationGraphInstance;

  // Causal Intelligence (requires CausalDAG for most methods)
  causalDAG?: CausalDAG;
  multiHopReasoner?: {
    reason(dag: CausalDAG, source: string, target: string): MultiHopPrediction;
    findReachableDomains(dag: CausalDAG, source: string): Array<{ domain: string; confidence: number; hops: number; lagDays: number }>;
    findCriticalEdges(dag: CausalDAG, targets: string[]): Array<{ source: string; target: string; criticality: number; affectedTargets: string[] }>;
    reasonBackward(dag: CausalDAG, effect: string): Array<{ cause: string; path: ReasoningPath; diagnosisConfidence: number }>;
    diagnose(dag: CausalDAG, effect: string, anomalyMagnitude?: number): { topCauses: Array<{ cause: string; likelihood: number; lagDays: number; path: string[]; explanation: string }>; isExplainable: boolean; narrative: string };
  };
  counterfactualSimulator?: {
    whatIf(dag: CausalDAG, intervention: { domain: string; action: string; magnitude: number }): { deltas: Array<{ domain: string; estimatedChange: number; confidence: number }>; narrative: string };
    findLeveragePoints(dag: CausalDAG, targetDomains?: string[]): Array<{ domain: string; leverageScore: number; targetImpact: number }>;
  };
  explanationGenerator?: {
    explainAnomaly(anomaly: { domain: string; metric: string; deviation: number; detectedAt: Date }, dag: CausalDAG, recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }>): { rootCauses: Array<{ cause: string; likelihood: number; explanation: string }>; narrative: string };
    generateBriefing(dag: CausalDAG, recentChanges?: unknown[], topInsights?: unknown[]): { summary: string; sections: Array<{ title: string; content: string }> };
    summarizePath(path: ReasoningPath): string;
  };
  cascadeTracker?: {
    getActiveCascades(organizationId?: string): Array<{ cascadeId: string; triggerDomain: string; expectedPath: string[]; actualPath: string[]; currentStage: number; probability: number; severityScore: number; status: string }>;
    getStats(organizationId?: string): { totalCascades: number; activeCascades: number; interventionSuccessRate: number; avgStagesReached: number };
  };

  // Predictive Intelligence
  temporalForecaster?: {
    forecast(allSeries: Map<string, { values: number[]; dates: Date[] }>, dag: CausalDAG, targetDomain: string, horizonDays?: number): { points: Array<{ day: number; predicted: number; lower: number; upper: number }>; method: string; confidence: number };
  };
  timeSeries?: Map<string, number[]>;

  // Introspective Intelligence
  brainHealthMonitor?: BrainHealthMonitor;
  uncertaintyQuantifier?: {
    findHighestUncertaintyEdges(dag: CausalDAG, topN?: number, referenceDate?: Date): Array<{ source: string; target: string; uncertainty: number; reason: string }>;
    computeDAGConfidenceQuality(dag: CausalDAG, referenceDate?: Date): { quality: number; category: string; edgeCount: number; highUncertaintyCount: number };
  };

  // Attention
  attentionMechanism?: {
    summarizeAttention(dag: CausalDAG, context: { focusDomains: string[]; queryType?: string }, topN?: number): { boosted: Array<{ source: string; target: string; baseWeight: number; adjustedWeight: number; reasons: string[] }>; dampened: Array<{ source: string; target: string; baseWeight: number; adjustedWeight: number; reasons: string[] }> };
  };
}

/** Unified intent detection across ALL domains. */
export type BrainIntent =
  // Structural (code/knowledge)
  | 'onboarding'    // "How does X work?"
  | 'debugging'     // "Why does X fail?"
  | 'incident'      // "X is down"
  | 'knowledge'     // "Who knows about X?"
  | 'review'        // "What does this change affect?"
  // Causal (business/ops)
  | 'explain'       // "Why did X happen?"
  | 'predict'       // "What will happen to X?"
  | 'diagnose'      // "Why is X declining?"
  | 'whatif'        // "What if we change X?"
  | 'cascade'       // "What's the ripple effect?"
  // Introspective
  | 'health'        // "How healthy is our data/brain?"
  | 'uncertainty'   // "What are we uncertain about?"
  // General
  | 'general';

/** A context section contributed by one brain region. */
export interface BrainContextSection {
  region: string;       // e.g., "dependency-graph", "multi-hop-reasoner"
  title: string;        // e.g., "## Causal Chain Analysis"
  content: string;      // Markdown content
  relevance: number;    // 0-1, how relevant to the question
}

/** The assembled brain context, ready for LLM consumption. */
export interface BrainContext {
  intent: BrainIntent;
  entities: string[];
  sections: BrainContextSection[];
  fullPrompt: string;          // Combined markdown for LLM system prompt
  confidence: number;          // 0-1, overall confidence in the context
  uncertainAreas: string[];    // What the brain doesn't know
  regionsUsed: string[];       // Which brain regions contributed
}

// =============================================================================
// INTENT DETECTION — Unified across all domains
// =============================================================================

const INTENT_PATTERNS: Array<{ intent: BrainIntent; patterns: RegExp[] }> = [
  // Structural intents
  {
    intent: 'onboarding',
    patterns: [
      /how does .+ work/i, /explain .+ (code|module|service|function|class|system|flow|logic)/i,
      /new to .+ (codebase|repo|project)/i, /what (is|does) .+ (do|handle|manage)/i,
      /walk me through/i, /architecture of/i, /overview of/i, /getting started/i,
      /understand .+ (code|codebase|system)/i, /tell me about .+ (module|service|code|system|feature)/i,
    ],
  },
  {
    intent: 'debugging',
    patterns: [
      /error in/i, /fails when/i, /root cause/i, /bug in/i, /debug/i,
      /why (does|is|did) .+ (fail|break|crash|error)/i, /trace .+ error/i,
      /stack trace/i, /what causes/i, /fix .+ issue/i, /not working/i,
    ],
  },
  {
    intent: 'incident',
    patterns: [
      /incident/i, /outage/i, /service .+ (down|unavailable)/i,
      /p[01] .+ (incident|issue|alert)/i, /production .+ (issue|error|failure)/i,
      /blast radius/i, /what .+ affected/i, /impact .+ (outage|failure)/i,
    ],
  },
  {
    intent: 'knowledge',
    patterns: [
      /who knows/i, /bus factor/i, /expertise/i, /expert on/i,
      /who (should|can) .+ (review|help|fix)/i, /knowledge .+ (transfer|retention|risk)/i,
      /single point of failure/i, /sole expert/i, /team .+ (knows|owns)/i,
    ],
  },
  {
    intent: 'review',
    patterns: [
      /review .+ (pr|pull request|change|commit)/i, /pr .+ (impact|affect|change)/i,
      /what (does|will) .+ (change|break|affect)/i, /impact (of|if) .+ change/i,
      /downstream .+ (impact|effect|consumers)/i, /who should review/i,
      /reviewer .+ (suggest|recommend)/i, /changes to/i, /what breaks/i,
    ],
  },
  // Causal intents
  {
    intent: 'whatif',
    patterns: [
      /what if/i, /what would happen/i, /simulate/i, /scenario/i,
      /if we (change|increase|decrease|stop|start|double|halve)/i,
      /impact of (changing|increasing|decreasing)/i,
    ],
  },
  {
    intent: 'predict',
    patterns: [
      /predict/i, /forecast/i, /project .+ (next|future)/i,
      /what will .+ (be|look like|happen)/i, /estimate .+ (next|future)/i,
      /trend .+ (next|coming|future)/i,
    ],
  },
  {
    intent: 'diagnose',
    patterns: [
      /diagnose/i, /why is .+ (declining|dropping|increasing|spiking)/i,
      /root cause .+ (decline|drop|increase|spike)/i,
      /investigate .+ (drop|decline|increase)/i,
      /what.s (wrong|causing|driving)/i,
    ],
  },
  {
    intent: 'cascade',
    patterns: [
      /cascade/i, /ripple effect/i, /chain reaction/i,
      /domino effect/i, /propagat/i, /downstream impact/i,
      /if .+ fails? .+ what .+ affected/i,
    ],
  },
  {
    intent: 'explain',
    patterns: [
      /explain/i, /why did/i, /how does .+ cause/i,
      /what is the (relationship|connection) between/i,
      /tell me about .+ (relationship|connection|link)/i,
      /how are .+ (related|connected|linked)/i,
    ],
  },
  // Introspective intents
  {
    intent: 'health',
    patterns: [
      /brain health/i, /data quality/i, /how (healthy|reliable|accurate)/i,
      /calibration/i, /cognitive load/i, /model (health|quality)/i,
    ],
  },
  {
    intent: 'uncertainty',
    patterns: [
      /uncertain/i, /confidence/i, /how sure/i, /reliable/i,
      /what .+ (don.t|do not) know/i, /knowledge gap/i,
      /where .+ (weak|unreliable)/i,
    ],
  },
];

export function detectIntent(question: string): BrainIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(question))) {
      return intent;
    }
  }
  return 'general';
}

// =============================================================================
// ENTITY EXTRACTION — Works for any domain
// =============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'how', 'when', 'where', 'why', 'if', 'then', 'else', 'so', 'but',
  'and', 'or', 'not', 'no', 'nor', 'for', 'with', 'without', 'about',
  'from', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'to', 'of', 'in', 'on', 'at', 'by', 'up', 'down', 'out',
  'off', 'over', 'under', 'again', 'further', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'than', 'too', 'very', 'just', 'because', 'as',
  'until', 'while', 'also', 'between', 'every', 'tell',
  'work', 'works', 'working', 'explain', 'show', 'tell', 'give',
  'help', 'find', 'look', 'see', 'know', 'understand', 'get',
  'make', 'use', 'using', 'does', 'happen', 'happens',
  'code', 'codebase', 'file', 'files', 'function', 'class',
  'system', 'project', 'repo', 'repository',
]);

/**
 * Extract entities from any question — works for code, finance, research, etc.
 *
 * Strategy:
 * 1. File paths (e.g., src/auth/handler.ts)
 * 2. Quoted identifiers (e.g., "@calcom/prisma", "churn_rate")
 * 3. Module/concept suffix patterns (e.g., "auth module", "revenue model")
 * 4. Fuzzy keyword fallback — meaningful nouns from natural language
 */
export function extractEntities(question: string): string[] {
  const entities: string[] = [];

  // Strategy 1: File paths
  const pathMatch = question.match(
    /[\w\-./]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|vue|svelte|sql|yaml|yml|json|toml)/gi
  );
  if (pathMatch) entities.push(...pathMatch);

  // Strategy 2: Quoted identifiers
  const quotedMatch = question.match(/[`"']([^`"']+)[`"']/g);
  if (quotedMatch) {
    for (const q of quotedMatch) {
      entities.push(q.replace(/[`"']/g, ''));
    }
  }

  // Strategy 3: Concept suffix patterns (code + business + research)
  const suffixes = [
    // code
    'module', 'service', 'handler', 'component', 'controller', 'package',
    'library', 'utility', 'helper', 'api', 'endpoint', 'feature', 'layer',
    'page', 'route', 'middleware', 'schema', 'model', 'database', 'table',
    'hook', 'context', 'provider', 'store', 'pipeline', 'engine', 'worker',
    // business
    'metric', 'kpi', 'indicator', 'signal', 'rate', 'ratio', 'score',
    'index', 'factor', 'coefficient', 'margin', 'revenue', 'cost',
    // research
    'paper', 'study', 'theory', 'hypothesis', 'experiment', 'dataset',
    // process
    'workflow', 'process', 'procedure', 'policy', 'rule', 'domain',
  ];
  const suffixPattern = new RegExp(
    `(?:the\\s+)?(\\w[\\w-]+)\\s+(?:${suffixes.join('|')})`,
    'gi'
  );
  const moduleMatch = question.match(suffixPattern);
  if (moduleMatch) {
    for (const m of moduleMatch) {
      const suffixRe = new RegExp(`\\s+(?:${suffixes.join('|')})$`, 'i');
      const name = m.replace(suffixRe, '').replace(/^the\s+/i, '').trim();
      if (name.length > 1) entities.push(name);
    }
  }

  // Strategy 4: Fuzzy keyword fallback — meaningful nouns
  if (entities.length === 0) {
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_@/]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    for (const word of words) {
      entities.push(word);
    }
  }

  return [...new Set(entities)];
}

// =============================================================================
// USE-CASE HINTS
// =============================================================================

function getIntentHint(intent: BrainIntent): string {
  switch (intent) {
    case 'onboarding':
      return 'Explain architecture, key modules, and who to ask for help. Be welcoming and thorough.';
    case 'debugging':
      return 'Trace upstream dependencies for root cause analysis. Show error propagation paths.';
    case 'incident':
      return 'Assess blast radius, identify affected services, and suggest expert contacts for each affected area.';
    case 'knowledge':
      return 'Show bus factor risks, expertise distribution, and suggest knowledge transfer actions.';
    case 'review':
      return 'Analyze impact of changes, suggest reviewers based on expertise, and flag risky downstream effects.';
    case 'explain':
      return 'Trace causal chains with evidence. Show which relationships are strongest.';
    case 'predict':
      return 'Show forecasts with confidence intervals. Note where the brain is uncertain.';
    case 'diagnose':
      return 'Identify root causes ranked by likelihood. Show the causal chain from cause to effect.';
    case 'whatif':
      return 'Show simulated impact with confidence bounds. Compare alternative interventions.';
    case 'cascade':
      return 'Show propagation paths, timing, and intervention opportunities.';
    case 'health':
      return 'Report on data quality, calibration, cognitive load, and areas needing improvement.';
    case 'uncertainty':
      return 'Show what the brain is most uncertain about, weakest relationships, and data gaps.';
    default:
      return '';
  }
}

// =============================================================================
// SECTION BUILDERS — One per brain region capability
// =============================================================================

function buildDependencySection(
  depGraph: KnowledgeDependencyGraphInstance,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  const stats = depGraph.getStats();
  if (stats.totalEdges === 0) return null;

  const lines: string[] = [
    `## Dependency Graph`,
    `- ${stats.totalEdges} edges across ${stats.uniqueEntities} entities`,
    `- Domains: ${Object.entries(stats.byDomain).map(([d, c]) => `${d}(${c})`).join(', ')}`,
    `- Cycles: ${stats.cycleCount}`,
  ];

  // Resolve entities via fuzzy search
  let resolvedIds: string[] = [];
  if (entities.length > 0) {
    // Try exact match first
    for (const entity of entities) {
      try {
        const impact = depGraph.analyzeImpact(entity);
        if (impact.totalImpactRadius > 0) resolvedIds.push(entity);
      } catch { /* not found */ }
    }
    // Fuzzy fallback
    if (resolvedIds.length === 0) {
      const fuzzy = depGraph.fuzzySearchEntities(entities, 10);
      resolvedIds = fuzzy.map((r) => r.entityId);
    }
  }

  // Impact analysis for resolved entities
  for (const entityId of resolvedIds.slice(0, 3)) {
    try {
      const impact = depGraph.analyzeImpact(entityId);
      if (impact.totalImpactRadius > 0) {
        lines.push('');
        lines.push(`### Impact: ${entityId}`);
        lines.push(`- Direct dependents: ${impact.directDependents.length}`);
        lines.push(`- Transitive impact radius: ${impact.totalImpactRadius}`);
        lines.push(`- Risk score: ${(impact.riskScore * 100).toFixed(0)}%`);
        lines.push(`- Affected domains: ${impact.affectedDomains.join(', ')}`);
        if (impact.criticalPaths.length > 0) {
          lines.push(`- Critical paths: ${impact.criticalPaths.slice(0, 3).map((p) => p.join(' → ')).join('; ')}`);
        }
      }
    } catch { /* not found */ }
  }

  // Intent-specific enrichments
  if (intent === 'onboarding') {
    const hubs = depGraph.getTopHubs(10);
    if (hubs.length > 0) {
      lines.push('', `### Architecture Hotspots:`);
      for (const hub of hubs) {
        const tag = hub.domain ? ` [${hub.domain}]` : '';
        lines.push(`  - ${hub.entityId} (fan-in: ${hub.fanIn}, fan-out: ${hub.fanOut})${tag}`);
      }
    }
    const domains = depGraph.getDomainBreakdown();
    if (domains.length > 0) {
      lines.push('', `### Domain Architecture:`);
      for (const d of domains.slice(0, 8)) {
        lines.push(`  - ${d.domain}: ${d.entityCount} entities`);
      }
    }
    if (resolvedIds.length > 0) {
      lines.push('', `### Entities matching "${entities.join(', ')}":`);
      for (const eid of resolvedIds.slice(0, 8)) {
        const domain = depGraph.mapEntityToDomain(eid);
        lines.push(`  - ${eid}${domain ? ` [${domain}]` : ''}`);
      }
    }
  }

  if (intent === 'debugging' || intent === 'incident') {
    for (const entityId of resolvedIds.slice(0, 3)) {
      const upstream = depGraph.queryDependencies({ entityId, direction: 'upstream', limit: 10 });
      if (upstream.length > 0) {
        lines.push('', `### Upstream deps of ${entityId} (potential root causes):`);
        for (const dep of upstream.slice(0, 8)) {
          lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
        }
      }
      if (intent === 'incident') {
        const downstream = depGraph.queryDependencies({ entityId, direction: 'downstream', limit: 10 });
        if (downstream.length > 0) {
          lines.push('', `### Downstream deps of ${entityId} (blast radius):`);
          for (const dep of downstream.slice(0, 8)) {
            lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
          }
        }
      }
    }
    if (resolvedIds.length === 0 && entities.length > 0) {
      const fuzzy = depGraph.fuzzySearchEntities(entities, 5);
      if (fuzzy.length > 0) {
        lines.push('', `### Entities matching "${entities.join(', ')}":`);
        for (const f of fuzzy) lines.push(`  - ${f.entityId}${f.domain ? ` [${f.domain}]` : ''}`);
      }
    }
  }

  if (intent === 'review') {
    for (const entityId of resolvedIds.slice(0, 2)) {
      const downstream = depGraph.queryDependencies({ entityId, direction: 'downstream', limit: 15 });
      if (downstream.length > 0) {
        lines.push('', `### Downstream consumers of ${entityId} (affected by changes):`);
        for (const dep of downstream.slice(0, 10)) {
          lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType})`);
        }
      }
    }
  }

  return {
    region: 'dependency-graph',
    title: '## Dependency Graph',
    content: lines.join('\n'),
    relevance: resolvedIds.length > 0 ? 0.9 : 0.5,
  };
}

function buildExpertiseSection(
  expertiseGraph: ExpertiseGraphInstance,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  const stats = expertiseGraph.getStats();
  if (stats.totalEdges === 0) return null;

  const lines: string[] = [
    `## Expertise Map`,
    `- ${stats.uniqueContributors} contributors across ${stats.uniqueTopics} topics`,
  ];

  // Find experts for entities
  const queried = new Set<string>();
  for (const entity of entities.slice(0, 5)) {
    if (queried.has(entity.toLowerCase())) continue;
    queried.add(entity.toLowerCase());
    const experts = expertiseGraph.queryExperts({ topic: entity, limit: 5 });
    if (experts.length > 0) {
      lines.push('', `### Experts for "${entity}":`);
      for (const exp of experts) {
        lines.push(`  - ${exp.contributorName || exp.contributorId} (strength: ${(exp.strength * 100).toFixed(0)}%, evidence: ${exp.evidenceCount} contributions)`);
      }
    }
  }

  // Bus factor warnings
  if (intent === 'knowledge' || intent === 'incident' || intent === 'onboarding') {
    const heatmap = expertiseGraph.getHeatmap(intent === 'knowledge' ? 30 : 15);
    if (intent === 'knowledge') {
      const singleExpert: string[] = [];
      for (const [topic, edges] of heatmap) {
        if (edges.length === 1 && edges[0].strength > 0.3) {
          singleExpert.push(`${topic} (only: ${edges[0].contributorName || edges[0].contributorId})`);
        }
      }
      if (singleExpert.length > 0) {
        lines.push('', `### Bus Factor Warnings (single expert):`);
        for (const t of singleExpert.slice(0, 10)) lines.push(`  - ⚠️ ${t}`);
      }
    }
    if (intent === 'onboarding') {
      lines.push('', `### Top Expertise Areas (who to ask):`);
      let shown = 0;
      for (const [topic, edges] of heatmap) {
        if (shown >= 10) break;
        const top = edges[0];
        lines.push(`  - ${topic}: ${edges.length} expert${edges.length > 1 ? 's' : ''}, top: ${top.contributorName || top.contributorId} (${(top.strength * 100).toFixed(0)}%)`);
        shown++;
      }
    }
  }

  return {
    region: 'expertise-graph',
    title: '## Expertise Map',
    content: lines.join('\n'),
    relevance: ['knowledge', 'incident', 'review', 'onboarding'].includes(intent) ? 0.9 : 0.5,
  };
}

function buildCollaborationSection(
  collabGraph: CollaborationGraphInstance,
  intent: BrainIntent,
): BrainContextSection | null {
  const stats = collabGraph.getNetworkStats();
  if (stats.totalEdges === 0) return null;

  const lines: string[] = [
    `## Collaboration Network`,
    `- ${stats.totalEdges} edges across ${stats.uniqueContributors} contributors`,
    `- Teams: ${stats.uniqueTeams}, Cross-team: ${stats.crossTeamEdges}`,
    `- Density: ${(stats.density * 100).toFixed(1)}%`,
  ];

  if (['incident', 'review', 'knowledge', 'onboarding'].includes(intent)) {
    const bridges = collabGraph.getBridgeContributors(5);
    if (bridges.length > 0) {
      lines.push('', `### Bridge Contributors (connect teams):`);
      for (const b of bridges) {
        lines.push(`  - ${b.contributor}: bridges ${b.teams.join(', ')} (${b.crossTeamEdges} cross-team edges)`);
      }
    }
  }

  if (intent === 'onboarding') {
    const crossTeam = collabGraph.getCrossTeamEdges();
    if (crossTeam.length > 0) {
      const teamPairs = new Map<string, number>();
      for (const edge of crossTeam.slice(0, 50)) {
        const pair = [edge.teamA || 'unknown', edge.teamB || 'unknown'].sort().join(' ↔ ');
        teamPairs.set(pair, (teamPairs.get(pair) || 0) + 1);
      }
      const sorted = Array.from(teamPairs.entries()).sort((a, b) => b[1] - a[1]);
      lines.push('', `### Cross-Team Collaboration:`);
      for (const [pair, count] of sorted.slice(0, 8)) {
        lines.push(`  - ${pair}: ${count} interactions`);
      }
    }
  }

  return {
    region: 'collaboration-graph',
    title: '## Collaboration Network',
    content: lines.join('\n'),
    relevance: ['knowledge', 'incident', 'onboarding'].includes(intent) ? 0.8 : 0.3,
  };
}

function buildMultiHopSection(
  reasoner: NonNullable<BrainRegions['multiHopReasoner']>,
  dag: CausalDAG,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  const lines: string[] = ['## Causal Reasoning'];

  try {
    if (intent === 'diagnose' && entities.length > 0) {
      const diagnosis = reasoner.diagnose(dag, entities[0]);
      if (diagnosis.topCauses.length > 0) {
        lines.push('', `### Root Cause Diagnosis for "${entities[0]}":`);
        lines.push(`${diagnosis.narrative}`);
        for (const cause of diagnosis.topCauses.slice(0, 5)) {
          lines.push(`  - ${cause.cause}: ${(cause.likelihood * 100).toFixed(0)}% likelihood (lag: ${cause.lagDays}d)`);
          lines.push(`    Path: ${cause.path.join(' → ')}`);
        }
      }
    }

    if ((intent === 'explain' || intent === 'cascade') && entities.length >= 2) {
      const prediction = reasoner.reason(dag, entities[0], entities[1]);
      if (prediction.paths.length > 0) {
        lines.push('', `### Causal Chain: ${entities[0]} → ${entities[1]}`);
        lines.push(`- Confidence: ${(prediction.confidence * 100).toFixed(0)}%`);
        lines.push(`- Estimated lag: ${prediction.estimatedLagDays} days`);
        for (const path of prediction.paths.slice(0, 3)) {
          lines.push(`  - ${path.nodes.join(' → ')} (strength: ${(path.strength * 100).toFixed(0)}%)`);
        }
      }
    }

    if (['explain', 'cascade', 'general'].includes(intent) && entities.length > 0) {
      const reachable = reasoner.findReachableDomains(dag, entities[0]);
      if (reachable.length > 0) {
        lines.push('', `### Domains reachable from "${entities[0]}":`);
        for (const r of reachable.slice(0, 8)) {
          lines.push(`  - ${r.domain}: ${(r.confidence * 100).toFixed(0)}% confidence, ${r.hops} hops, ~${r.lagDays}d lag`);
        }
      }
    }

    if (intent === 'debugging' && entities.length > 0) {
      const backward = reasoner.reasonBackward(dag, entities[0]);
      if (backward.length > 0) {
        lines.push('', `### Potential upstream causes of "${entities[0]}":`);
        for (const b of backward.slice(0, 5)) {
          lines.push(`  - ${b.cause}: ${(b.diagnosisConfidence * 100).toFixed(0)}% confidence`);
        }
      }
    }
  } catch { /* graceful degradation */ }

  if (lines.length <= 1) return null;

  return {
    region: 'multi-hop-reasoner',
    title: '## Causal Reasoning',
    content: lines.join('\n'),
    relevance: ['diagnose', 'explain', 'cascade', 'debugging'].includes(intent) ? 0.95 : 0.4,
  };
}

function buildCounterfactualSection(
  simulator: NonNullable<BrainRegions['counterfactualSimulator']>,
  dag: CausalDAG,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  if (intent !== 'whatif' && intent !== 'cascade') return null;
  const lines: string[] = ['## What-If Analysis'];

  try {
    if (entities.length > 0) {
      const result = simulator.whatIf(dag, {
        domain: entities[0],
        action: 'increase',
        magnitude: 0.1,
      });
      if (result.deltas && result.deltas.length > 0) {
        lines.push('', `### If "${entities[0]}" increases by 10%:`);
        for (const d of result.deltas.slice(0, 8)) {
          const dir = d.estimatedChange > 0 ? '↑' : '↓';
          lines.push(`  - ${d.domain}: ${dir} ${(Math.abs(d.estimatedChange) * 100).toFixed(1)}% (confidence: ${(d.confidence * 100).toFixed(0)}%)`);
        }
        if (result.narrative) lines.push('', result.narrative);
      }
    }

    const leverage = simulator.findLeveragePoints(dag);
    if (leverage.length > 0) {
      lines.push('', `### Highest Leverage Points:`);
      for (const lp of leverage.slice(0, 5)) {
        lines.push(`  - ${lp.domain}: leverage score ${lp.leverageScore.toFixed(2)}`);
      }
    }
  } catch { /* graceful degradation */ }

  if (lines.length <= 1) return null;

  return {
    region: 'counterfactual-simulator',
    title: '## What-If Analysis',
    content: lines.join('\n'),
    relevance: 0.9,
  };
}

function buildCascadeSection(
  tracker: NonNullable<BrainRegions['cascadeTracker']>,
  intent: BrainIntent,
): BrainContextSection | null {
  if (!['incident', 'cascade', 'diagnose'].includes(intent)) return null;

  try {
    const stats = tracker.getStats();
    if (stats.totalCascades === 0) return null;

    const lines: string[] = [
      `## Active Cascades`,
      `- Total: ${stats.totalCascades}, Active: ${stats.activeCascades}`,
      `- Intervention success rate: ${(stats.interventionSuccessRate * 100).toFixed(0)}%`,
    ];

    const active = tracker.getActiveCascades();
    for (const c of active.slice(0, 5)) {
      lines.push('');
      lines.push(`### Cascade: ${c.triggerDomain} → ${c.expectedPath.join(' → ')}`);
      lines.push(`  - Stage: ${c.currentStage}/${c.expectedPath.length}`);
      lines.push(`  - Probability: ${(c.probability * 100).toFixed(0)}%, Severity: ${(c.severityScore * 100).toFixed(0)}%`);
      lines.push(`  - Status: ${c.status}`);
    }

    return {
      region: 'cascade-tracker',
      title: '## Active Cascades',
      content: lines.join('\n'),
      relevance: 0.9,
    };
  } catch { return null; }
}

function buildHealthSection(
  monitor: BrainHealthMonitor,
  dag: CausalDAG | undefined,
  intent: BrainIntent,
): BrainContextSection | null {
  if (!['health', 'uncertainty', 'general'].includes(intent)) return null;
  if (!dag) return null;

  try {
    const lines: string[] = ['## Brain Health'];

    if (intent === 'health' || intent === 'general') {
      const report = monitor.generateHealthReport(dag, []);
      lines.push(`- Overall health: ${(report.overallHealth * 100).toFixed(0)}%`);
      lines.push(`- Cognitive load: ${report.cognitiveLoad?.overallLoad !== undefined ? (report.cognitiveLoad.overallLoad * 100).toFixed(0) + '%' : 'N/A'}`);

      const priorities = monitor.whatShouldIPrioritize(dag, []);
      if (priorities.length > 0) {
        lines.push('', `### Priority improvements:`);
        for (const p of priorities.slice(0, 5)) lines.push(`  - ${p}`);
      }
    }

    if (intent === 'uncertainty' || intent === 'health') {
      const uncertain = monitor.whatAmIMostUncertainAbout(dag, 5);
      if (uncertain.length > 0) {
        lines.push('', `### Most uncertain relationships:`);
        for (const u of uncertain) {
          lines.push(`  - ${u.source} → ${u.target}: uncertainty ${(u.uncertainty * 100).toFixed(0)}%`);
        }
      }

      const degrading = monitor.whereAmIDegrading();
      if (degrading.length > 0) {
        lines.push('', `### Degrading areas:`);
        for (const d of degrading.slice(0, 5)) {
          lines.push(`  - ${(d as { domain?: string }).domain || 'unknown'} (accuracy declining)`);
        }
      }
    }

    if (lines.length <= 1) return null;

    return {
      region: 'brain-health-monitor',
      title: '## Brain Health',
      content: lines.join('\n'),
      relevance: intent === 'health' ? 0.95 : 0.4,
    };
  } catch { return null; }
}

function buildUncertaintySection(
  quantifier: NonNullable<BrainRegions['uncertaintyQuantifier']>,
  dag: CausalDAG,
  intent: BrainIntent,
): BrainContextSection | null {
  if (!['uncertainty', 'health', 'review', 'predict'].includes(intent)) return null;

  try {
    const lines: string[] = ['## Uncertainty Analysis'];

    const quality = quantifier.computeDAGConfidenceQuality(dag);
    lines.push(`- DAG confidence quality: ${(quality.quality * 100).toFixed(0)}% (${quality.category})`);
    lines.push(`- Edges: ${quality.edgeCount}, High uncertainty: ${quality.highUncertaintyCount}`);

    const topUncertain = quantifier.findHighestUncertaintyEdges(dag, 5);
    if (topUncertain.length > 0) {
      lines.push('', `### Least certain relationships:`);
      for (const e of topUncertain) {
        lines.push(`  - ${e.source} → ${e.target}: ${(e.uncertainty * 100).toFixed(0)}% uncertain — ${e.reason}`);
      }
    }

    return {
      region: 'uncertainty-quantifier',
      title: '## Uncertainty Analysis',
      content: lines.join('\n'),
      relevance: intent === 'uncertainty' ? 0.95 : 0.5,
    };
  } catch { return null; }
}

function buildAttentionSection(
  attention: NonNullable<BrainRegions['attentionMechanism']>,
  dag: CausalDAG,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  if (!['explain', 'diagnose', 'predict', 'whatif'].includes(intent)) return null;
  if (entities.length === 0) return null;

  try {
    const summary = attention.summarizeAttention(dag, {
      focusDomains: entities.slice(0, 3),
      queryType: intent === 'predict' ? 'forecasting' : intent === 'whatif' ? 'what_if' : 'general',
    }, 5);

    if (summary.boosted.length === 0 && summary.dampened.length === 0) return null;

    const lines: string[] = ['## Attention-Weighted Analysis'];

    if (summary.boosted.length > 0) {
      lines.push('', `### Most relevant edges (boosted):`);
      for (const b of summary.boosted.slice(0, 5)) {
        lines.push(`  - ${b.source} → ${b.target}: ${b.baseWeight.toFixed(2)} → ${b.adjustedWeight.toFixed(2)} (${b.reasons.join(', ')})`);
      }
    }

    return {
      region: 'attention-mechanism',
      title: '## Attention-Weighted Analysis',
      content: lines.join('\n'),
      relevance: 0.6,
    };
  } catch { return null; }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createBrainContextBuilder(regions: BrainRegions) {
  /**
   * Build context from all available brain regions for the given question.
   * Automatically detects intent and queries only relevant regions.
   */
  function buildContext(question: string): BrainContext {
    const intent = detectIntent(question);
    const entities = extractEntities(question);
    const sections: BrainContextSection[] = [];
    const regionsUsed: string[] = [];
    const uncertainAreas: string[] = [];

    // ── Structural Intelligence ──
    if (regions.dependencyGraph) {
      const section = buildDependencySection(regions.dependencyGraph, intent, entities);
      if (section) { sections.push(section); regionsUsed.push('dependency-graph'); }
    }

    if (regions.expertiseGraph) {
      const section = buildExpertiseSection(regions.expertiseGraph, intent, entities);
      if (section) { sections.push(section); regionsUsed.push('expertise-graph'); }
    }

    if (regions.collaborationGraph) {
      const section = buildCollaborationSection(regions.collaborationGraph, intent);
      if (section) { sections.push(section); regionsUsed.push('collaboration-graph'); }
    }

    // ── Causal Intelligence (requires DAG) ──
    if (regions.causalDAG) {
      if (regions.multiHopReasoner) {
        const section = buildMultiHopSection(regions.multiHopReasoner, regions.causalDAG, intent, entities);
        if (section) { sections.push(section); regionsUsed.push('multi-hop-reasoner'); }
      }

      if (regions.counterfactualSimulator) {
        const section = buildCounterfactualSection(regions.counterfactualSimulator, regions.causalDAG, intent, entities);
        if (section) { sections.push(section); regionsUsed.push('counterfactual-simulator'); }
      }

      if (regions.cascadeTracker) {
        const section = buildCascadeSection(regions.cascadeTracker, intent);
        if (section) { sections.push(section); regionsUsed.push('cascade-tracker'); }
      }

      // ── Introspective Intelligence ──
      if (regions.brainHealthMonitor) {
        const section = buildHealthSection(regions.brainHealthMonitor, regions.causalDAG, intent);
        if (section) { sections.push(section); regionsUsed.push('brain-health-monitor'); }
      }

      if (regions.uncertaintyQuantifier) {
        const section = buildUncertaintySection(regions.uncertaintyQuantifier, regions.causalDAG, intent);
        if (section) { sections.push(section); regionsUsed.push('uncertainty-quantifier'); }
      }

      // ── Attention-Weighted Analysis ──
      if (regions.attentionMechanism) {
        const section = buildAttentionSection(regions.attentionMechanism, regions.causalDAG, intent, entities);
        if (section) { sections.push(section); regionsUsed.push('attention-mechanism'); }
      }
    } else {
      // Note: many brain regions need a CausalDAG
      if (regions.multiHopReasoner || regions.counterfactualSimulator || regions.uncertaintyQuantifier) {
        uncertainAreas.push('Causal DAG not loaded — multi-hop reasoning, counterfactual simulation, and uncertainty analysis are unavailable');
      }
    }

    // ── Track what's missing ──
    if (!regions.dependencyGraph) uncertainAreas.push('No dependency graph loaded — structural analysis unavailable');
    if (!regions.expertiseGraph) uncertainAreas.push('No expertise graph loaded — who-knows-what analysis unavailable');
    if (!regions.collaborationGraph) uncertainAreas.push('No collaboration graph loaded — team network analysis unavailable');

    // ── Compute confidence ──
    const maxPossibleRegions = 8; // dep, exp, collab, multihop, cf, cascade, health, uncertainty
    const confidence = Math.min(1, regionsUsed.length / maxPossibleRegions);

    // ── Sort sections by relevance ──
    sections.sort((a, b) => b.relevance - a.relevance);

    // ── Assemble full prompt ──
    const hint = getIntentHint(intent);
    const promptParts = [
      `# Brain Intelligence Context`,
      `**Intent detected:** ${intent}`,
      hint ? `**Focus:** ${hint}` : '',
      `**Brain regions active:** ${regionsUsed.join(', ') || 'none'}`,
      `**Confidence:** ${(confidence * 100).toFixed(0)}%`,
      '',
      ...sections.map((s) => s.content),
    ];

    if (uncertainAreas.length > 0) {
      promptParts.push('', '## Brain Limitations', ...uncertainAreas.map((u) => `- ${u}`));
    }

    const fullPrompt = promptParts.filter(Boolean).join('\n');

    return {
      intent,
      entities,
      sections,
      fullPrompt,
      confidence,
      uncertainAreas,
      regionsUsed,
    };
  }

  return {
    buildContext,
    detectIntent,
    extractEntities,
  };
}

export type BrainContextBuilder = ReturnType<typeof createBrainContextBuilder>;
