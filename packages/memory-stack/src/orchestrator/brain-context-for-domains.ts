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

// ============================================================================
// FULL L1-L30 BRAIN CONTEXT FOR BRAIN AGENTS
// ============================================================================

/**
 * Full L1-L30 Brain Cycle Result types (imported inline to avoid circular deps).
 * These match the shapes from deep-pipeline-connector.ts, cognitive-stack.ts,
 * and leap-deep-layers.ts.
 */
interface FullCycleResultShape {
  organizationId: string;
  timestamp: number;
  totalDurationMs: number;
  brain: CognitiveCycleResultShape;
  deep: DeepCycleResultShape;
  feedback: {
    domainReclassifications: number;
    entityLinksFeedback: number;
    wisdomFeedback: number;
    interventionsFeedback: number;
    topologyFeedback: number;
    reverseFeedbackMs: number;
  };
  evolution: { predictionsEmitted: number; domainsTracked: number };
  observability: { layerRecords: number; signalsEmitted: number };
}

interface CognitiveCycleResultShape {
  immune: { signalsChecked: number; signalsPassed: number; signalsQuarantined: number; signalsRejected: number; avgQuality: number };
  dreaming: { associationsFound: number; surfacedInsights: number; crossDomainConnections: number };
  memory: { itemsEncoded: number; workingMemorySize: number; episodesRecorded: number };
  curiosity: { hypothesesGenerated: number; knowledgeGaps: number; explorationBudgetUsed: number };
  selfModel: { calibrationScore: number; weaknesses: string[]; suggestedModifications: number };
  mesh: { patternsContributed: number; collectivePatterns: number; conflicts: number };
  imagination: { hypothesesGenerated: number; scenariosPlanned: number; analogiesFound: number; topInsight: string };
  theoryOfMind: { userModelUpdated: boolean; predictedIntent: string; cognitiveState: string; perspective: string };
  temporal: { rhythmsDetected: number; goalsTracked: number; temporalHealth: string };
  redTeam: { predictionsTested: number; robustnessAvg: number; criticalWeaknesses: string[] };
  experimentation: { experimentsSuggested: number; topExperiment: string };
  planning: { goalsPlanned: number; feasiblePaths: number; topRecommendation: string };
  narrative: { summary?: string; sections?: Array<string | { heading?: string; body?: string; importance?: number; domain?: string }> } | null;
}

interface DeepCycleResultShape {
  domainHierarchy: { resourcesClassified: number; domainsActive: number; subDomainsDiscovered: number; crossDomainResources: number; reclassifications: number };
  entityLinking: { artifactsRegistered: number; linksDiscovered: number; crossSystemLinks: number; temporalCorrelations: number; storiesBuilt: number };
  orgTopology: { teamsIdentified: number; communicationPaths: number; silosDetected: number; bridgePeople: string[] };
  impactCascade: { cascadesModeled: number; domainsInCascade: number; customersAffected: number; highRiskItems: string[] };
  strategicSynthesis: { crossDomainInsights: number; strategicThemes: string[]; alignmentScore: number; blindSpots: string[] };
  resourceAllocation: { bottlenecks: string[]; overloadedTeams: string[]; underutilizedCapacity: string[]; recommendations: string[] };
  knowledgeTransfer: { silosFound: number; knowledgeGaps: string[]; bridgeOpportunities: string[]; transferScore: number };
  processMining: { workflowsDiscovered: number; bottleneckSteps: string[]; avgCycleTime: number; inefficiencies: string[] };
  predictiveStaffing: { hiringNeeds: string[]; retentionRisks: string[]; skillGaps: string[]; capacityForecast: string };
  competitiveIntel: { externalSignals: number; marketTrends: string[]; competitiveThreats: string[] };
  decisionAudit: { decisionsTracked: number; decisionQuality: number; reversedDecisions: number; lessonsLearned: string[] };
  orgLearningRate: { learningVelocity: number; repeatMistakes: number; improvementAreas: string[]; maturityLevel: string };
  crossOrgTransfer: { patternsAbsorbed: number; patternsContributed: number; transferEffectiveness: number };
  interventions: { recommended: Array<{ action: string; sourceDomain: string; targetDomain: string; expectedImpact: number; confidence: number; reasoning: string }> };
  wisdom: { principlesLearned: number; organizationalMemories: number; culturalPatterns: string[]; longTermTrends: string[] };
}

/**
 * Format FULL L1-L30 brain cycle output into a rich Claude system prompt.
 *
 * This is the upgraded version of formatBrainContextForDomain() that includes
 * ALL 30 layers, weighted by the agent's layerWeights configuration.
 *
 * Layers with weight > 0 get included. Weight controls detail level:
 *   - weight >= 0.7: Full detail (all fields, lists, insights)
 *   - weight >= 0.4: Summary (counts, top items, key insights)
 *   - weight > 0:    Minimal (single-line summary)
 *
 * @param fullCycleResult - The complete L1-L30 cycle result
 * @param layerWeights - Per-layer importance weights (0-1) from the agent definition
 * @param agentId - Which brain agent is requesting context
 * @returns Formatted string for Claude system prompt
 */
export function formatFullBrainContextForAgent(
  fullCycleResult: FullCycleResultShape,
  layerWeights: Partial<Record<number, number>>,
  agentId: string
): string {
  const sections: string[] = [];
  const brain = fullCycleResult.brain;
  const deep = fullCycleResult.deep;

  const w = (layer: number): number => layerWeights[layer] ?? 0;

  sections.push(`\n## NexusBrain 30-Layer Organizational Intelligence`);
  sections.push(`You are operating as Brain Agent "${agentId}" within NexusBrain's FULL 30-layer cognitive stack.`);
  sections.push(`This is NOT generic AI — every insight below was learned from this specific organization.\n`);

  // ── L1-L2: BRAINSTEM (always included) ────────────────────────────────────
  sections.push(`### Brainstem (L1-L2): Signal Ingestion & Causal Discovery`);
  sections.push(`- Signals processed: ${brain.immune.signalsChecked} checked, ${brain.immune.signalsPassed} passed quality filter`);
  sections.push(`- Signal quality: ${(brain.immune.avgQuality * 100).toFixed(0)}% average`);
  if (brain.immune.signalsQuarantined > 0) {
    sections.push(`- Quarantined: ${brain.immune.signalsQuarantined} suspicious signals filtered out`);
  }

  // ── L3: DEEP DREAMING ─────────────────────────────────────────────────────
  if (w(3) > 0) {
    sections.push(`\n### L3: Deep Dreaming — Subconscious Associations`);
    if (w(3) >= 0.7) {
      sections.push(`- Associations discovered: ${brain.dreaming.associationsFound}`);
      sections.push(`- Cross-domain connections: ${brain.dreaming.crossDomainConnections}`);
      sections.push(`- Surfaced insights: ${brain.dreaming.surfacedInsights}`);
      sections.push(`These are surprising connections the Brain found between seemingly unrelated domains.`);
    } else if (w(3) >= 0.4) {
      sections.push(`- ${brain.dreaming.associationsFound} associations found, ${brain.dreaming.crossDomainConnections} cross-domain connections`);
    } else {
      sections.push(`- ${brain.dreaming.associationsFound} dream associations active`);
    }
  }

  // ── L4: HIERARCHICAL MEMORY ────────────────────────────────────────────────
  if (w(4) > 0) {
    sections.push(`\n### L4: Hierarchical Memory — Organizational Memory`);
    sections.push(`- Items encoded: ${brain.memory.itemsEncoded}, Working memory: ${brain.memory.workingMemorySize}, Episodes recorded: ${brain.memory.episodesRecorded}`);
  }

  // ── L5: CURIOSITY ENGINE ───────────────────────────────────────────────────
  if (w(5) > 0) {
    sections.push(`\n### L5: Curiosity Engine — Knowledge Gaps & Hypotheses`);
    if (w(5) >= 0.7) {
      sections.push(`- Hypotheses generated: ${brain.curiosity.hypothesesGenerated}`);
      sections.push(`- Knowledge gaps identified: ${brain.curiosity.knowledgeGaps}`);
      sections.push(`- Exploration budget used: ${(brain.curiosity.explorationBudgetUsed * 100).toFixed(0)}%`);
      sections.push(`The Brain is actively curious about these gaps — use them to guide your analysis.`);
    } else if (w(5) >= 0.4) {
      sections.push(`- ${brain.curiosity.hypothesesGenerated} hypotheses, ${brain.curiosity.knowledgeGaps} knowledge gaps`);
    } else {
      sections.push(`- ${brain.curiosity.knowledgeGaps} knowledge gaps identified`);
    }
  }

  // ── L6: SELF-MODIFYING COGNITION ───────────────────────────────────────────
  if (w(6) > 0) {
    sections.push(`\n### L6: Self-Modifying Cognition — Brain Calibration`);
    if (w(6) >= 0.7) {
      sections.push(`- Calibration score: ${(brain.selfModel.calibrationScore * 100).toFixed(0)}%`);
      if (brain.selfModel.weaknesses.length > 0) {
        sections.push(`- Known weaknesses: ${brain.selfModel.weaknesses.join(', ')}`);
      }
      sections.push(`- Suggested modifications: ${brain.selfModel.suggestedModifications}`);
    } else {
      sections.push(`- Calibration: ${(brain.selfModel.calibrationScore * 100).toFixed(0)}%${brain.selfModel.weaknesses.length > 0 ? ` (${brain.selfModel.weaknesses.length} known weaknesses)` : ''}`);
    }
  }

  // ── L7: INTELLIGENCE MESH ─────────────────────────────────────────────────
  if (w(7) > 0) {
    sections.push(`\n### L7: Intelligence Mesh — Collective Intelligence`);
    sections.push(`- Patterns contributed: ${brain.mesh.patternsContributed}, Collective patterns: ${brain.mesh.collectivePatterns}, Conflicts: ${brain.mesh.conflicts}`);
  }

  // ── L8: CAUSAL IMAGINATION ─────────────────────────────────────────────────
  if (w(8) > 0) {
    sections.push(`\n### L8: Causal Imagination — Counterfactual Scenarios`);
    if (w(8) >= 0.7) {
      sections.push(`- Hypotheses generated: ${brain.imagination.hypothesesGenerated}`);
      sections.push(`- Scenarios planned: ${brain.imagination.scenariosPlanned}`);
      sections.push(`- Analogies found: ${brain.imagination.analogiesFound}`);
      if (brain.imagination.topInsight) {
        sections.push(`- Top insight: "${brain.imagination.topInsight}"`);
      }
      sections.push(`Use these counterfactual scenarios to stress-test your analysis.`);
    } else if (w(8) >= 0.4) {
      sections.push(`- ${brain.imagination.scenariosPlanned} scenarios, ${brain.imagination.analogiesFound} analogies`);
      if (brain.imagination.topInsight) sections.push(`- Top: "${brain.imagination.topInsight}"`);
    } else {
      sections.push(`- ${brain.imagination.scenariosPlanned} counterfactual scenarios available`);
    }
  }

  // ── L9: THEORY OF MIND ────────────────────────────────────────────────────
  if (w(9) > 0) {
    sections.push(`\n### L9: Theory of Mind — User/Stakeholder Model`);
    if (w(9) >= 0.7) {
      sections.push(`- User model updated: ${brain.theoryOfMind.userModelUpdated}`);
      sections.push(`- Predicted intent: ${brain.theoryOfMind.predictedIntent}`);
      sections.push(`- Cognitive state: ${brain.theoryOfMind.cognitiveState}`);
      sections.push(`- Perspective: ${brain.theoryOfMind.perspective}`);
    } else {
      sections.push(`- Intent: ${brain.theoryOfMind.predictedIntent}, State: ${brain.theoryOfMind.cognitiveState}`);
    }
  }

  // ── L10: TEMPORAL CONSCIOUSNESS ────────────────────────────────────────────
  if (w(10) > 0) {
    sections.push(`\n### L10: Temporal Consciousness — Rhythms & Goals`);
    if (w(10) >= 0.7) {
      sections.push(`- Rhythms detected: ${brain.temporal.rhythmsDetected}`);
      sections.push(`- Goals tracked: ${brain.temporal.goalsTracked}`);
      sections.push(`- Temporal health: ${brain.temporal.temporalHealth}`);
    } else {
      sections.push(`- ${brain.temporal.rhythmsDetected} rhythms, ${brain.temporal.goalsTracked} goals, Health: ${brain.temporal.temporalHealth}`);
    }
  }

  // ── L11: RED TEAM ──────────────────────────────────────────────────────────
  if (w(11) > 0) {
    sections.push(`\n### L11: Red Team — Adversarial Analysis`);
    if (w(11) >= 0.7) {
      sections.push(`- Predictions stress-tested: ${brain.redTeam.predictionsTested}`);
      sections.push(`- Average robustness: ${(brain.redTeam.robustnessAvg * 100).toFixed(0)}%`);
      if (brain.redTeam.criticalWeaknesses.length > 0) {
        sections.push(`- CRITICAL WEAKNESSES: ${brain.redTeam.criticalWeaknesses.join('; ')}`);
        sections.push(`Address these weaknesses in your analysis.`);
      }
    } else if (w(11) >= 0.4) {
      sections.push(`- Robustness: ${(brain.redTeam.robustnessAvg * 100).toFixed(0)}%, ${brain.redTeam.criticalWeaknesses.length} critical weaknesses`);
    } else {
      sections.push(`- Robustness: ${(brain.redTeam.robustnessAvg * 100).toFixed(0)}%`);
    }
  }

  // ── L12: EXPERIMENTATION ───────────────────────────────────────────────────
  if (w(12) > 0) {
    sections.push(`\n### L12: Experimentation — Suggested Experiments`);
    sections.push(`- ${brain.experimentation.experimentsSuggested} experiments suggested`);
    if (brain.experimentation.topExperiment) {
      sections.push(`- Top experiment: "${brain.experimentation.topExperiment}"`);
    }
  }

  // ── L14: GOAL-BACKWARD PLANNING ────────────────────────────────────────────
  if (w(14) > 0) {
    sections.push(`\n### L14: Goal-Backward Planning — Intervention Paths`);
    if (w(14) >= 0.7) {
      sections.push(`- Goals planned: ${brain.planning.goalsPlanned}`);
      sections.push(`- Feasible paths found: ${brain.planning.feasiblePaths}`);
      if (brain.planning.topRecommendation) {
        sections.push(`- Top recommendation: "${brain.planning.topRecommendation}"`);
      }
    } else {
      sections.push(`- ${brain.planning.goalsPlanned} goals, ${brain.planning.feasiblePaths} paths. Top: "${brain.planning.topRecommendation}"`);
    }
  }

  // ── L15: NARRATIVE INTELLIGENCE ────────────────────────────────────────────
  if (w(15) > 0 && brain.narrative) {
    sections.push(`\n### L15: Narrative Intelligence — Executive Summary`);
    if (brain.narrative.summary) {
      sections.push(brain.narrative.summary);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DEEP LAYERS (L16-L30) — Organizational Intelligence
  // ════════════════════════════════════════════════════════════════════════════

  // ── L16: DOMAIN HIERARCHY LEARNING ─────────────────────────────────────────
  if (w(16) > 0) {
    sections.push(`\n### L16: Domain Hierarchy — Organizational Structure`);
    if (w(16) >= 0.7) {
      sections.push(`- Resources classified: ${deep.domainHierarchy.resourcesClassified}`);
      sections.push(`- Active domains: ${deep.domainHierarchy.domainsActive}`);
      sections.push(`- Sub-domains discovered: ${deep.domainHierarchy.subDomainsDiscovered}`);
      sections.push(`- Cross-domain resources: ${deep.domainHierarchy.crossDomainResources}`);
      if (deep.domainHierarchy.reclassifications > 0) {
        sections.push(`- Reclassifications: ${deep.domainHierarchy.reclassifications} (domains are evolving)`);
      }
    } else {
      sections.push(`- ${deep.domainHierarchy.domainsActive} domains, ${deep.domainHierarchy.resourcesClassified} resources classified`);
    }
  }

  // ── L17: CROSS-SYSTEM ENTITY LINKER ────────────────────────────────────────
  if (w(17) > 0) {
    sections.push(`\n### L17: Entity Links — Cross-System Connections`);
    if (w(17) >= 0.7) {
      sections.push(`- Artifacts registered: ${deep.entityLinking.artifactsRegistered}`);
      sections.push(`- Links discovered: ${deep.entityLinking.linksDiscovered}`);
      sections.push(`- Cross-system links: ${deep.entityLinking.crossSystemLinks} (PR↔Jira↔Slack↔Deploy)`);
      sections.push(`- Temporal correlations: ${deep.entityLinking.temporalCorrelations}`);
      sections.push(`- Stories built: ${deep.entityLinking.storiesBuilt}`);
      sections.push(`Use these links to trace dependencies across systems.`);
    } else if (w(17) >= 0.4) {
      sections.push(`- ${deep.entityLinking.crossSystemLinks} cross-system links, ${deep.entityLinking.storiesBuilt} stories`);
    } else {
      sections.push(`- ${deep.entityLinking.crossSystemLinks} cross-system entity links`);
    }
  }

  // ── L18: ORGANIZATIONAL TOPOLOGY ───────────────────────────────────────────
  if (w(18) > 0) {
    sections.push(`\n### L18: Org Topology — Teams, Silos & Bridges`);
    if (w(18) >= 0.7) {
      sections.push(`- Teams identified: ${deep.orgTopology.teamsIdentified}`);
      sections.push(`- Communication paths: ${deep.orgTopology.communicationPaths}`);
      sections.push(`- Silos detected: ${deep.orgTopology.silosDetected}`);
      if (deep.orgTopology.bridgePeople.length > 0) {
        sections.push(`- Bridge people (connect teams): ${deep.orgTopology.bridgePeople.join(', ')}`);
      }
    } else {
      sections.push(`- ${deep.orgTopology.teamsIdentified} teams, ${deep.orgTopology.silosDetected} silos${deep.orgTopology.bridgePeople.length > 0 ? `, Bridges: ${deep.orgTopology.bridgePeople.join(', ')}` : ''}`);
    }
  }

  // ── L19: IMPACT CASCADE MODELER ────────────────────────────────────────────
  if (w(19) > 0) {
    sections.push(`\n### L19: Impact Cascade — Cross-Department Effects`);
    if (w(19) >= 0.7) {
      sections.push(`- Cascades modeled: ${deep.impactCascade.cascadesModeled}`);
      sections.push(`- Domains in cascade: ${deep.impactCascade.domainsInCascade}`);
      sections.push(`- Customers affected: ${deep.impactCascade.customersAffected}`);
      if (deep.impactCascade.highRiskItems.length > 0) {
        sections.push(`- HIGH RISK ITEMS: ${deep.impactCascade.highRiskItems.join('; ')}`);
      }
      sections.push(`Use cascade data to predict downstream effects of any change.`);
    } else if (w(19) >= 0.4) {
      sections.push(`- ${deep.impactCascade.cascadesModeled} cascades, ${deep.impactCascade.highRiskItems.length} high-risk items`);
    } else {
      sections.push(`- ${deep.impactCascade.cascadesModeled} impact cascades modeled`);
    }
  }

  // ── L20: STRATEGIC SYNTHESIS ───────────────────────────────────────────────
  if (w(20) > 0) {
    sections.push(`\n### L20: Strategic Synthesis — C-Level Intelligence`);
    if (w(20) >= 0.7) {
      sections.push(`- Cross-domain insights: ${deep.strategicSynthesis.crossDomainInsights}`);
      sections.push(`- Alignment score: ${(deep.strategicSynthesis.alignmentScore * 100).toFixed(0)}%`);
      if (deep.strategicSynthesis.strategicThemes.length > 0) {
        sections.push(`- Strategic themes: ${deep.strategicSynthesis.strategicThemes.join('; ')}`);
      }
      if (deep.strategicSynthesis.blindSpots.length > 0) {
        sections.push(`- BLIND SPOTS: ${deep.strategicSynthesis.blindSpots.join('; ')}`);
      }
    } else if (w(20) >= 0.4) {
      sections.push(`- Alignment: ${(deep.strategicSynthesis.alignmentScore * 100).toFixed(0)}%, ${deep.strategicSynthesis.strategicThemes.length} themes, ${deep.strategicSynthesis.blindSpots.length} blind spots`);
    } else {
      sections.push(`- Strategic alignment: ${(deep.strategicSynthesis.alignmentScore * 100).toFixed(0)}%`);
    }
  }

  // ── L21: RESOURCE ALLOCATION OPTIMIZER ─────────────────────────────────────
  if (w(21) > 0) {
    sections.push(`\n### L21: Resource Allocation — Capacity & Bottlenecks`);
    if (w(21) >= 0.7) {
      if (deep.resourceAllocation.bottlenecks.length > 0) {
        sections.push(`- Bottlenecks: ${deep.resourceAllocation.bottlenecks.join('; ')}`);
      }
      if (deep.resourceAllocation.overloadedTeams.length > 0) {
        sections.push(`- Overloaded teams: ${deep.resourceAllocation.overloadedTeams.join(', ')}`);
      }
      if (deep.resourceAllocation.underutilizedCapacity.length > 0) {
        sections.push(`- Underutilized capacity: ${deep.resourceAllocation.underutilizedCapacity.join(', ')}`);
      }
      if (deep.resourceAllocation.recommendations.length > 0) {
        sections.push(`- Recommendations: ${deep.resourceAllocation.recommendations.join('; ')}`);
      }
    } else {
      sections.push(`- ${deep.resourceAllocation.bottlenecks.length} bottlenecks, ${deep.resourceAllocation.overloadedTeams.length} overloaded teams`);
    }
  }

  // ── L22: KNOWLEDGE TRANSFER DETECTOR ───────────────────────────────────────
  if (w(22) > 0) {
    sections.push(`\n### L22: Knowledge Transfer — Silos & Bridges`);
    sections.push(`- Silos: ${deep.knowledgeTransfer.silosFound}, Transfer score: ${(deep.knowledgeTransfer.transferScore * 100).toFixed(0)}%`);
    if (w(22) >= 0.4 && deep.knowledgeTransfer.knowledgeGaps.length > 0) {
      sections.push(`- Gaps: ${deep.knowledgeTransfer.knowledgeGaps.slice(0, 5).join('; ')}`);
    }
  }

  // ── L23: PROCESS MINING ────────────────────────────────────────────────────
  if (w(23) > 0) {
    sections.push(`\n### L23: Process Mining — Workflow Patterns`);
    if (w(23) >= 0.7) {
      sections.push(`- Workflows discovered: ${deep.processMining.workflowsDiscovered}`);
      sections.push(`- Average cycle time: ${deep.processMining.avgCycleTime.toFixed(1)} days`);
      if (deep.processMining.bottleneckSteps.length > 0) {
        sections.push(`- Bottleneck steps: ${deep.processMining.bottleneckSteps.join('; ')}`);
      }
      if (deep.processMining.inefficiencies.length > 0) {
        sections.push(`- Inefficiencies: ${deep.processMining.inefficiencies.join('; ')}`);
      }
    } else if (w(23) >= 0.4) {
      sections.push(`- ${deep.processMining.workflowsDiscovered} workflows, ${deep.processMining.avgCycleTime.toFixed(1)}d avg cycle, ${deep.processMining.bottleneckSteps.length} bottlenecks`);
    } else {
      sections.push(`- ${deep.processMining.workflowsDiscovered} workflows, ${deep.processMining.avgCycleTime.toFixed(1)}d avg cycle`);
    }
  }

  // ── L24: PREDICTIVE STAFFING ───────────────────────────────────────────────
  if (w(24) > 0) {
    sections.push(`\n### L24: Predictive Staffing`);
    if (deep.predictiveStaffing.hiringNeeds.length > 0) {
      sections.push(`- Hiring needs: ${deep.predictiveStaffing.hiringNeeds.join('; ')}`);
    }
    if (deep.predictiveStaffing.retentionRisks.length > 0) {
      sections.push(`- Retention risks: ${deep.predictiveStaffing.retentionRisks.join('; ')}`);
    }
    if (deep.predictiveStaffing.capacityForecast) {
      sections.push(`- Forecast: ${deep.predictiveStaffing.capacityForecast}`);
    }
  }

  // ── L25: COMPETITIVE INTELLIGENCE ──────────────────────────────────────────
  if (w(25) > 0 && deep.competitiveIntel.externalSignals > 0) {
    sections.push(`\n### L25: Competitive Intelligence`);
    sections.push(`- External signals: ${deep.competitiveIntel.externalSignals}`);
    if (deep.competitiveIntel.marketTrends.length > 0) {
      sections.push(`- Market trends: ${deep.competitiveIntel.marketTrends.join('; ')}`);
    }
  }

  // ── L26: DECISION AUDIT TRAIL ──────────────────────────────────────────────
  if (w(26) > 0) {
    sections.push(`\n### L26: Decision Audit — Quality & Lessons`);
    sections.push(`- Decisions tracked: ${deep.decisionAudit.decisionsTracked}, Quality: ${(deep.decisionAudit.decisionQuality * 100).toFixed(0)}%`);
    if (w(26) >= 0.4 && deep.decisionAudit.lessonsLearned.length > 0) {
      sections.push(`- Lessons: ${deep.decisionAudit.lessonsLearned.slice(0, 3).join('; ')}`);
    }
  }

  // ── L27: ORGANIZATIONAL LEARNING RATE ──────────────────────────────────────
  if (w(27) > 0) {
    sections.push(`\n### L27: Org Learning Rate`);
    sections.push(`- Maturity: ${deep.orgLearningRate.maturityLevel}, Learning velocity: ${deep.orgLearningRate.learningVelocity.toFixed(2)}, Repeat mistakes: ${deep.orgLearningRate.repeatMistakes}`);
    if (w(27) >= 0.4 && deep.orgLearningRate.improvementAreas.length > 0) {
      sections.push(`- Improvement areas: ${deep.orgLearningRate.improvementAreas.join('; ')}`);
    }
  }

  // ── L28: CROSS-ORG PATTERN TRANSFER ────────────────────────────────────────
  if (w(28) > 0) {
    sections.push(`\n### L28: Cross-Org Transfer`);
    sections.push(`- Patterns absorbed: ${deep.crossOrgTransfer.patternsAbsorbed}, Contributed: ${deep.crossOrgTransfer.patternsContributed}, Effectiveness: ${(deep.crossOrgTransfer.transferEffectiveness * 100).toFixed(0)}%`);
  }

  // ── L29: INTERVENTION RECOMMENDER ──────────────────────────────────────────
  if (w(29) > 0 && deep.interventions.recommended.length > 0) {
    sections.push(`\n### L29: Intervention Recommender — Actionable Recommendations`);
    const limit = w(29) >= 0.7 ? 5 : 3;
    for (const rec of deep.interventions.recommended.slice(0, limit)) {
      if (w(29) >= 0.7) {
        sections.push(`- **${rec.action}**: ${rec.sourceDomain} → ${rec.targetDomain} (impact: ${(rec.expectedImpact * 100).toFixed(0)}%, confidence: ${(rec.confidence * 100).toFixed(0)}%)`);
        sections.push(`  Reasoning: ${rec.reasoning}`);
      } else {
        sections.push(`- ${rec.action} (${rec.sourceDomain}→${rec.targetDomain}, ${(rec.confidence * 100).toFixed(0)}% conf)`);
      }
    }
    sections.push(`Incorporate these Brain recommendations into your analysis.`);
  }

  // ── L30: WISDOM LAYER ──────────────────────────────────────────────────────
  if (w(30) > 0) {
    sections.push(`\n### L30: Wisdom — Organizational Principles & Culture`);
    if (w(30) >= 0.7) {
      sections.push(`- Principles learned: ${deep.wisdom.principlesLearned}`);
      sections.push(`- Organizational memories: ${deep.wisdom.organizationalMemories}`);
      if (deep.wisdom.culturalPatterns.length > 0) {
        sections.push(`- Cultural patterns: ${deep.wisdom.culturalPatterns.join('; ')}`);
      }
      if (deep.wisdom.longTermTrends.length > 0) {
        sections.push(`- Long-term trends: ${deep.wisdom.longTermTrends.join('; ')}`);
      }
      sections.push(`These are deep organizational truths. Respect them in your recommendations.`);
    } else if (w(30) >= 0.4) {
      sections.push(`- ${deep.wisdom.principlesLearned} principles, ${deep.wisdom.culturalPatterns.length} cultural patterns, ${deep.wisdom.longTermTrends.length} trends`);
    } else {
      sections.push(`- ${deep.wisdom.principlesLearned} wisdom principles active`);
    }
  }

  // ── CYCLE METADATA ─────────────────────────────────────────────────────────
  sections.push(`\n### Brain Cycle Metadata`);
  sections.push(`- Full L1-L30 cycle completed in ${fullCycleResult.totalDurationMs}ms`);
  sections.push(`- Feedback loops: ${fullCycleResult.feedback.domainReclassifications} reclassifications, ${fullCycleResult.feedback.wisdomFeedback} wisdom feedbacks`);
  sections.push(`- Predictions emitted: ${fullCycleResult.evolution.predictionsEmitted}`);

  // ── ATTRIBUTION INSTRUCTION ────────────────────────────────────────────────
  sections.push(`\n### Attribution`);
  sections.push(
    `When providing analysis, explicitly reference Brain-learned insights where relevant. ` +
    `For example: "Based on L19 Impact Cascade, changing X will cascade to Y..." ` +
    `or "L17 Entity Links show PR #342 connects to Jira-789 and Slack thread #incident..."`
  );
  sections.push(
    `This is a FULL 30-layer Brain Agent response. Make the organizational intelligence visible.`
  );

  return sections.join('\n');
}

/**
 * Build the "brainAugmented" attribution block for Brain Agent results.
 * Full L1-L30 version of buildBrainAttribution().
 */
export function buildFullBrainAttribution(
  fullCycleResult: FullCycleResultShape,
  agentId: string,
  layerWeights: Partial<Record<number, number>>
): Record<string, unknown> {
  const activeLayers: number[] = [];
  for (const [k, v] of Object.entries(layerWeights)) {
    if ((v ?? 0) > 0) activeLayers.push(Number(k));
  }

  return {
    brainAugmented: true,
    brainLayerCount: 30,
    activeLayers: activeLayers.sort((a, b) => a - b),
    agentId,
    brainLayers: {
      L1_L2_signals: fullCycleResult.brain.immune.signalsPassed,
      L3_dreamAssociations: fullCycleResult.brain.dreaming.associationsFound,
      L5_knowledgeGaps: fullCycleResult.brain.curiosity.knowledgeGaps,
      L6_calibration: fullCycleResult.brain.selfModel.calibrationScore,
      L8_scenarios: fullCycleResult.brain.imagination.scenariosPlanned,
      L11_robustness: fullCycleResult.brain.redTeam.robustnessAvg,
      L16_domains: fullCycleResult.deep.domainHierarchy.domainsActive,
      L17_entityLinks: fullCycleResult.deep.entityLinking.crossSystemLinks,
      L18_silos: fullCycleResult.deep.orgTopology.silosDetected,
      L19_cascades: fullCycleResult.deep.impactCascade.cascadesModeled,
      L20_alignment: fullCycleResult.deep.strategicSynthesis.alignmentScore,
      L23_workflows: fullCycleResult.deep.processMining.workflowsDiscovered,
      L29_interventions: fullCycleResult.deep.interventions.recommended.length,
      L30_wisdomPrinciples: fullCycleResult.deep.wisdom.principlesLearned,
    },
    cycleDurationMs: fullCycleResult.totalDurationMs,
    attribution:
      `Analysis powered by NexusBrain's FULL 30-layer cognitive stack (${activeLayers.length} layers active for agent "${agentId}"). ` +
      `The Brain processed ${fullCycleResult.brain.immune.signalsPassed} signals through ` +
      `${fullCycleResult.deep.entityLinking.crossSystemLinks} cross-system entity links, ` +
      `${fullCycleResult.deep.impactCascade.cascadesModeled} impact cascades, and ` +
      `${fullCycleResult.deep.wisdom.principlesLearned} wisdom principles.`,
  };
}
