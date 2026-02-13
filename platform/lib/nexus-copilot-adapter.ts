/**
 * NexusBrain Generic Copilot Adapter
 * ====================================
 *
 * Bridges the existing DB-backed brain intelligence (causal edges, rules,
 * patterns, cascade rules, impact estimation) into the generic CopilotFramework.
 *
 * This adapter is used by the /api/copilot/chat route to optionally upgrade
 * from the V2 hand-built prompt to the framework's 3-layer architecture.
 *
 * KEY DIFFERENCE from Finance Jarvis adapter:
 *   - Finance Jarvis uses synthetic data → static analysis
 *   - NexusBrain uses DB-backed causal graph → dynamic knowledge
 *
 * Usage:
 *   import { createNexusBrainAdapter } from '@/lib/nexus-copilot-adapter';
 *   import { createCopilotInstance } from '@nexus-ai/memory-stack';
 *
 *   const adapter = createNexusBrainAdapter(brainData);
 *   const copilot = createCopilotInstance({ adapter, provider: 'anthropic', apiKey });
 */

import type {
  DomainAdapter,
  CopilotPersona,
  CopilotDataSnapshot,
  CopilotInsightBundle,
  CopilotIntent,
  CopilotAction,
  CopilotRisk,
  CopilotCausalEdge,
  CopilotScenario,
  DataPoint,
  BrainInsight,
  OutputSection,
} from '@nexus-ai/memory-stack';

// ============================================================================
// INPUT TYPES — matches the DB types from the copilot/chat route
// ============================================================================

export interface NexusBrainDBData {
  /** Causal edges from causal_relationships_statistical */
  causalEdges: Array<{
    source_domain: string;
    target_domain: string;
    effect_size: number;
    granger_p_value: number;
    optimal_lag_days: number;
    granger_f_statistic: number | null;
    sample_size: number | null;
    confidence_interval_lower: number | null;
    confidence_interval_upper: number | null;
    natural_language: string | null;
    is_significant: boolean | null;
  }>;

  /** Business rules from ai_memory (memory_type='rule') */
  rules: Array<{
    content: string;
    importance: number;
    domain: string;
    metadata: Record<string, unknown> | null;
  }>;

  /** Cascade rules from org_cascade_rules */
  cascadeRules: Array<{
    rule_name: string;
    trigger_domain: string;
    trigger_signal_type: string;
    propagation_chain: Array<{
      source_domain: string;
      target_domain: string;
      severity: string;
      reason_template?: string;
    }>;
    is_active: boolean;
  }>;

  /** Patterns from ai_memory (memory_type='pattern') */
  patterns: Array<{
    content: string;
    domain: string;
    importance: number;
    llm_pattern_name: string | null;
    llm_pattern_description: string | null;
    metadata: Record<string, unknown> | null;
  }>;

  /** User-provided entity state (optional) */
  entityState?: Record<string, unknown>;

  /** Detected domains from the user's message */
  detectedDomains: string[];

  /** Code intelligence context (optional) */
  codeIntelContext?: {
    fullPrompt: string;
  } | null;

  /** Action artifact from the domain action engine (optional) */
  actionArtifact?: Record<string, unknown> | null;

  /** Triggered rules from entity state evaluation (optional) */
  triggeredRules?: Array<{
    title: string;
    naturalLanguage: string;
    triggered: boolean;
    matchedConditions: string[];
    failedConditions: string[];
  }>;
}

// ============================================================================
// PERSONA
// ============================================================================

const NEXUS_BRAIN_PERSONA: CopilotPersona = {
  name: 'NexusBrain Copilot',
  role: 'AI-Powered Organizational Intelligence Engine — Cross-Domain Causal Analyst',
  expertise: [
    'Cross-domain causal analysis (Granger causality, PC algorithm, do-calculus)',
    'Business rule evaluation and cascade impact estimation',
    'Pattern detection across finance, growth, CS, marketing, product, engineering',
    'Multi-hop cascade path analysis through the causal knowledge graph',
    'Scenario modeling and impact quantification using brain parameters',
    'Code intelligence: dependency graphs, expertise mapping, collaboration patterns',
  ],
  responseStyle: 'Data-grounded, cite specific causal edges with effect sizes and p-values. Reference discovered patterns by name. Walk cascade paths step-by-step. Bold critical numbers and use markdown tables for data-dense sections.',
  dataSources: [
    'NexusBrain Causal Knowledge Graph (Supabase)',
    'Business Rules (trained from company data)',
    'Statistical Patterns (auto-discovered)',
    'Cascade Rules (org-configured alert chains)',
    'Code Intelligence (GitHub dependency & expertise graphs)',
  ],
  rules: [
    'Every claim must cite a causal edge, pattern, or rule from the brain',
    'Always quote effect sizes, p-values, and lag days when referencing causal relationships',
    'Walk cascade paths step-by-step when explaining cross-domain impacts',
    'If entity state is provided, reference triggered rules explicitly',
    'Never use generic advice — always ground in brain-discovered data',
  ],
};

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

/**
 * Create a NexusBrain domain adapter from the DB-backed brain data.
 *
 * @param data - The brain knowledge loaded from Supabase
 * @returns A DomainAdapter for the generic CopilotFramework
 */
export function createNexusBrainAdapter(data: NexusBrainDBData): DomainAdapter {
  const activeEdges = data.causalEdges.filter(e => e.is_significant !== false);
  const allDomains = new Set([
    ...activeEdges.map(e => e.source_domain),
    ...activeEdges.map(e => e.target_domain),
  ]);

  // Parse rules into structured format
  const parsedRules = parseRules(data.rules);

  return {
    domain: 'nexus-brain',
    displayName: 'NexusBrain Intelligence',
    persona: NEXUS_BRAIN_PERSONA,

    // ── CONTRACT 1: Data Snapshot ──────────────────────────────────────
    getDataSnapshot(): CopilotDataSnapshot {
      return {
        kpis: [
          mkDp('total_domains', 'Total Domains', allDomains.size, 'integer'),
          mkDp('causal_edges', 'Causal Edges', activeEdges.length, 'integer'),
          mkDp('business_rules', 'Business Rules', data.rules.length, 'integer'),
          mkDp('patterns', 'Statistical Patterns', data.patterns.length, 'integer'),
          mkDp('cascade_rules', 'Cascade Rules', data.cascadeRules.length, 'integer'),
          mkDp('detected_domains', 'Detected Domains', data.detectedDomains.join(', '), 'raw'),
        ],
        sections: {
          // Direct causes for each detected domain
          ...Object.fromEntries(
            data.detectedDomains.map(domain => {
              const causes = activeEdges
                .filter(e => e.target_domain === domain)
                .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
                .slice(0, 10);
              return [
                `What DRIVES ${domain}? (Direct Causes)`,
                causes.map(c =>
                  mkDp(
                    `${c.source_domain}_to_${domain}`,
                    `${c.source_domain} → ${domain}`,
                    c.effect_size,
                    'decimal',
                    undefined,
                    `effect=${(c.effect_size * 100).toFixed(1)}%, lag=${c.optimal_lag_days}d, p=${c.granger_p_value.toFixed(4)}${c.natural_language ? ' — ' + c.natural_language : ''}`
                  )
                ),
              ];
            })
          ),
          // Direct effects for each detected domain
          ...Object.fromEntries(
            data.detectedDomains.map(domain => {
              const effects = activeEdges
                .filter(e => e.source_domain === domain)
                .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
                .slice(0, 10);
              return [
                `What does ${domain} AFFECT? (Direct Effects)`,
                effects.map(e =>
                  mkDp(
                    `${domain}_to_${e.target_domain}`,
                    `${domain} → ${e.target_domain}`,
                    e.effect_size,
                    'decimal',
                    undefined,
                    `effect=${(e.effect_size * 100).toFixed(1)}%, lag=${e.optimal_lag_days}d, p=${e.granger_p_value.toFixed(4)}${e.natural_language ? ' — ' + e.natural_language : ''}`
                  )
                ),
              ];
            })
          ),
          // Strongest relationships globally
          'Strongest Relationships in Brain': [...activeEdges]
            .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
            .slice(0, 10)
            .map(e =>
              mkDp(
                `${e.source_domain}_${e.target_domain}`,
                `${e.source_domain} → ${e.target_domain}`,
                e.effect_size,
                'decimal',
                undefined,
                `${(e.effect_size * 100).toFixed(1)}%, lag=${e.optimal_lag_days}d, p=${e.granger_p_value.toFixed(4)}`
              )
            ),
          // Most influential domains
          'Most Influential Domains': computeInfluentialDomains(activeEdges),
        },
      };
    },

    // ── CONTRACT 2: Brain Insights ─────────────────────────────────────
    getInsights(): CopilotInsightBundle {
      const insights: BrainInsight[] = [];

      // Convert patterns to insights
      const relevantPatterns = data.patterns.filter(p =>
        data.detectedDomains.includes(p.domain) ||
        data.detectedDomains.some(d => p.content.toLowerCase().includes(d))
      );

      for (const [i, p] of relevantPatterns.slice(0, 12).entries()) {
        insights.push({
          id: `pattern_${i}`,
          severity: p.importance >= 0.8 ? 'high' : p.importance >= 0.5 ? 'medium' : 'low',
          category: p.domain,
          title: p.llm_pattern_name || `${p.domain} Pattern`,
          description: p.llm_pattern_description || p.content.substring(0, 300),
          confidence: p.importance,
          evidence: [],
        });
      }

      // Convert triggered rules to insights
      if (data.triggeredRules) {
        const fired = data.triggeredRules.filter(r => r.triggered);
        for (const [i, r] of fired.entries()) {
          insights.push({
            id: `rule_${i}`,
            severity: 'critical',
            category: 'rules',
            title: `🔴 RULE FIRED: ${r.title}`,
            description: `${r.naturalLanguage}. Matched conditions: ${r.matchedConditions.join(', ')}`,
            confidence: 1.0,
            evidence: [],
          });
        }

        // Near misses
        const nearMiss = data.triggeredRules.filter(r => !r.triggered && r.matchedConditions.length > 0);
        for (const [i, r] of nearMiss.slice(0, 5).entries()) {
          insights.push({
            id: `near_miss_${i}`,
            severity: 'medium',
            category: 'rules',
            title: `⚠️ Near-Miss: ${r.title}`,
            description: `Matched ${r.matchedConditions.length}/${r.matchedConditions.length + r.failedConditions.length} conditions. Failed: ${r.failedConditions.join(', ')}`,
            confidence: r.matchedConditions.length / (r.matchedConditions.length + r.failedConditions.length),
            evidence: [],
          });
        }
      }

      // Compute risks from cascade analysis
      const risks: CopilotRisk[] = data.detectedDomains.map(domain => {
        const impact = estimateImpact(domain, activeEdges);
        return {
          type: `cascade_${domain}`,
          description: `Changes in ${domain} cascade to ${impact.affectedDomains.length} other domains (depth: ${impact.maxCascadeDepth})`,
          probability: impact.riskLevel === 'critical' ? 'high' as const : impact.riskLevel === 'high' ? 'high' as const : impact.riskLevel === 'medium' ? 'medium' as const : 'low' as const,
          impact: `Total effect magnitude: ${impact.totalEffectMagnitude.toFixed(2)}, time to full cascade: ${impact.timeToFullCascade} days`,
          mitigation: `Monitor: ${impact.affectedDomains.slice(0, 5).join(', ')}`,
        };
      });

      // Build actions from rules
      const actions: CopilotAction[] = parsedRules.slice(0, 8).map((r, i) => ({
        action: r.title,
        rationale: r.naturalLanguage,
        timeline: 'short_term' as const,
        priority: r.importance >= 0.8 ? 'high' as const : 'medium' as const,
        detail: r.description,
      }));

      return {
        insights,
        risks,
        actions,
        bottomLine: `Brain Status: ${allDomains.size} domains, ${activeEdges.length} causal edges, ${parsedRules.length} rules, ${data.patterns.length} patterns. Domains analyzed: ${data.detectedDomains.join(', ')}.`,
      };
    },

    // ── CONTRACT 3: Output Sections ────────────────────────────────────
    getOutputSections(intent: CopilotIntent): OutputSection[] {
      const sections: OutputSection[] = [];

      // Section 1: Causal Landscape
      sections.push({
        id: 'causal_landscape',
        title: '🧠 CAUSAL LANDSCAPE — What the Brain Knows',
        type: 'table',
        priority: 1,
        required: true,
        instructions: 'Present the strongest causal relationships relevant to the user\'s question. For each, cite the exact effect size, lag days, and p-value. Explain what these relationships MEAN for the business.',
        data: {
          table: {
            title: 'Key Causal Relationships',
            columns: ['Source', 'Target', 'Effect Size', 'Lag (days)', 'p-value', 'Interpretation'],
            rows: activeEdges
              .filter(e =>
                data.detectedDomains.includes(e.source_domain) ||
                data.detectedDomains.includes(e.target_domain)
              )
              .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
              .slice(0, 15)
              .map(e => [
                e.source_domain,
                e.target_domain,
                `${(e.effect_size * 100).toFixed(1)}%`,
                String(e.optimal_lag_days),
                e.granger_p_value.toFixed(4),
                e.natural_language || '-',
              ]),
          },
        },
      });

      // Section 2: Discovered Patterns
      const relevantPatterns = data.patterns.filter(p =>
        data.detectedDomains.includes(p.domain) ||
        data.detectedDomains.some(d => p.content.toLowerCase().includes(d))
      );
      if (relevantPatterns.length > 0) {
        sections.push({
          id: 'patterns',
          title: '🔍 DISCOVERED PATTERNS — Brain-Detected Intelligence',
          type: 'table',
          priority: 2,
          required: true,
          instructions: 'Present each pattern with its domain, name, and description. Explain the business significance.',
          data: {
            table: {
              title: 'Statistical Patterns',
              columns: ['Domain', 'Pattern', 'Description'],
              rows: relevantPatterns.slice(0, 20).map(p => [
                p.domain,
                p.llm_pattern_name || 'Unnamed',
                (p.llm_pattern_description || p.content).substring(0, 150),
              ]),
            },
          },
        });
      }

      // Section 3: Business Rules
      if (parsedRules.length > 0) {
        sections.push({
          id: 'rules',
          title: '📏 BUSINESS RULES — Trained Intelligence',
          type: 'table',
          priority: 3,
          required: data.triggeredRules?.some(r => r.triggered) || false,
          instructions: 'Show trained business rules. If rules were triggered against entity state, highlight them prominently. Show near-misses with what conditions failed.',
          data: {
            table: {
              title: 'Business Rules',
              columns: ['Domain', 'Rule', 'Description'],
              rows: parsedRules.slice(0, 15).map(r => [
                r.domain,
                r.title,
                r.naturalLanguage.substring(0, 150),
              ]),
            },
          },
        });
      }

      // Section 4: Cascade Impact
      sections.push({
        id: 'cascade_impact',
        title: '🌊 CASCADE IMPACT — Cross-Domain Ripple Effects',
        type: 'table',
        priority: 4,
        required: true,
        instructions: 'For each detected domain, show its cascade impact: risk level, affected domains, cascade depth, total effect magnitude, and time to full cascade. Walk specific cascade paths step-by-step.',
        data: {
          table: {
            title: 'Cascade Impact Analysis',
            columns: ['Domain', 'Risk Level', 'Affected Domains', 'Max Depth', 'Effect Magnitude', 'Time to Cascade'],
            rows: data.detectedDomains.map(domain => {
              const impact = estimateImpact(domain, activeEdges);
              return [
                domain,
                impact.riskLevel.toUpperCase(),
                impact.affectedDomains.join(', ') || 'None',
                String(impact.maxCascadeDepth),
                impact.totalEffectMagnitude.toFixed(2),
                `${impact.timeToFullCascade}d`,
              ];
            }),
          },
        },
      });

      // Section 5: Active Cascade Rules
      const activeCascades = data.cascadeRules.filter(r => r.is_active);
      if (activeCascades.length > 0) {
        sections.push({
          id: 'cascade_rules',
          title: '⚡ ACTIVE CASCADE ALERT RULES',
          type: 'table',
          priority: 5,
          required: false,
          instructions: 'Show cascade alert rules that are currently active. Explain the propagation chains.',
          data: {
            table: {
              title: 'Cascade Alert Rules',
              columns: ['Rule', 'Trigger', 'Chain'],
              rows: activeCascades.slice(0, 10).map(r => [
                r.rule_name,
                `${r.trigger_domain} (${r.trigger_signal_type})`,
                r.propagation_chain.map(c => `${c.source_domain}→${c.target_domain}[${c.severity}]`).join(', '),
              ]),
            },
          },
        });
      }

      // Section 6: Recommendations
      sections.push({
        id: 'recommendations',
        title: '💡 BRAIN-POWERED RECOMMENDATIONS',
        type: 'narrative',
        priority: 6,
        required: true,
        instructions: 'Based on the causal relationships, patterns, and rules above, provide specific recommendations. Ground every recommendation in a specific brain-discovered parameter.',
        data: {
          narrative: `Use the causal edges, patterns, and rules to generate specific, data-grounded recommendations. Reference effect sizes when quantifying expected impact.`,
        },
      });

      // Section 7: Bottom Line
      sections.push({
        id: 'bottom_line',
        title: '📌 BOTTOM LINE',
        type: 'narrative',
        priority: 7,
        required: true,
        instructions: 'One paragraph synthesis grounding the answer in the brain\'s discovered intelligence. Bold the most important causal relationships and numbers.',
        data: {
          narrative: `Brain: ${allDomains.size} domains, ${activeEdges.length} causal edges. Domains analyzed: ${data.detectedDomains.join(', ')}.`,
        },
      });

      return sections;
    },

    // ── CONTRACT 4: Quality Rules ──────────────────────────────────────
    getQualityRules(): string[] {
      return [
        'Every claim must cite a specific causal edge with its effect_size, lag_days, and p-value',
        'When walking cascade paths, show each hop with the edge statistics',
        'Reference discovered patterns by their pattern name and domain',
        'If entity state was provided, explicitly mention which rules fired and which were near-misses',
        'When quantifying impact, use the brain\'s effect magnitudes and cascade depths',
        'Never give generic business advice — everything must come from the knowledge graph',
      ];
    },

    // ── CONTRACT 5: Intent Detection ───────────────────────────────────
    detectIntent(message: string): CopilotIntent {
      const lower = message.toLowerCase();

      if (/cascade|ripple|cross.?domain|domino|propagat/.test(lower)) return 'analyze';
      if (/why|root.?cause|declining|dropping|wrong|problem/.test(lower)) return 'diagnose';
      if (/forecast|predict|what.?if|scenario|simulate|happen.?if/.test(lower)) return 'predict';
      if (/build|create|model|template|generate|code/.test(lower)) return 'deep_dive';
      if (/compare|versus|vs|benchmark/.test(lower)) return 'compare';
      if (/recommend|should|suggest|improve|optimize/.test(lower)) return 'recommend';
      if (/summary|overview|brief|dashboard/.test(lower)) return 'summarize';
      if (/everything|comprehensive|full|detailed|deep.?dive/.test(lower)) return 'deep_dive';
      if (/explain|how.?does|what.?is|understand|tell.?me/.test(lower)) return 'analyze';

      return 'general';
    },

    // ── Optional: Causal Edges ─────────────────────────────────────────
    getCausalEdges(): CopilotCausalEdge[] {
      return activeEdges
        .filter(e =>
          data.detectedDomains.includes(e.source_domain) ||
          data.detectedDomains.includes(e.target_domain)
        )
        .slice(0, 30)
        .map(e => ({
          source: e.source_domain,
          target: e.target_domain,
          effectSize: e.effect_size,
          lagDays: e.optimal_lag_days,
          pValue: e.granger_p_value,
          naturalLanguage: e.natural_language || undefined,
        }));
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mkDp(
  key: string,
  label: string,
  value: string | number | boolean | null,
  format?: DataPoint['format'],
  trend?: DataPoint['trend'],
  trendLabel?: string,
): DataPoint {
  return { key, label, value, format, trend, trendLabel, domain: 'nexus-brain' };
}

interface ParsedRule {
  title: string;
  description: string;
  naturalLanguage: string;
  domain: string;
  importance: number;
}

/** Parse count for observability — tracks how many rules failed parsing */
let _parseRuleFailCount = 0;
export function getParseRuleFailCount(): number { return _parseRuleFailCount; }

function parseRules(rules: NexusBrainDBData['rules']): ParsedRule[] {
  const parsed: ParsedRule[] = [];
  _parseRuleFailCount = 0;
  for (const r of rules) {
    try {
      const p = JSON.parse(r.content);
      if (p && p.when && p.entity_type) {
        parsed.push({
          title: p.title || 'Untitled Rule',
          description: p.description || '',
          naturalLanguage: p.natural_language || p.naturalLanguage || p.description || '',
          domain: r.domain,
          importance: r.importance,
        });
      }
    } catch (err) {
      // Log but don't throw — malformed rules shouldn't crash the adapter
      _parseRuleFailCount++;
      console.warn(`[nexus-copilot-adapter] Failed to parse rule in domain "${r.domain}":`, err instanceof Error ? err.message : 'Invalid JSON');
    }
  }
  return parsed;
}

export interface ImpactEstimate {
  domain: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedDomains: string[];
  maxCascadeDepth: number;
  totalEffectMagnitude: number;
  timeToFullCascade: number;
}

/**
 * Estimate cascade impact from a domain through the causal graph.
 * Exported so the copilot/chat route can reuse instead of duplicating.
 */
export function estimateImpact(
  domain: string,
  edges: NexusBrainDBData['causalEdges']
): ImpactEstimate {
  const activeEdges = edges.filter(e => e.is_significant !== false);

  const adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>> = {};
  for (const e of activeEdges) {
    if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
    adjacency[e.source_domain].push({
      target: e.target_domain,
      effect: e.effect_size,
      lag: e.optimal_lag_days,
    });
  }

  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number; effectSoFar: number; lagSoFar: number }> = [
    { node: domain, depth: 0, effectSoFar: 1, lagSoFar: 0 },
  ];

  let maxDepth = 0;
  let totalEffect = 0;
  let maxLag = 0;

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.node) || item.depth > 4) continue;
    visited.add(item.node);

    if (item.depth > 0) {
      totalEffect += item.effectSoFar;
      maxDepth = Math.max(maxDepth, item.depth);
      maxLag = Math.max(maxLag, item.lagSoFar);
    }

    for (const neighbor of adjacency[item.node] || []) {
      if (!visited.has(neighbor.target)) {
        queue.push({
          node: neighbor.target,
          depth: item.depth + 1,
          effectSoFar: item.effectSoFar * neighbor.effect,
          lagSoFar: item.lagSoFar + neighbor.lag,
        });
      }
    }
  }

  const affectedDomains = [...visited].filter(d => d !== domain);
  const riskLevel: ImpactEstimate['riskLevel'] =
    affectedDomains.length >= 15 || totalEffect >= 10
      ? 'critical'
      : affectedDomains.length >= 8 || totalEffect >= 5
        ? 'high'
        : affectedDomains.length >= 4 || totalEffect >= 2
          ? 'medium'
          : 'low';

  return {
    domain,
    riskLevel,
    affectedDomains,
    maxCascadeDepth: maxDepth,
    totalEffectMagnitude: totalEffect,
    timeToFullCascade: maxLag,
  };
}

function computeInfluentialDomains(
  edges: NexusBrainDBData['causalEdges']
): DataPoint[] {
  const influence: Record<string, number> = {};
  for (const e of edges) {
    influence[e.source_domain] = (influence[e.source_domain] || 0) + Math.abs(e.effect_size);
  }

  return Object.entries(influence)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([domain, score]) =>
      mkDp(domain, domain, score, 'decimal', undefined, `influence=${score.toFixed(2)}`)
    );
}
