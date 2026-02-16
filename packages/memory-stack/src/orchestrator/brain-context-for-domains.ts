/**
 * Brain Context for SE-aaS Domains
 * ==================================
 *
 * THE CRITICAL DIFFERENTIATOR: Brain-Augmented Claude
 *
 * Claude is stateless. The Brain is memory.
 * When Claude operates THROUGH the Brain, it has:
 * - Organizational causal edges (what causes what in THIS org)
 * - Learned patterns (grammar rules the Brain discovered)
 * - Engineering velocity & bottleneck context
 * - Collaboration graph insights (who reviews whom, gatekeepers)
 * - Recent cross-domain signals (what happened this week)
 * - Entity resolution (mapping GitHub users to real people)
 *
 * This module formats Brain memory into Claude system prompts so
 * every P1 SE-aaS domain gets Brain-augmented intelligence, not
 * just stateless Claude.
 *
 * ARCHITECTURE:
 *   Brain Memory (15-layer cognitive stack)
 *     --> formatBrainContextForDomain()
 *       --> Injected into Claude system prompt
 *         --> Claude reasons WITH organizational memory
 *           --> Output is "Brain + Claude" not just "Claude"
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BrainContextForDomain {
  /** Organization ID */
  organizationId: string;
  /** L4: Causal edges the Brain has learned */
  causalEdges: CausalEdge[];
  /** L5: Grammar rules / patterns Brain discovered */
  patterns: GrammarPattern[];
  /** Whether cognitive stack data was loaded */
  cognitiveStackAvailable: boolean;
  /** Cross-domain engineering context */
  crossDomainContext: {
    engineering: {
      velocity: VelocitySnapshot | null;
      bottleneck: BottleneckSnapshot | null;
      recentSignals: EngineeringSignal[];
      signalCount: number;
    };
  };
}

export interface CausalEdge {
  source_signal: string;
  target_signal: string;
  strength: number;
  confidence: number;
  lag: number;
  p_value: number;
}

export interface GrammarPattern {
  rule_name: string;
  rule_body: string;
  confidence: number;
  domain: string;
}

export interface VelocitySnapshot {
  prs_merged: number;
  mean_pr_cycle_time_hours: number;
  pr_cycle_time_variance: number;
  open_pr_count: number;
  prs_per_engineer: number;
  snapshot_date: string;
}

export interface BottleneckSnapshot {
  bottleneck_risk_score: number;
  risk_level: string;
  reviewer_gini_coefficient: number;
  reviewer_hhi: number;
  top_reviewer_share: number;
  max_betweenness_centrality: number;
}

export interface EngineeringSignal {
  signal_type: string;
  signal_value: number;
  signal_metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// BRAIN CONTEXT FORMATTER
// ============================================================================

/**
 * Format Brain context into a system prompt section for Claude.
 *
 * This is the CRITICAL function that makes Claude "Brain-augmented" instead
 * of stateless. It injects organizational memory into every Claude call.
 *
 * @param brain - Brain context loaded by assembleBrainContext()
 * @param domainName - Which SE-aaS domain is calling (for domain-specific context)
 * @returns Formatted string to inject into Claude's system prompt
 */
export function formatBrainContextForDomain(
  brain: BrainContextForDomain | Record<string, any> | undefined,
  domainName: string
): string {
  if (!brain || !brain.cognitiveStackAvailable) {
    return '';
  }

  const sections: string[] = [];

  sections.push(`\n## NexusBrain Organizational Intelligence (Memory-Augmented)`);
  sections.push(`You are operating as part of NexusBrain's 15-layer cognitive stack, NOT as a stateless LLM.`);
  sections.push(`The Brain has learned the following about this organization through continuous observation:\n`);

  // ── CAUSAL EDGES ────────────────────────────────────────────────────────
  const causalEdges = brain.causalEdges as CausalEdge[] | undefined;
  if (causalEdges && causalEdges.length > 0) {
    sections.push(`### Brain-Learned Causal Relationships (L4 Causal Graph)`);
    sections.push(`The Brain has discovered these cause-effect relationships in this organization:`);

    const topEdges = causalEdges
      .filter((e) => e.confidence >= 0.5 && e.p_value < 0.1)
      .slice(0, 15);

    if (topEdges.length > 0) {
      for (const edge of topEdges) {
        const lag = edge.lag > 0 ? ` (${edge.lag}d lag)` : '';
        const direction = edge.strength > 0 ? '--->' : '---|';
        sections.push(
          `- ${edge.source_signal} ${direction} ${edge.target_signal} ` +
            `[strength: ${edge.strength.toFixed(2)}, confidence: ${(edge.confidence * 100).toFixed(0)}%${lag}]`
        );
      }
      sections.push(
        `\nUse these causal relationships to provide organization-specific insights, not generic advice.`
      );
    }
  }

  // ── GRAMMAR PATTERNS ────────────────────────────────────────────────────
  const patterns = brain.patterns as GrammarPattern[] | undefined;
  if (patterns && patterns.length > 0) {
    sections.push(`\n### Brain-Discovered Patterns (L5 Grammar Rules)`);
    sections.push(`The Brain has identified these organizational patterns:`);

    for (const pattern of patterns.slice(0, 10)) {
      sections.push(
        `- **${pattern.rule_name}** [${pattern.domain}]: ${pattern.rule_body} ` +
          `(confidence: ${(pattern.confidence * 100).toFixed(0)}%)`
      );
    }
    sections.push(
      `\nLeverage these patterns to contextualize your analysis with what the Brain has learned about this organization.`
    );
  }

  // ── ENGINEERING CONTEXT ──────────────────────────────────────────────────
  const eng = brain.crossDomainContext?.engineering;
  if (eng) {
    if (eng.velocity) {
      sections.push(`\n### Current Engineering Velocity (P0 Early Warning)`);
      sections.push(`- PRs merged (latest snapshot): ${eng.velocity.prs_merged}`);
      sections.push(
        `- Mean PR cycle time: ${eng.velocity.mean_pr_cycle_time_hours?.toFixed(1) || '?'}h`
      );
      sections.push(`- Open PR count: ${eng.velocity.open_pr_count || '?'}`);
      sections.push(
        `- PRs per engineer: ${eng.velocity.prs_per_engineer?.toFixed(1) || '?'}`
      );
      sections.push(`- Snapshot date: ${eng.velocity.snapshot_date || '?'}`);
    }

    if (eng.bottleneck) {
      sections.push(`\n### Bottleneck Risk Assessment (P0 Early Warning)`);
      sections.push(
        `- Bottleneck Risk Score: ${(eng.bottleneck.bottleneck_risk_score * 100).toFixed(0)}% (${eng.bottleneck.risk_level})`
      );
      sections.push(
        `- Reviewer Gini: ${eng.bottleneck.reviewer_gini_coefficient?.toFixed(2) || '?'} (0=equal, 1=concentrated)`
      );
      sections.push(
        `- Reviewer HHI: ${eng.bottleneck.reviewer_hhi?.toFixed(3) || '?'} (>0.25 = high concentration)`
      );
      sections.push(
        `- Top reviewer share: ${((eng.bottleneck.top_reviewer_share || 0) * 100).toFixed(0)}%`
      );
      sections.push(
        `- Max betweenness centrality: ${eng.bottleneck.max_betweenness_centrality?.toFixed(3) || '?'}`
      );
    }

    // ── RECENT SIGNALS ────────────────────────────────────────────────────
    const signals = eng.recentSignals;
    if (signals && signals.length > 0) {
      sections.push(
        `\n### Recent Engineering Signals (Last 7 Days — ${eng.signalCount} total)`
      );

      // Group by signal type for readability
      const grouped = new Map<string, number>();
      for (const s of signals) {
        grouped.set(s.signal_type, (grouped.get(s.signal_type) || 0) + 1);
      }
      for (const [type, count] of grouped) {
        sections.push(`- ${type}: ${count} signal(s)`);
      }

      // Show domain-specific signals for incident diagnosis
      if (
        domainName === 'incident-diagnosis' ||
        domainName === 'log-query' ||
        domainName === 'impact-analyze'
      ) {
        sections.push(`\nDetailed recent signals (most recent first):`);
        for (const s of signals.slice(0, 10)) {
          const meta = s.signal_metadata
            ? ` | ${JSON.stringify(s.signal_metadata).slice(0, 100)}`
            : '';
          sections.push(`- [${s.created_at}] ${s.signal_type}: ${s.signal_value}${meta}`);
        }
      }
    }
  }

  // ── BRAIN EVOLUTION CONTEXT ───────────────────────────────────────────
  const brainEvolution = (brain as Record<string, any>).brainEvolution;
  if (brainEvolution && brainEvolution.isLearning) {
    sections.push(`\n### Brain Evolution (Self-Learning Intelligence)`);
    sections.push(`The Brain is actively learning from this organization:`);
    sections.push(`- Intelligence Score: ${brainEvolution.intelligenceScore}/100`);
    sections.push(`- Prediction Accuracy: ${(brainEvolution.accuracy * 100).toFixed(0)}%`);
    sections.push(`- Calibration (Brier): ${brainEvolution.brierScore.toFixed(3)} (${brainEvolution.brierScore < 0.25 ? 'well-calibrated' : 'improving'})`);
    sections.push(`- Knowledge Base: ${brainEvolution.totalEdges} causal edges, ${brainEvolution.totalEvidence} verified predictions`);
    sections.push(`The Brain gets smarter with every interaction. Its predictions improve over time via Bayesian weight updates.`);
  }

  // ── BRAIN ACCURACY & TRACK RECORD ──────────────────────────────────────
  const brainAccuracy = (brain as Record<string, any>).brainAccuracy;
  if (brainAccuracy && brainAccuracy.totalPredictions > 0) {
    sections.push(`\n### Brain Track Record (Verified Predictions)`);
    sections.push(`Brain accuracy: ${(brainAccuracy.accuracy * 100).toFixed(0)}% (${brainAccuracy.correctPredictions}/${brainAccuracy.totalPredictions})`);
    if (brainAccuracy.recentTrackRecord?.length > 0) {
      sections.push(`Recent verified predictions:`);
      for (const p of brainAccuracy.recentTrackRecord.slice(0, 3)) {
        sections.push(`- [${p.wasCorrect ? '✓' : '✗'}] ${p.domain}: ${p.outcome} (${(p.confidence * 100).toFixed(0)}% confident)`);
      }
    }
  }

  // ── USER CORRECTIONS (highest-priority learning) ───────────────────────
  const userCorrections = (brain as Record<string, any>).userCorrections;
  if (userCorrections && userCorrections.length > 0) {
    sections.push(`\n### User-Verified Corrections (High-Priority Knowledge)`);
    sections.push(`Users have corrected the Brain on these topics — use these as ground truth:`);
    for (const c of userCorrections.slice(0, 3)) {
      sections.push(`- ${c.correction}`);
    }
  }

  // ── DOMAIN-SPECIFIC CONTEXT HINTS ──────────────────────────────────────
  sections.push(getDomainSpecificHint(domainName));

  // ── ATTRIBUTION INSTRUCTION ────────────────────────────────────────────
  sections.push(`\n### Attribution`);
  sections.push(
    `When providing analysis, explicitly reference Brain-learned insights where relevant. ` +
      `For example: "Based on the Brain's learned causal relationship between X and Y..." ` +
      `or "The Brain's pattern analysis shows that this organization typically..."`
  );
  sections.push(
    `This is Brain-augmented intelligence, not generic AI. Make that visible in your response.`
  );

  return sections.join('\n');
}

/**
 * Get domain-specific hints to include in the Brain context.
 */
function getDomainSpecificHint(domainName: string): string {
  switch (domainName) {
    case 'test-case-generator':
      return (
        `\n### Domain Hint: Test Case Generation\n` +
        `Use the Brain's causal edges to generate tests that target known fragile areas. ` +
        `If the Brain has learned that "deployment_frequency --> error_rate" with high confidence, ` +
        `generate extra regression tests around deployment-sensitive paths.`
      );

    case 'tdd-code-generator':
      return (
        `\n### Domain Hint: TDD Code Generation\n` +
        `Use the Brain's engineering velocity context to understand the team's coding patterns. ` +
        `If cycle time is high, generate simpler, more focused implementations. ` +
        `Reference Brain patterns to align with organizational coding standards.`
      );

    case 'incident-diagnosis':
      return (
        `\n### Domain Hint: Incident Diagnosis\n` +
        `CRITICAL: Use the Brain's causal graph to trace root causes through known relationships. ` +
        `If the Brain has learned "high_pr_cycle_time --> deployment_delay --> incident_rate", ` +
        `reference this chain in your diagnosis. Check recent engineering signals for correlating events. ` +
        `The Brain's bottleneck data reveals if a single reviewer is a SPOF that could delay fixes.`
      );

    case 'impact-analyze':
      return (
        `\n### Domain Hint: Impact Analysis\n` +
        `Use the Brain's causal graph to predict cascade effects. ` +
        `If the Brain has learned causal chains, trace how a change might cascade through ` +
        `the dependency chain. Reference bottleneck risk to assess if the change affects ` +
        `a critical reviewer or high-centrality contributor.`
      );

    case 'sql-analyzer':
      return (
        `\n### Domain Hint: SQL Analysis\n` +
        `If the Brain has learned patterns about database performance in this organization, ` +
        `use them to provide org-specific optimization advice rather than generic SQL best practices.`
      );

    case 'data-lineage':
      return (
        `\n### Domain Hint: Data Lineage\n` +
        `Use the Brain's learned causal relationships to enrich the lineage map. ` +
        `If the Brain has discovered data flow patterns (e.g., signal cascades), ` +
        `incorporate these into the lineage analysis.`
      );

    case 'log-query':
      return (
        `\n### Domain Hint: Log Analysis\n` +
        `Use the Brain's recent engineering signals to correlate log patterns with ` +
        `known organizational events (deployments, PR merges, bottleneck changes). ` +
        `The Brain's causal graph can help identify root causes from log symptoms.`
      );

    case 'dependency-upgrade':
      return (
        `\n### Domain Hint: Dependency Upgrade\n` +
        `Use the Brain's causal graph to understand how dependency changes cascade through ` +
        `the system. If the Brain has learned that certain dependency updates correlate with ` +
        `incident spikes, flag those as higher-risk upgrades. Reference bottleneck data to ` +
        `identify if the upgrade will affect a critical reviewer's area of expertise.`
      );

    case 'design-doc-generator':
      return (
        `\n### Domain Hint: Design Document Generation\n` +
        `Use the Brain's learned patterns and causal relationships to generate ` +
        `org-specific design documents. Reference the Brain's knowledge of team velocity, ` +
        `bottleneck patterns, and code structure to produce HLD/LLD documents that ` +
        `reflect this organization's architecture and conventions, not generic templates.`
      );

    case 'performance-profiler':
      return (
        `\n### Domain Hint: Performance Profiling\n` +
        `Use the Brain's engineering signals to correlate performance bottlenecks with ` +
        `organizational patterns. If the Brain's causal graph shows that "review_delays --> ` +
        `batch_deploys --> latency_spikes", use this to explain performance issues in context. ` +
        `Reference velocity data to assess if performance issues correlate with sprint pressure.`
      );

    case 'dead-code-detector':
      return (
        `\n### Domain Hint: Dead Code Detection\n` +
        `Use the Brain's engineering context to assess risk of dead code removal. ` +
        `If the Brain knows which code areas have high bottleneck risk (few reviewers), ` +
        `flag dead code in those areas as higher-risk to modify. Reference the Brain's ` +
        `causal graph to understand if unused code is part of a dormant cascade chain.`
      );

    default:
      return '';
  }
}

/**
 * Build the "brainAugmented" attribution block for domain results.
 * This makes it visible in the API response that the Brain was used.
 */
export function buildBrainAttribution(
  brain: BrainContextForDomain | Record<string, any> | undefined,
  domainName: string
): Record<string, unknown> {
  if (!brain || !brain.cognitiveStackAvailable) {
    return {
      brainAugmented: false,
      brainContext: 'Brain context not available (degraded mode)',
    };
  }

  const causalEdges = (brain.causalEdges as CausalEdge[]) || [];
  const patterns = (brain.patterns as GrammarPattern[]) || [];
  const eng = brain.crossDomainContext?.engineering;

  const evolution = (brain as Record<string, any>).brainEvolution;
  const accuracy = (brain as Record<string, any>).brainAccuracy;

  return {
    brainAugmented: true,
    brainLayers: {
      L4_causalEdges: causalEdges.length,
      L5_grammarPatterns: patterns.length,
      velocity: eng?.velocity ? 'loaded' : 'unavailable',
      bottleneck: eng?.bottleneck ? 'loaded' : 'unavailable',
      recentSignals: eng?.signalCount || 0,
    },
    brainEvolution: evolution ? {
      intelligenceScore: evolution.intelligenceScore,
      accuracy: evolution.accuracy,
      brierScore: evolution.brierScore,
      isLearning: evolution.isLearning,
    } : null,
    brainAccuracy: accuracy ? {
      predictionAccuracy: accuracy.accuracy,
      verifiedPredictions: accuracy.totalPredictions,
    } : null,
    attribution:
      `Analysis powered by NexusBrain's 15-layer cognitive stack. ` +
      `The Brain provided ${causalEdges.length} causal relationship(s) and ${patterns.length} learned pattern(s) ` +
      `to augment Claude's analysis with organizational intelligence.` +
      (evolution?.intelligenceScore ? ` Brain intelligence: ${evolution.intelligenceScore}/100.` : '') +
      (accuracy?.accuracy ? ` Prediction accuracy: ${(accuracy.accuracy * 100).toFixed(0)}%.` : ''),
  };
}
