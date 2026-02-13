/**
 * Brain Knowledge Context — Runtime Brain Loader + Multi-Domain Query Router
 *
 * This is the missing bridge between the trained brain and the copilot.
 * Instead of dumping raw SQL results to Claude, this module:
 *
 *   1. Loads trained knowledge (causal graph + patterns + rules) either
 *      in-memory from TrainingPacks or from Supabase tables.
 *   2. Extracts relevant domains from user questions via keyword matching.
 *   3. Queries the TrainedKnowledgeQuerier across all relevant domains.
 *   4. Returns a structured BrainKnowledgeContext with all retrieved data.
 *   5. Formats everything into a rich, grounded LLM prompt.
 *
 * Two operational modes:
 *   a. "In-memory mode" — accepts TrainingPack[] directly (testing/development)
 *   b. "DB mode" — reconstructs from Supabase tables (production)
 *
 * @example In-memory mode
 * ```typescript
 * const ctx = createBrainKnowledgeContext({ mode: 'in-memory', packs: ALL_PACKS });
 * const knowledge = ctx.queryBrainKnowledge('Build me a cash flow model');
 * const prompt = ctx.formatBrainKnowledgeForPrompt(knowledge);
 * ```
 *
 * @example DB mode
 * ```typescript
 * const ctx = createBrainKnowledgeContext({
 *   mode: 'db',
 *   causalEdges: dbEdges,
 *   rules: dbRules,
 *   patterns: dbPatterns,
 * });
 * ```
 */

import { createBrainTrainer } from '../learning/brain-trainer';
import type { TrainingPack } from '../learning/brain-trainer';
import { createTrainedKnowledgeQuerier } from '../learning/trained-knowledge-querier';
import type {
  TrainedKnowledgeQuerier,
  CausalChainResult,
  CascadePathResult,
  MatchedRule,
  PatternResult,
  ImpactEstimate,
  KnowledgeSummary,
} from '../learning/trained-knowledge-querier';
import { createCausalGraphBuilder } from '../causality/causal-graph-builder';
import type { CausalEdge } from '../causality/causal-graph-builder';
import type { ConfidenceInterval } from '../causality/statistical-tests';
import { validatePattern, registerPattern } from '../learning/pattern-detector';
import type { DiscoveredPattern } from '../learning/pattern-detector';

// Import DOMAIN_KEYWORDS from the canonical source (brain-context-builder)
// and re-export for backward compatibility.
import { DOMAIN_KEYWORDS } from './brain-context-builder';
export { DOMAIN_KEYWORDS };

// ============================================================================
// TYPES
// ============================================================================

/** User intent classification */
export type UserIntent = 'build' | 'explain' | 'diagnose' | 'predict' | 'general';

/** Structured brain knowledge for a single query */
export interface BrainKnowledgeContext {
  /** The original question */
  question: string;
  /** Detected user intent */
  intent: UserIntent;
  /** Domains extracted from the question */
  extractedDomains: string[];
  /** The primary domain (most relevant) */
  primaryDomain: string;

  /** Direct causes per domain */
  directCauses: Record<string, CausalChainResult[]>;
  /** Direct effects per domain */
  directEffects: Record<string, CausalChainResult[]>;
  /** Patterns per domain */
  patterns: Record<string, PatternResult[]>;
  /** Cascade paths between domain pairs */
  cascadePaths: CascadePathResult[];
  /** Matched rules (if entityState provided) */
  matchedRules: MatchedRule[];
  /** Impact estimates per domain */
  impactEstimates: Record<string, ImpactEstimate>;

  /** Full brain summary */
  summary: KnowledgeSummary;

  /** Total counts for prompt header */
  totalCausalEdges: number;
  totalPatterns: number;
  totalRules: number;
  totalDomains: number;
}

/** DB-mode edge structure (flat rows from causal_relationships_statistical) */
export interface DBCausalEdge {
  source_domain: string;
  target_domain: string;
  effect_size: number;
  granger_p_value: number;
  optimal_lag_days: number;
  granger_f_statistic?: number;
  sample_size?: number;
  confidence_interval_lower?: number;
  confidence_interval_upper?: number;
  natural_language?: string;
  is_significant?: boolean;
}

/** DB-mode rule structure (from ai_memory with memory_type='rule') */
export interface DBRule {
  content: string;
  metadata?: Record<string, unknown>;
}

/** DB-mode pattern structure */
export interface DBPattern {
  name: string;
  domains: string[];
  description?: string;
  observed: number;
  expected: number;
  total: number;
}

// ============================================================================
// CONFIG
// ============================================================================

export interface BrainKnowledgeContextConfig {
  mode: 'in-memory' | 'db';
  /** For in-memory mode: training packs to load */
  packs?: TrainingPack[];
  /** For db mode: pre-fetched causal edges */
  causalEdges?: DBCausalEdge[];
  /** For db mode: pre-fetched rules (JSON content from ai_memory) */
  rules?: DBRule[];
  /** For db mode: pre-fetched patterns */
  patterns?: DBPattern[];
  /** Trainer config overrides */
  trainerConfig?: {
    defaultSampleSize?: number;
    defaultFStatistic?: number;
    autoActivateRules?: boolean;
  };
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create a brain knowledge context — the bridge between trained brain and copilot.
 */
export function createBrainKnowledgeContext(config: BrainKnowledgeContextConfig) {
  let querier: TrainedKnowledgeQuerier;

  if (config.mode === 'in-memory' && config.packs && config.packs.length > 0) {
    // Mode A: Train from packs in memory
    const trainer = createBrainTrainer({
      defaultSampleSize: config.trainerConfig?.defaultSampleSize ?? 200,
      defaultFStatistic: config.trainerConfig?.defaultFStatistic ?? 12.0,
      autoActivateRules: config.trainerConfig?.autoActivateRules ?? true,
    });

    for (const pack of config.packs) {
      trainer.trainInMemory(pack);
    }

    querier = createTrainedKnowledgeQuerier(
      trainer.getTrainedGraph(),
      trainer.getTrainedPatterns(),
      trainer.getTrainedRules() as any,
    );
  } else if (config.mode === 'db') {
    // Mode B: Reconstruct from DB data
    const graphBuilder = createCausalGraphBuilder();
    const patterns: DiscoveredPattern[] = [];
    const rules: Array<{
      id?: string;
      title: string;
      description?: string;
      entity_type: string;
      when: { logic: 'AND' | 'OR'; conditions: Array<{ field: string; operator: string; value: unknown }> };
      then: unknown[];
      is_active: boolean;
      natural_language?: string;
      naturalLanguage?: string;
    }> = [];

    // Load causal edges
    for (const dbEdge of config.causalEdges || []) {
      const ci: ConfidenceInterval = {
        lower: dbEdge.confidence_interval_lower ?? Math.max(0, dbEdge.effect_size - 0.1),
        upper: dbEdge.confidence_interval_upper ?? Math.min(1, dbEdge.effect_size + 0.1),
        level: 0.95,
      };
      const edge: CausalEdge = {
        source: dbEdge.source_domain,
        target: dbEdge.target_domain,
        effectSize: dbEdge.effect_size,
        confidenceInterval: ci,
        lagDays: dbEdge.optimal_lag_days,
        pValue: dbEdge.granger_p_value,
        fStatistic: dbEdge.granger_f_statistic ?? 8.0,
        sampleSize: dbEdge.sample_size ?? 100,
        discoveredAt: new Date(),
        lastValidated: new Date(),
        isActive: dbEdge.is_significant !== false,
      };
      graphBuilder.addEdge(edge);
    }

    if ((config.causalEdges || []).length > 0) {
      graphBuilder.recomputeGraphProperties();
    }

    // Load patterns
    for (const dbPat of config.patterns || []) {
      const evidence = validatePattern(dbPat.observed, dbPat.expected, dbPat.total, (config.patterns || []).length);
      const registered = registerPattern(
        dbPat.name,
        dbPat.description || dbPat.name,
        dbPat.domains,
        evidence,
      );
      patterns.push(registered);
    }

    // Load rules from JSON content
    for (const dbRule of config.rules || []) {
      try {
        const parsed = JSON.parse(dbRule.content);
        if (parsed && parsed.when && parsed.entity_type) {
          rules.push({
            id: parsed.id,
            title: parsed.title || 'Unnamed Rule',
            description: parsed.description,
            entity_type: parsed.entity_type,
            when: parsed.when,
            then: parsed.then || [],
            is_active: parsed.is_active !== false,
            natural_language: parsed.natural_language,
            naturalLanguage: parsed.naturalLanguage,
          });
        }
      } catch {
        // Skip malformed rules
      }
    }

    querier = createTrainedKnowledgeQuerier(
      graphBuilder.getGraph(),
      patterns,
      rules as any,
    );
  } else {
    // Fallback: empty brain
    const graphBuilder = createCausalGraphBuilder();
    querier = createTrainedKnowledgeQuerier(graphBuilder.getGraph(), [], []);
  }

  // ── Domain Extraction ──────────────────────────────────────────────────

  function extractDomains(question: string): string[] {
    const lower = question.toLowerCase();
    const domains: string[] = [];

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          if (!domains.includes(domain)) domains.push(domain);
          break;
        }
      }
    }

    // Fallback: if no domains detected, use 'finance' and 'strategy' as defaults
    if (domains.length === 0) {
      domains.push('finance', 'strategy');
    }

    return domains;
  }

  // ── Intent Detection ───────────────────────────────────────────────────

  function detectIntent(question: string): UserIntent {
    const lower = question.toLowerCase();

    const buildKeywords = ['build', 'create', 'design', 'model', 'template', 'generate', 'forecast model', 'spreadsheet', 'dashboard', 'formula', 'code'];
    const explainKeywords = ['explain', 'why', 'how does', 'what is', 'what are', 'describe', 'tell me about', 'understand'];
    const diagnoseKeywords = ['diagnose', 'debug', 'wrong', 'problem', 'issue', 'declining', 'dropping', 'increasing', 'why is', 'root cause', 'investigate'];
    const predictKeywords = ['predict', 'forecast', 'what would', 'what if', 'scenario', 'project', 'estimate', 'simulate', 'happen if'];

    if (buildKeywords.some(kw => lower.includes(kw))) return 'build';
    if (diagnoseKeywords.some(kw => lower.includes(kw))) return 'diagnose';
    if (predictKeywords.some(kw => lower.includes(kw))) return 'predict';
    if (explainKeywords.some(kw => lower.includes(kw))) return 'explain';

    return 'general';
  }

  // ── Entity State Normalizer ─────────────────────────────────────────────
  // Rules use canonical paths like metrics.arr, engineering.deploy_frequency...
  // Users pass domain-specific keys like finance.arr. This normalizer creates
  // a combined state object that satisfies BOTH naming conventions.

  function normalizeEntityState(raw: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...raw };

    // Map finance.* → metrics.* (company-type rules expect metrics.*)
    const finance = raw.finance as Record<string, unknown> | undefined;
    if (finance && typeof finance === 'object') {
      const metrics: Record<string, unknown> = {
        ...(raw.metrics as Record<string, unknown> || {}),
      };
      // Map common finance fields to metrics equivalents
      if (finance.arr !== undefined) metrics.arr = finance.arr;
      if (finance.arr_growth_rate !== undefined) {
        metrics.arr_growth_rate = finance.arr_growth_rate;
        metrics.arr_growth_pct = typeof finance.arr_growth_rate === 'number'
          ? finance.arr_growth_rate * 100
          : finance.arr_growth_rate;
      }
      if (finance.burn_multiple !== undefined) metrics.burn_multiple = finance.burn_multiple;
      if (finance.gross_margin !== undefined) {
        metrics.gross_margin = finance.gross_margin;
        metrics.gross_margin_pct = typeof finance.gross_margin === 'number'
          ? finance.gross_margin * 100
          : finance.gross_margin;
      }
      if (finance.cac_payback_months !== undefined) metrics.cac_payback_months = finance.cac_payback_months;
      if (finance.ltv_cac_ratio !== undefined) metrics.ltv_cac_ratio = finance.ltv_cac_ratio;
      if (finance.cash_runway_months !== undefined) {
        metrics.cash_runway_months = finance.cash_runway_months;
        metrics.runway_months = finance.cash_runway_months;
      }
      if (finance.rule_of_40_score !== undefined) metrics.rule_of_40_score = finance.rule_of_40_score;
      if (finance.revenue_per_employee !== undefined) metrics.revenue_per_employee = finance.revenue_per_employee;
      if (finance.ebitda_margin !== undefined) metrics.ebitda_margin = finance.ebitda_margin;
      if (finance.working_capital_ratio !== undefined) metrics.working_capital_ratio = finance.working_capital_ratio;
      if (finance.quick_ratio !== undefined) metrics.quick_ratio = finance.quick_ratio;
      normalized.metrics = metrics;
    }

    // Map cs.nrr → metrics.nrr (some rules use metrics.nrr)
    const cs = raw.cs as Record<string, unknown> | undefined;
    if (cs && typeof cs === 'object') {
      const metrics = normalized.metrics as Record<string, unknown> || {};
      if (cs.nrr !== undefined) metrics.nrr = cs.nrr;
      if (cs.logo_churn_rate_annual !== undefined) {
        metrics.logo_churn_rate_annual = cs.logo_churn_rate_annual;
        metrics.churn_rate = cs.logo_churn_rate_annual;
      }
      normalized.metrics = metrics;
    }

    // Map marketing.magic_number → metrics.magic_number
    const marketing = raw.marketing as Record<string, unknown> | undefined;
    if (marketing && typeof marketing === 'object') {
      const metrics = normalized.metrics as Record<string, unknown> || {};
      if (marketing.magic_number !== undefined) metrics.magic_number = marketing.magic_number;
      if (marketing.plg_revenue_pct !== undefined) metrics.plg_revenue_pct = marketing.plg_revenue_pct;
      if (marketing.cac !== undefined) metrics.cac = marketing.cac;
      normalized.metrics = metrics;
    }

    // Flatten top-level domain aliases (runway_months → metrics.runway_months)
    if (raw.runway_months !== undefined) {
      const metrics = normalized.metrics as Record<string, unknown> || {};
      metrics.runway_months = raw.runway_months;
      metrics.cash_runway_months = raw.runway_months;
      normalized.metrics = metrics;
    }

    // Map nrr.trailing_12m → metrics.nrr
    const nrr = raw.nrr as Record<string, unknown> | undefined;
    if (nrr && typeof nrr === 'object' && nrr.trailing_12m !== undefined) {
      const metrics = normalized.metrics as Record<string, unknown> || {};
      metrics.nrr = nrr.trailing_12m;
      normalized.metrics = metrics;
    }

    // Map grr.trailing_12m → metrics.grr
    const grr = raw.grr as Record<string, unknown> | undefined;
    if (grr && typeof grr === 'object' && grr.trailing_12m !== undefined) {
      const metrics = normalized.metrics as Record<string, unknown> || {};
      metrics.grr = grr.trailing_12m;
      normalized.metrics = metrics;
    }

    // Ensure company.* aliases for company-type rules
    if (!normalized.company) {
      normalized.company = { ...(finance || {}) };
    }

    return normalized;
  }

  // ── Main Query Function ────────────────────────────────────────────────

  function queryBrainKnowledge(
    question: string,
    entityState?: Record<string, unknown>,
  ): BrainKnowledgeContext {
    const extractedDomains = extractDomains(question);
    const intent = detectIntent(question);
    const primaryDomain = extractedDomains[0] || 'finance';

    // Gather per-domain knowledge
    const directCauses: Record<string, CausalChainResult[]> = {};
    const directEffects: Record<string, CausalChainResult[]> = {};
    const patterns: Record<string, PatternResult[]> = {};
    const impactEstimates: Record<string, ImpactEstimate> = {};

    for (const domain of extractedDomains) {
      directCauses[domain] = querier.findDirectCauses(domain);
      directEffects[domain] = querier.findDirectEffects(domain);
      patterns[domain] = querier.findPatternsForDomain(domain);
      impactEstimates[domain] = querier.estimateImpact(domain);
    }

    // Find cascade paths between domain pairs
    const cascadePaths: CascadePathResult[] = [];
    for (let i = 0; i < extractedDomains.length; i++) {
      for (let j = 0; j < extractedDomains.length; j++) {
        if (i === j) continue;
        const paths = querier.findCascadePaths(extractedDomains[i], extractedDomains[j]);
        cascadePaths.push(...paths);
      }
    }

    // Also find paths FROM common feeder domains TO the primary domain
    const feederDomains = ['marketing', 'cs', 'product', 'engineering', 'people'];
    for (const feeder of feederDomains) {
      if (!extractedDomains.includes(feeder)) {
        const paths = querier.findCascadePaths(feeder, primaryDomain);
        cascadePaths.push(...paths);
      }
    }

    // Deduplicate cascade paths by explanation
    const seenPaths = new Set<string>();
    const uniqueCascadePaths = cascadePaths.filter(p => {
      if (seenPaths.has(p.explanation)) return false;
      seenPaths.add(p.explanation);
      return true;
    });

    // Match rules if entityState provided (normalize first to map domain keys → rule paths)
    const normalizedState = entityState ? normalizeEntityState(entityState) : undefined;
    const matchedRules = normalizedState ? querier.matchRules(normalizedState) : [];

    // Full brain summary
    const summary = querier.summarize();

    return {
      question,
      intent,
      extractedDomains,
      primaryDomain,
      directCauses,
      directEffects,
      patterns,
      cascadePaths: uniqueCascadePaths,
      matchedRules,
      impactEstimates,
      summary,
      totalCausalEdges: summary.totalEdges,
      totalPatterns: summary.totalPatterns,
      totalRules: summary.totalRules,
      totalDomains: summary.totalDomains,
    };
  }

  // ── Prompt Formatter ───────────────────────────────────────────────────

  function formatBrainKnowledgeForPrompt(context: BrainKnowledgeContext): string {
    const sections: string[] = [];

    // Header
    sections.push(
      `## Brain Knowledge Context`,
      `Domains: ${context.extractedDomains.join(', ')} | ` +
      `Causal Edges: ${context.totalCausalEdges} | ` +
      `Patterns: ${context.totalPatterns} | ` +
      `Rules: ${context.totalRules} | ` +
      `Detected Intent: ${context.intent}`,
    );

    // Causal causes per domain
    for (const domain of context.extractedDomains) {
      const causes = context.directCauses[domain] || [];
      if (causes.length > 0) {
        sections.push(`\n### What DRIVES ${domain}? (Direct Causes)`);
        for (const c of causes.slice(0, 8)) {
          sections.push(
            `- ${c.source} -> ${domain}: effect=${(c.effectSize * 100).toFixed(1)}%, lag=${c.lagDays}d`,
          );
        }
      }
    }

    // Causal effects per domain
    for (const domain of context.extractedDomains) {
      const effects = context.directEffects[domain] || [];
      if (effects.length > 0) {
        sections.push(`\n### What does ${domain} AFFECT? (Direct Effects)`);
        for (const e of effects.slice(0, 8)) {
          sections.push(
            `- ${domain} -> ${e.target}: effect=${(e.effectSize * 100).toFixed(1)}%, lag=${e.lagDays}d`,
          );
        }
      }
    }

    // Patterns per domain
    for (const domain of context.extractedDomains) {
      const pats = context.patterns[domain] || [];
      if (pats.length > 0) {
        sections.push(`\n### Discovered Patterns in ${domain}`);
        for (const p of pats.slice(0, 10)) {
          sections.push(
            `- [significance: ${p.significance.toFixed(2)}] ${p.name}: ${p.description}`,
          );
        }
      }
    }

    // Cascade paths
    if (context.cascadePaths.length > 0) {
      sections.push(`\n### Cross-Domain Cascade Paths`);
      for (const p of context.cascadePaths.slice(0, 15)) {
        sections.push(`- ${p.explanation}`);
      }
    }

    // Matched rules
    const triggered = context.matchedRules.filter(r => r.triggered);
    if (triggered.length > 0) {
      sections.push(`\n### Triggered Business Rules`);
      for (const r of triggered) {
        sections.push(`- [FIRED] ${r.title}: ${r.naturalLanguage}`);
        sections.push(`  Conditions: ${r.conditions.join(' | ')}`);
      }
    }

    // Impact estimates
    for (const domain of context.extractedDomains) {
      const impact = context.impactEstimates[domain];
      if (impact && impact.affectedDomains.length > 0) {
        sections.push(`\n### Impact Analysis: ${domain}`);
        sections.push(`- Risk Level: ${impact.riskLevel.toUpperCase()}`);
        sections.push(`- Affected domains: ${impact.affectedDomains.join(', ')}`);
        sections.push(`- Cascade depth: ${impact.maxCascadeDepth} hops`);
        sections.push(`- Total effect magnitude: ${impact.totalEffectMagnitude.toFixed(2)}`);
        sections.push(`- Time to full cascade: ${impact.timeToFullCascade} days`);
      }
    }

    // Brain summary
    if (context.summary.strongestRelationships.length > 0) {
      sections.push(`\n### Strongest Relationships in Brain`);
      for (const r of context.summary.strongestRelationships.slice(0, 5)) {
        sections.push(
          `- ${r.source} -> ${r.target}: effect=${(r.effectSize * 100).toFixed(1)}%, lag=${r.lagDays}d`,
        );
      }
    }

    if (context.summary.mostInfluentialDomains.length > 0) {
      sections.push(`\n### Most Influential Domains`);
      for (const d of context.summary.mostInfluentialDomains.slice(0, 5)) {
        sections.push(
          `- ${d.domain}: influence=${d.influence.toFixed(2)}, pageRank=${d.pageRank.toFixed(4)}`,
        );
      }
    }

    return sections.join('\n');
  }

  // ── Build Intent-Aware System Prompt ───────────────────────────────────

  function buildBrainSystemPrompt(context: BrainKnowledgeContext): string {
    const brainContextText = formatBrainKnowledgeForPrompt(context);

    return `You are the FinanceJarvis copilot powered by NexusBrain. You have access to a trained causal knowledge graph with ${context.totalDomains} domains, ${context.totalCausalEdges} causal edges, ${context.totalRules} business rules, and ${context.totalPatterns} statistical patterns.

CRITICAL: When answering, you MUST use the brain's discovered parameters (effect sizes, lag days, p-values) from the context below. Do NOT use generic knowledge. Every claim must be grounded in the brain's data.

When the user asks to BUILD something (model, forecast, template):
- Use the brain's causal edges to define the model structure
- Use the brain's effect sizes as actual coefficients
- Use the brain's lag days as time delays
- Generate actual formulas or code using these numbers

When the user asks to EXPLAIN something:
- Cite specific causal edges with their statistics
- Reference matched patterns with their significance levels
- Quote the brain's discovered relationships, not generic advice

When the user asks to DIAGNOSE something:
- Walk the causal cascade paths step by step
- Show which rules fire and why
- Reference the impact analysis (risk level, affected domains)

When the user asks to PREDICT something:
- Use the brain's cascade paths to trace forward effects
- Use the impact estimates to quantify risk
- Reference specific effect sizes and lag days as parameters

${brainContextText}`;
  }

  return {
    queryBrainKnowledge,
    formatBrainKnowledgeForPrompt,
    buildBrainSystemPrompt,
    extractDomains,
    detectIntent,
    normalizeEntityState,
    getQuerier: () => querier,
  };
}

export type BrainKnowledgeContextInstance = ReturnType<typeof createBrainKnowledgeContext>;
