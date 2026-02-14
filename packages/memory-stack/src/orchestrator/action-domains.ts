/**
 * Action Domains V2 — 20 Self-Registering Brain Functions
 * ========================================================
 *
 * Each action domain is a specialized neural pathway in the brain.
 * Instead of a 3,366-line monolith with 27 switch cases, each domain
 * is ~50-100 lines, self-describing, composable, and learnable.
 *
 * The 20 Domains:
 *
 *   CORE (V2-V5 refactored):
 *   1. forecast         — Temporal prediction (Temporal Cortex)
 *   2. simulate         — What-if scenario analysis (Imagination Network)
 *   3. explain          — Causal explanation (Wernicke's Area)
 *   4. diagnose         — Root cause diagnosis (Diagnostic Cortex)
 *   5. composite        — Multi-domain synthesis (Association Cortex)
 *
 *   V6 — Brain Function Expansion:
 *   6. compare          — Side-by-side domain analysis (Lateral Thinking)
 *   7. monitor          — Persistent brain watchers (Vigilance System)
 *   8. optimize         — Goal-directed intervention planning (Prefrontal Planning)
 *   9. recommend        — Priority-ranked action stack (Executive Function)
 *  10. audit            — Assumption verification (Integrity Checker)
 *  11. correlate        — Cross-domain co-movement discovery (Pattern Recognition)
 *  12. benchmark        — External reference comparison (Comparative Cortex)
 *  13. narrate          — Investor-grade communication (Broca's Area)
 *
 *   V6.1 — Advanced Brain Cognition:
 *  14. sentiment        — Organizational mood & signal tone (Amygdala)
 *  15. scenario-tree    — Branching futures with probabilities (Hippocampal Prospection)
 *  16. risk-cascade     — Cascading failure path analysis (Insular Cortex)
 *  17. resource-allocate — Optimal budget/headcount distribution (Dorsolateral PFC)
 *  18. anomaly-predict  — Predict anomalies BEFORE they happen (Anterior Cingulate)
 *  19. goal-decompose   — Strategic goal → executable steps (Prefrontal Executive)
 *  20. causal-intervene — Precision intervention targeting (Basal Ganglia)
 *  21. pattern-memory   — Temporal pattern library & match (Entorhinal Cortex)
 *
 * @packageDocumentation
 */

import {
  defineActionDomain,
  type ActionDomainDefinition,
  type ActionDomainResult,
  type ActionDomainBrainContext,
  type ActionDomainExecutionContext,
} from './action-domain-registry';

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/** Extract top N edges from DAG targeting or sourcing from a domain */
function getTopEdges(
  dag: ActionDomainBrainContext['dag'],
  domain: string,
  direction: 'upstream' | 'downstream',
  limit: number = 8,
): Array<{ source: string; target: string; weight: number; lagDays: number; pValue: number }> {
  const edges: Array<{ source: string; target: string; weight: number; lagDays: number; pValue: number }> = [];

  for (const [source, targets] of dag.edges) {
    for (const [target, edge] of targets) {
      if (direction === 'upstream' && target === domain) {
        edges.push({ source, target, weight: edge.weight, lagDays: edge.lagDays, pValue: edge.pValue });
      } else if (direction === 'downstream' && source === domain) {
        edges.push({ source, target, weight: edge.weight, lagDays: edge.lagDays, pValue: edge.pValue });
      }
    }
  }

  return edges.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/** Compute domain mastery — how well does the brain know this domain? */
function computeDomainMastery(brain: ActionDomainBrainContext): number {
  const domain = brain.primaryDomain;
  let score = 0;
  let factors = 0;

  // Factor 1: DAG coverage
  const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream');
  const downstreamEdges = getTopEdges(brain.dag, domain, 'downstream');
  const edgeCount = upstreamEdges.length + downstreamEdges.length;
  score += Math.min(1, edgeCount / 10);
  factors++;

  // Factor 2: TimeSeries availability
  if (brain.timeSeries.has(domain)) {
    const ts = brain.timeSeries.get(domain)!;
    const dataPoints = (ts as unknown as { values: number[] }).values?.length || 0;
    score += Math.min(1, dataPoints / 90);
  }
  factors++;

  // Factor 3: Rules coverage
  const domainRules = brain.matchedRules.filter(r =>
    r.naturalLanguage.toLowerCase().includes(domain) || r.conditions.some(c => c.includes(domain))
  );
  score += Math.min(1, domainRules.length / 5);
  factors++;

  // Factor 4: Pattern coverage
  const domainPatterns = brain.patterns.filter(p => p.domain === domain);
  score += Math.min(1, domainPatterns.length / 3);
  factors++;

  return factors > 0 ? score / factors : 0;
}

/** Build standard intervention from a causal driver */
function buildInterventionFromDriver(
  driver: { source: string; target: string; weight: number; lagDays: number },
  domain: string,
  actionVerb: string,
): ActionDomainResult['interventions'][0] {
  return {
    action: `${actionVerb} ${driver.source} to improve ${domain} (${(driver.weight * 100).toFixed(0)}% influence, ${driver.lagDays}d lag)`,
    targetDomains: [driver.source, domain],
    expectedImpact: `+${(driver.weight * 15).toFixed(0)}% improvement in ${domain}`,
    confidence: driver.weight,
    evidence: `Causal edge: ${driver.source}→${domain}, weight=${driver.weight.toFixed(2)}, p=${0.05}`,
    owner: `${driver.source} team lead`,
    effort: driver.weight > 0.6 ? 'low' : driver.weight > 0.3 ? 'medium' : 'high',
  };
}

/** Format a standard table for prompt */
function formatTable(headers: string[], rows: string[][]): string {
  const lines: string[] = [];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
  for (const row of rows) {
    lines.push('| ' + row.join(' | ') + ' |');
  }
  return lines.join('\n');
}

// ============================================================================
// DOMAIN 1: FORECAST — Temporal Prediction
// ============================================================================

export const forecastDomain: ActionDomainDefinition = defineActionDomain({
  name: 'forecast',
  description: 'Temporal prediction using causal graph + time series ensemble forecasting',
  brainAnalog: 'Temporal Cortex — integrates past patterns to predict future states',
  requires: ['causalDAG', 'timeSeries', 'temporalForecaster'],
  optional: ['contextAwareReasoner', 'llmAmplifier'],
  intents: ['predict'],
  intentKeywords: ['forecast', 'predict', 'projection', 'estimate', 'what will', 'how much will', 'next quarter', 'next year', 'next month', 'future'],
  intentPatterns: [
    /\bforecast\b/i,
    /\bpredict(ion)?\b/i,
    /\bproject(ion)?\b/i,
    /\bestimate\s+\d+/i,
    /how\s+(much|many)\s+will/i,
    /what\s+will\s+(happen|be|the)/i,
  ],
  priority: 70,
  outputSchema: {
    dataType: 'forecast',
    fields: ['predictions', 'intervals', 'drivers', 'relatedForecasts', 'table'],
    composable: true,
    consumableBy: ['simulate', 'compare', 'recommend', 'narrate', 'audit'],
  },
  composableWith: ['simulate', 'explain', 'compare', 'recommend', 'narrate'],
  tags: ['core', 'temporal', 'predictive'],

  execute: async (ctx: ActionDomainExecutionContext): Promise<ActionDomainResult> => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = ['causal-dag-analysis'];

    log(`Forecasting ${domain} for ${brain.horizonDays} days`);

    // Use temporal forecaster if available
    let forecastResult: unknown = null;
    let confidence = 0.5;
    const predictions: Array<{ date: string; predicted: number; lower95: number; upper95: number }> = [];

    if (modules.forecaster && brain.timeSeries.size > 0) {
      try {
        forecastResult = modules.forecaster.forecast(brain.timeSeries, brain.dag, domain, brain.horizonDays);
        const fr = forecastResult as { confidence: number; predictions?: unknown[] };
        confidence = fr.confidence || 0.5;
        modulesUsed.push('temporal-forecaster');
      } catch {
        log('Forecaster failed, using DAG-only analysis');
      }
    }

    // Analyze causal drivers
    const upstreamDrivers = getTopEdges(brain.dag, domain, 'upstream', 5);
    const downstreamEffects = getTopEdges(brain.dag, domain, 'downstream', 3);

    // Build driver analysis
    const drivers = upstreamDrivers.map(d => ({
      domain: d.source,
      weight: d.weight,
      lagDays: d.lagDays,
      direction: d.weight > 0 ? 'positive' as const : 'negative' as const,
    }));

    // Related domain forecasts
    const relatedForecasts: Record<string, unknown>[] = [];
    const relatedDomains = brain.extractedDomains.filter(d => d !== domain).slice(0, 3);
    for (const rd of relatedDomains) {
      if (modules.forecaster && brain.timeSeries.has(rd)) {
        try {
          const rf = modules.forecaster.forecast(brain.timeSeries, brain.dag, rd, brain.horizonDays);
          relatedForecasts.push({ domain: rd, forecast: rf });
        } catch { /* skip */ }
      }
    }

    // Build interventions from top drivers
    const interventions = upstreamDrivers.slice(0, 3).map(d =>
      buildInterventionFromDriver(d, domain, 'Optimize')
    );

    // Build narrative
    const driverList = upstreamDrivers.slice(0, 3)
      .map(d => `${d.source} (${(d.weight * 100).toFixed(0)}% influence, ${d.lagDays}d lag)`)
      .join(', ');
    const narrative = `${brain.horizonDays}-day forecast for ${domain}: confidence ${(confidence * 100).toFixed(0)}%. Top drivers: ${driverList || 'no strong causal drivers detected'}. ${upstreamDrivers.length} upstream causal paths, ${downstreamEffects.length} downstream effects identified.`;

    if (modules.reasoner) modulesUsed.push('context-aware-reasoner');

    return {
      data: {
        type: 'forecast',
        forecast: forecastResult,
        driverAnalyses: upstreamDrivers,
        downstreamEffects,
        table: predictions,
        drivers: upstreamDrivers.map(d => ({ domain: d.source, weight: d.weight, lagDays: d.lagDays, contribution: d.weight * 100 })),
        relatedForecasts,
        horizonDays: brain.horizonDays,
        domainMastery: computeDomainMastery(brain),
      },
      narrative,
      confidence,
      drivers,
      interventions,
      modulesUsed,
      metadata: {
        dagNodeCount: brain.dag.nodes.size,
        dagEdgeCount: upstreamDrivers.length + downstreamEffects.length,
        timeSeriesAvailable: brain.timeSeries.has(domain),
        relatedDomains: relatedDomains.length,
      },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    lines.push(`## 📈 FORECAST: ${ctx.primaryDomain} (${ctx.horizonDays}-day horizon)`);
    lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}% | Modules: ${result.modulesUsed.join(', ')}`);
    lines.push('');

    if (result.drivers.length > 0) {
      lines.push('### Key Drivers');
      for (const d of result.drivers) {
        lines.push(`- **${d.domain}**: ${(d.weight * 100).toFixed(0)}% influence, ${d.lagDays}d lag (${d.direction})`);
      }
      lines.push('');
    }

    if (result.interventions.length > 0) {
      lines.push('### Recommended Actions');
      for (const i of result.interventions) {
        lines.push(`- ${i.action} [${i.effort}] (confidence: ${(i.confidence * 100).toFixed(0)}%)`);
      }
    }

    const data = result.data as Record<string, unknown>;
    const rf = data.relatedForecasts as unknown[];
    if (rf && rf.length > 0) {
      lines.push('');
      lines.push(`### Related Domain Forecasts (${rf.length} domains)`);
      for (const r of rf) {
        const rd = r as { domain: string };
        lines.push(`- ${rd.domain}: forecast computed`);
      }
    }

    return lines.join('\n');
  },

  buildDevilsAdvocate: (result, ctx) => {
    return `This ${ctx.horizonDays}-day forecast at ${(result.confidence * 100).toFixed(0)}% confidence assumes causal relationships are stable. But correlation ≠ causation — the ${ctx.primaryDomain} domain could be driven by unobserved confounders. The model also extrapolates from historical patterns that may not hold if the market structure changes (regime shifts, black swan events, competitive disruption).`;
  },

  buildMondayAction: (result, ctx) => {
    if (result.interventions.length > 0) {
      return `Review the ${ctx.horizonDays}-day ${ctx.primaryDomain} forecast and ${result.interventions[0].action}`;
    }
    return `Review the ${ctx.primaryDomain} forecast — gather more data on key drivers to improve confidence from ${(result.confidence * 100).toFixed(0)}%.`;
  },
});

// ============================================================================
// DOMAIN 2: SIMULATE — What-If Scenario Analysis
// ============================================================================

export const simulateDomain: ActionDomainDefinition = defineActionDomain({
  name: 'simulate',
  description: 'What-if scenario analysis with cascade propagation through the causal graph',
  brainAnalog: 'Default Mode Network — the imagination engine, explores hypotheticals',
  requires: ['causalDAG'],
  optional: ['whatIfSimulator', 'timeSeries', 'contextAwareReasoner'],
  intents: ['simulate'],
  intentKeywords: ['what if', 'what would happen', 'simulate', 'scenario', 'increase', 'decrease', 'change', 'impact of'],
  intentPatterns: [
    /what\s+(if|would\s+happen|happens)/i,
    /\bsimulat/i,
    /impact\s+of\s+(increasing|decreasing|changing)/i,
    /if\s+we\s+(increase|decrease|change|stop|start|double|halve)/i,
  ],
  priority: 65,
  outputSchema: {
    dataType: 'simulation',
    fields: ['scenarios', 'cascadeTimeline', 'interventions', 'affectedDomains'],
    composable: true,
    consumableBy: ['forecast', 'recommend', 'narrate', 'optimize'],
  },
  composableWith: ['forecast', 'explain', 'recommend', 'narrate', 'optimize'],
  tags: ['core', 'counterfactual', 'planning'],

  execute: async (ctx) => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = [];

    log(`Simulating scenario for ${domain}`);

    // Extract scenario from question (parse what-if)
    const questionLower = brain.question.toLowerCase();
    let direction: 'increase' | 'decrease' = 'increase';
    let magnitude = 20;

    if (/decrease|drop|reduce|cut|lower|less/i.test(brain.question)) direction = 'decrease';
    const magMatch = brain.question.match(/(\d+)\s*%/);
    if (magMatch) magnitude = parseInt(magMatch[1], 10);

    // Run through simulator if available
    let simulationResult: unknown = null;
    if (modules.simulator) {
      try {
        simulationResult = modules.simulator.simulate({
          sourceDomain: domain,
          direction,
          magnitudePercent: magnitude,
        });
        modulesUsed.push('whatif-simulator');
      } catch {
        log('Simulator unavailable, using DAG-based cascade analysis');
      }
    }

    // DAG-based cascade analysis
    const downstreamEdges = getTopEdges(brain.dag, domain, 'downstream');
    const cascadeTimeline: Array<{ domain: string; dayFromNow: number; changePercent: number }> = [];
    const affectedDomains: string[] = [];

    for (const edge of downstreamEdges) {
      const changePercent = direction === 'increase'
        ? magnitude * edge.weight
        : -magnitude * edge.weight;
      cascadeTimeline.push({
        domain: edge.target,
        dayFromNow: edge.lagDays,
        changePercent: Math.round(changePercent * 10) / 10,
      });
      affectedDomains.push(edge.target);
    }

    // Confidence from edge quality
    const avgWeight = downstreamEdges.length > 0
      ? downstreamEdges.reduce((s, e) => s + e.weight, 0) / downstreamEdges.length
      : 0.3;
    const confidence = Math.min(0.95, avgWeight * 1.2);

    // Interventions: opportunities from cascade
    const interventions = cascadeTimeline
      .filter(c => Math.abs(c.changePercent) > 5)
      .slice(0, 3)
      .map(c => ({
        action: `Monitor ${c.domain} — expected ${c.changePercent > 0 ? '+' : ''}${c.changePercent.toFixed(1)}% change in ${c.dayFromNow}d`,
        targetDomains: [c.domain],
        expectedImpact: `${c.changePercent > 0 ? '+' : ''}${c.changePercent.toFixed(1)}% in ${c.domain}`,
        confidence: avgWeight,
        evidence: `Cascade: ${domain}→${c.domain}, lag=${c.dayFromNow}d`,
        owner: `${c.domain} team`,
        effort: 'low' as const,
      }));

    const narrative = `Scenario: ${direction} ${domain} by ${magnitude}%. ${cascadeTimeline.length} downstream domains affected. ${direction === 'increase' ? 'Largest positive' : 'Largest negative'} impact: ${cascadeTimeline[0]?.domain || 'none'} (${cascadeTimeline[0]?.changePercent?.toFixed(1) || 0}% in ${cascadeTimeline[0]?.dayFromNow || 0}d). Confidence: ${(confidence * 100).toFixed(0)}%.`;

    return {
      data: {
        type: 'simulation',
        scenario: { sourceDomain: domain, direction, magnitudePercent: magnitude },
        simulation: simulationResult,
        cascadeTimeline,
        affectedDomains,
      },
      narrative,
      confidence,
      drivers: cascadeTimeline.map(c => ({
        domain: c.domain,
        weight: Math.abs(c.changePercent) / magnitude,
        lagDays: c.dayFromNow,
        direction: c.changePercent > 0 ? 'positive' as const : 'negative' as const,
      })),
      interventions,
      modulesUsed,
      metadata: {
        scenario: `${direction} ${magnitude}%`,
        affectedDomains: affectedDomains.length,
        totalCascadeSteps: cascadeTimeline.length,
      },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const scenario = data.scenario as { direction: string; magnitudePercent: number };
    const timeline = data.cascadeTimeline as Array<{ domain: string; dayFromNow: number; changePercent: number }>;

    lines.push(`## 🔮 SIMULATION: ${scenario.direction} ${ctx.primaryDomain} by ${scenario.magnitudePercent}%`);
    lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}% | Affected: ${(data.affectedDomains as string[]).length} domains`);
    lines.push('');

    if (timeline && timeline.length > 0) {
      lines.push('### Cascade Timeline');
      lines.push(formatTable(
        ['Domain', 'Day', 'Change %'],
        timeline.slice(0, 10).map(t => [t.domain, String(t.dayFromNow), `${t.changePercent > 0 ? '+' : ''}${t.changePercent.toFixed(1)}%`])
      ));
    }

    if (result.interventions.length > 0) {
      lines.push('');
      lines.push('### Intervention Opportunities');
      for (const i of result.interventions) {
        lines.push(`- ${i.action}`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 3: EXPLAIN — Causal Explanation
// ============================================================================

export const explainDomain: ActionDomainDefinition = defineActionDomain({
  name: 'explain',
  description: 'Traces causal connections upstream and downstream, generates reasoning chains',
  brainAnalog: "Wernicke's Area — comprehension and meaning-making from causal structure",
  requires: ['causalDAG'],
  optional: ['contextAwareReasoner', 'explanationGenerator', 'timeSeries'],
  intents: ['explain', 'general'],
  intentKeywords: ['explain', 'why does', 'how does', 'what causes', 'what drives', 'relationship', 'connection', 'impact', 'affect', 'influence'],
  intentPatterns: [
    /\bexplain\b/i,
    /how\s+does\s+\w+\s+(affect|impact|influence|drive)/i,
    /what\s+(causes|drives|affects)/i,
    /relationship\s+between/i,
  ],
  priority: 55,
  outputSchema: {
    dataType: 'explanation',
    fields: ['upstreamAnalyses', 'downstreamAnalyses', 'reasoningChain', 'connectionStrength'],
    composable: true,
    consumableBy: ['diagnose', 'recommend', 'narrate', 'audit'],
  },
  composableWith: ['forecast', 'diagnose', 'audit', 'narrate'],
  tags: ['core', 'causal', 'understanding'],

  execute: async (ctx) => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = [];

    log(`Explaining causal structure for ${domain}`);

    // Get ALL upstream and downstream connections
    const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream', 8);
    const downstreamEdges = getTopEdges(brain.dag, domain, 'downstream', 8);
    modulesUsed.push('causal-graph');

    // Run connection analysis if reasoner available
    const connectionAnalyses: unknown[] = [];
    if (modules.reasoner) {
      for (const edge of upstreamEdges.slice(0, 5)) {
        try {
          const analysis = modules.reasoner.analyzeConnection(brain.dag, edge.source, edge.target);
          connectionAnalyses.push(analysis);
        } catch { /* skip */ }
      }
      modulesUsed.push('context-aware-reasoner');
    }

    // Generate explanation chain if explainer available
    let explanationChain: unknown = null;
    if (modules.explainer && upstreamEdges.length > 0) {
      try {
        const bestEdge = upstreamEdges[0];
        explanationChain = modules.explainer.explainPrediction(
          brain.dag, { source: bestEdge.source, target: bestEdge.target }, `${bestEdge.source}→${domain}`
        );
        modulesUsed.push('explanation-generator');
      } catch { /* skip */ }
    }

    const confidence = upstreamEdges.length > 0
      ? Math.min(0.95, upstreamEdges[0].weight * 1.3)
      : 0.3;

    const drivers = [
      ...upstreamEdges.map(d => ({ domain: d.source, weight: d.weight, lagDays: d.lagDays, direction: 'positive' as const })),
      ...downstreamEdges.map(d => ({ domain: d.target, weight: d.weight, lagDays: d.lagDays, direction: 'positive' as const })),
    ];

    const interventions = upstreamEdges.slice(0, 3).map(d =>
      buildInterventionFromDriver(d, domain, 'Strengthen')
    );

    const upList = upstreamEdges.slice(0, 3).map(e => `${e.source} (${(e.weight * 100).toFixed(0)}%)`).join(', ');
    const downList = downstreamEdges.slice(0, 3).map(e => `${e.target} (${(e.weight * 100).toFixed(0)}%)`).join(', ');
    const narrative = `${domain} is driven by: ${upList || 'no upstream drivers found'}. It affects: ${downList || 'no downstream effects found'}. ${upstreamEdges.length} upstream + ${downstreamEdges.length} downstream causal paths traced.`;

    return {
      data: {
        type: 'explanation',
        upstreamEdges,
        downstreamEdges,
        connectionAnalyses,
        explanationChain,
        totalConnections: upstreamEdges.length + downstreamEdges.length,
      },
      narrative,
      confidence,
      drivers,
      interventions,
      modulesUsed,
      metadata: {
        upstreamCount: upstreamEdges.length,
        downstreamCount: downstreamEdges.length,
        connectionAnalysesComputed: connectionAnalyses.length,
      },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const upstream = data.upstreamEdges as Array<{ source: string; weight: number; lagDays: number }>;
    const downstream = data.downstreamEdges as Array<{ source: string; target: string; weight: number; lagDays: number }>;

    lines.push(`## 🔍 EXPLANATION: ${ctx.primaryDomain}`);
    lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}% | ${(data.totalConnections as number)} causal connections`);
    lines.push('');

    if (upstream && upstream.length > 0) {
      lines.push('### Upstream Drivers (What drives this)');
      for (const e of upstream) {
        lines.push(`- **${e.source}** → ${ctx.primaryDomain}: ${(e.weight * 100).toFixed(0)}% influence, ${e.lagDays}d lag`);
      }
      lines.push('');
    }

    if (downstream && downstream.length > 0) {
      lines.push('### Downstream Effects (What this drives)');
      for (const e of downstream) {
        lines.push(`- ${ctx.primaryDomain} → **${e.target}**: ${(e.weight * 100).toFixed(0)}% influence, ${e.lagDays}d lag`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 4: DIAGNOSE — Root Cause Diagnosis
// ============================================================================

export const diagnoseDomain: ActionDomainDefinition = defineActionDomain({
  name: 'diagnose',
  description: 'Root cause analysis combining causal graph traversal, rule matching, and anomaly detection',
  brainAnalog: 'Diagnostic Cortex — identifies what went wrong and why',
  requires: ['causalDAG'],
  optional: ['contextAwareReasoner', 'explanationGenerator', 'rules', 'anomalyDetector'],
  intents: ['diagnose'],
  intentKeywords: ['why is', 'why did', 'root cause', 'diagnose', 'what went wrong', 'problem', 'issue', 'declining', 'dropping', 'failing', 'broken'],
  intentPatterns: [
    /why\s+(is|did|are|has|does)/i,
    /root\s+cause/i,
    /\bdiagnos/i,
    /what('s|\s+is)\s+(wrong|causing|driving)/i,
    /what\s+went\s+wrong/i,
  ],
  priority: 70,
  outputSchema: {
    dataType: 'diagnosis',
    fields: ['rootCauses', 'triggeredRules', 'anomalyExplanation', 'upstreamAnalysis'],
    composable: true,
    consumableBy: ['explain', 'recommend', 'narrate', 'optimize'],
  },
  composableWith: ['explain', 'simulate', 'recommend', 'narrate'],
  tags: ['core', 'diagnostic', 'troubleshooting'],

  execute: async (ctx) => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;
    const modulesUsed: string[] = [];

    log(`Diagnosing ${domain}`);

    // Upstream causal analysis
    const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream', 5);
    modulesUsed.push('causal-graph');

    // Run anomaly explanation if reasoner available
    let anomalyExplanation: unknown = null;
    if (modules.reasoner) {
      try {
        anomalyExplanation = modules.reasoner.explainAnomaly(
          { domain, severity: 'medium' },
          brain.dag,
          brain.timeSeries,
        );
        modulesUsed.push('context-aware-reasoner');
      } catch { /* skip */ }
    }

    // Match rules
    const triggeredRules = brain.matchedRules.filter(r =>
      r.triggered && (
        r.naturalLanguage.toLowerCase().includes(domain) ||
        r.conditions.some(c => c.toLowerCase().includes(domain))
      )
    );
    if (triggeredRules.length > 0) modulesUsed.push('rules-engine');

    // Build root causes from upstream edges
    const rootCauses = upstreamEdges.map(e => ({
      source: e.source,
      influence: e.weight,
      lagDays: e.lagDays,
      diagnosis: `${e.source} has ${(e.weight * 100).toFixed(0)}% causal influence on ${domain} with a ${e.lagDays}-day lag. Changes in ${e.source} propagate to ${domain}.`,
    }));

    const confidence = anomalyExplanation
      ? 0.7
      : (upstreamEdges.length > 0 ? Math.min(0.8, upstreamEdges[0].weight * 1.2) : 0.3);

    const drivers = upstreamEdges.map(d => ({
      domain: d.source,
      weight: d.weight,
      lagDays: d.lagDays,
      direction: 'negative' as const,
    }));

    const interventions = upstreamEdges.slice(0, 3).map(d =>
      buildInterventionFromDriver(d, domain, 'Investigate and fix')
    );

    const topCause = rootCauses[0];
    const ruleList = triggeredRules.slice(0, 2).map(r => r.title).join(', ');
    const narrative = `Diagnosis for ${domain}: ${topCause ? `Most likely root cause: ${topCause.source} (${(topCause.influence * 100).toFixed(0)}% influence)` : 'No clear root cause identified'}. ${triggeredRules.length} business rules triggered${ruleList ? `: ${ruleList}` : ''}. ${rootCauses.length} upstream causal paths analyzed.`;

    return {
      data: {
        type: 'diagnosis',
        rootCauses,
        anomalyExplanation,
        triggeredRules: triggeredRules.map(r => ({
          title: r.title,
          naturalLanguage: r.naturalLanguage,
          matchedConditions: r.conditions,
        })),
        upstreamEdges,
      },
      narrative,
      confidence,
      drivers,
      interventions,
      modulesUsed,
      metadata: {
        rootCauseCount: rootCauses.length,
        triggeredRuleCount: triggeredRules.length,
        hasAnomalyExplanation: !!anomalyExplanation,
      },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const rootCauses = data.rootCauses as Array<{ source: string; influence: number; lagDays: number; diagnosis: string }>;
    const rules = data.triggeredRules as Array<{ title: string; naturalLanguage: string }>;

    lines.push(`## 🔬 DIAGNOSIS: ${ctx.primaryDomain}`);
    lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    lines.push('');

    if (rootCauses && rootCauses.length > 0) {
      lines.push('### Root Causes (ranked by influence)');
      for (const rc of rootCauses) {
        lines.push(`- **${rc.source}** (${(rc.influence * 100).toFixed(0)}% influence, ${rc.lagDays}d lag): ${rc.diagnosis}`);
      }
      lines.push('');
    }

    if (rules && rules.length > 0) {
      lines.push('### Triggered Business Rules');
      for (const r of rules) {
        lines.push(`- **${r.title}**: ${r.naturalLanguage}`);
      }
      lines.push('');
    }

    if (result.interventions.length > 0) {
      lines.push('### Prescriptive Actions');
      for (const i of result.interventions) {
        lines.push(`- ${i.action} [${i.owner}]`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 5: COMPOSITE — Multi-Domain Synthesis
// ============================================================================

export const compositeDomain: ActionDomainDefinition = defineActionDomain({
  name: 'composite',
  description: 'Synthesizes forecast + simulate + explain into a comprehensive model',
  brainAnalog: 'Association Cortex — integrates multiple processing streams into unified understanding',
  requires: ['causalDAG'],
  optional: ['temporalForecaster', 'whatIfSimulator', 'contextAwareReasoner', 'explanationGenerator'],
  intents: ['build', 'general'],
  intentKeywords: ['build model', 'comprehensive', 'full analysis', '360', 'holistic', 'end to end', 'complete picture', 'full picture'],
  intentPatterns: [
    /build\s+(me\s+)?(a\s+)?.*model/i,
    /comprehensive|holistic|end.to.end/i,
    /full\s+(analysis|picture|model|view)/i,
    /360\s*(degree)?/i,
  ],
  priority: 60,
  outputSchema: {
    dataType: 'composite',
    fields: ['forecast', 'simulation', 'explanation', 'confidences', 'synthesis'],
    composable: false,
    consumableBy: ['narrate', 'recommend'],
  },
  composableWith: ['recommend', 'narrate'],
  tags: ['core', 'synthesis', 'comprehensive'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domain = brain.primaryDomain;

    log(`Building composite model for ${domain}`);

    // Compose: call forecast, simulate, explain
    const [forecastResult, simulateResult, explainResult] = await Promise.all([
      ctx.callDomain('forecast'),
      ctx.callDomain('simulate'),
      ctx.callDomain('explain'),
    ]);

    // Merge all results
    const allModules = new Set([
      ...forecastResult.modulesUsed,
      ...simulateResult.modulesUsed,
      ...explainResult.modulesUsed,
    ]);

    const avgConfidence = (forecastResult.confidence + simulateResult.confidence + explainResult.confidence) / 3;

    // Merge drivers (deduplicate by domain)
    const driverMap = new Map<string, (typeof forecastResult.drivers)[0]>();
    for (const d of [...forecastResult.drivers, ...simulateResult.drivers, ...explainResult.drivers]) {
      const existing = driverMap.get(d.domain);
      if (!existing || d.weight > existing.weight) {
        driverMap.set(d.domain, d);
      }
    }

    // Merge interventions (top 5 unique)
    const allInterventions = [
      ...forecastResult.interventions,
      ...simulateResult.interventions,
      ...explainResult.interventions,
    ];
    const uniqueInterventions = allInterventions.slice(0, 5);

    const narrative = `Comprehensive ${domain} analysis: Forecast (${(forecastResult.confidence * 100).toFixed(0)}%), Simulation (${(simulateResult.confidence * 100).toFixed(0)}%), Explanation (${(explainResult.confidence * 100).toFixed(0)}%). Average confidence: ${(avgConfidence * 100).toFixed(0)}%. ${uniqueInterventions.length} total interventions identified across ${driverMap.size} causal drivers.`;

    return {
      data: {
        type: 'composite',
        forecast: forecastResult.data,
        simulation: simulateResult.data,
        explanation: explainResult.data,
        confidences: {
          forecast: forecastResult.confidence,
          simulation: simulateResult.confidence,
          explanation: explainResult.confidence,
        },
      },
      narrative,
      confidence: avgConfidence,
      drivers: Array.from(driverMap.values()),
      interventions: uniqueInterventions,
      modulesUsed: Array.from(allModules),
      metadata: {
        subDomains: ['forecast', 'simulate', 'explain'],
        compositeType: 'full_model',
      },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const confidences = data.confidences as { forecast: number; simulation: number; explanation: number };

    lines.push(`## 🧠 COMPOSITE MODEL: ${ctx.primaryDomain}`);
    lines.push(`Forecast: ${(confidences.forecast * 100).toFixed(0)}% | Simulation: ${(confidences.simulation * 100).toFixed(0)}% | Explanation: ${(confidences.explanation * 100).toFixed(0)}%`);
    lines.push(`Overall: ${(result.confidence * 100).toFixed(0)}% | Modules: ${result.modulesUsed.join(', ')}`);
    lines.push('');
    lines.push(result.narrative);

    if (result.interventions.length > 0) {
      lines.push('');
      lines.push('### Top Interventions (across all analyses)');
      for (const i of result.interventions) {
        lines.push(`- ${i.action} [${i.effort}] → ${i.expectedImpact}`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 6: COMPARE — Side-by-Side Domain Analysis (NEW)
// ============================================================================

export const compareDomain: ActionDomainDefinition = defineActionDomain({
  name: 'compare',
  description: 'Side-by-side analysis of two or more domains — finds shared drivers, divergences, and hidden connections',
  brainAnalog: 'Lateral Thinking Network — cross-references disparate concepts to find non-obvious connections',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'contextAwareReasoner'],
  intents: ['compare'],
  intentKeywords: ['compare', 'versus', 'vs', 'difference between', 'contrast', 'side by side', 'correlation between', 'relationship between'],
  intentPatterns: [
    /compare\s+\w+\s+(and|vs|versus|with|to)\s+\w+/i,
    /\bvs\.?\b/i,
    /difference\s+between/i,
    /how\s+does\s+\w+\s+compare/i,
  ],
  priority: 55,
  outputSchema: {
    dataType: 'comparison',
    fields: ['domainA', 'domainB', 'sharedDrivers', 'uniqueDrivers', 'divergencePoints', 'synergies'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'optimize'],
  },
  composableWith: ['forecast', 'explain', 'recommend', 'narrate'],
  tags: ['new', 'comparative', 'cross-domain'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domains = brain.extractedDomains.length >= 2
      ? brain.extractedDomains.slice(0, 2)
      : [brain.primaryDomain, brain.extractedDomains[1] || 'revenue'];
    const [domainA, domainB] = domains;

    log(`Comparing ${domainA} vs ${domainB}`);

    // Get edges for both domains
    const aUpstream = getTopEdges(brain.dag, domainA, 'upstream');
    const aDownstream = getTopEdges(brain.dag, domainA, 'downstream');
    const bUpstream = getTopEdges(brain.dag, domainB, 'upstream');
    const bDownstream = getTopEdges(brain.dag, domainB, 'downstream');

    // Find shared drivers (same source drives both)
    const aSourceSet = new Set(aUpstream.map(e => e.source));
    const bSourceSet = new Set(bUpstream.map(e => e.source));
    const sharedDrivers = [...aSourceSet].filter(s => bSourceSet.has(s)).map(source => {
      const aEdge = aUpstream.find(e => e.source === source)!;
      const bEdge = bUpstream.find(e => e.source === source)!;
      return {
        source,
        influenceOnA: aEdge.weight,
        influenceOnB: bEdge.weight,
        lagA: aEdge.lagDays,
        lagB: bEdge.lagDays,
        synergy: Math.min(aEdge.weight, bEdge.weight),
      };
    }).sort((a, b) => b.synergy - a.synergy);

    // Find unique drivers
    const uniqueToA = aUpstream.filter(e => !bSourceSet.has(e.source));
    const uniqueToB = bUpstream.filter(e => !aSourceSet.has(e.source));

    // Check if A drives B or B drives A
    const aToB = getTopEdges(brain.dag, domainA, 'downstream').find(e => e.target === domainB);
    const bToA = getTopEdges(brain.dag, domainB, 'downstream').find(e => e.target === domainA);

    // Divergence analysis
    const divergences: Array<{ aspect: string; domainA: string; domainB: string; insight: string }> = [];
    divergences.push({
      aspect: 'Upstream complexity',
      domainA: `${aUpstream.length} drivers`,
      domainB: `${bUpstream.length} drivers`,
      insight: aUpstream.length > bUpstream.length
        ? `${domainA} has more causal inputs — harder to control`
        : `${domainB} has more causal inputs — harder to control`,
    });
    divergences.push({
      aspect: 'Downstream impact',
      domainA: `${aDownstream.length} effects`,
      domainB: `${bDownstream.length} effects`,
      insight: aDownstream.length > bDownstream.length
        ? `${domainA} is more influential — changes here cascade wider`
        : `${domainB} is more influential — changes here cascade wider`,
    });

    const confidence = Math.min(0.9, (aUpstream.length + bUpstream.length) / 12);

    const drivers = [
      ...sharedDrivers.map(d => ({ domain: d.source, weight: d.synergy, lagDays: Math.min(d.lagA, d.lagB), direction: 'positive' as const })),
    ];

    const interventions = sharedDrivers.slice(0, 2).map(d => ({
      action: `Optimize ${d.source} — it drives BOTH ${domainA} (${(d.influenceOnA * 100).toFixed(0)}%) and ${domainB} (${(d.influenceOnB * 100).toFixed(0)}%)`,
      targetDomains: [d.source, domainA, domainB],
      expectedImpact: `Dual improvement in ${domainA} + ${domainB}`,
      confidence: d.synergy,
      evidence: `Shared driver: ${d.source}→${domainA} (${d.influenceOnA.toFixed(2)}) AND ${d.source}→${domainB} (${d.influenceOnB.toFixed(2)})`,
      owner: `${d.source} team lead`,
      effort: 'medium' as const,
    }));

    const narrative = `Comparison: ${domainA} vs ${domainB}. ${sharedDrivers.length} shared drivers found${sharedDrivers.length > 0 ? ` (top: ${sharedDrivers[0].source})` : ''}. ${uniqueToA.length} unique to ${domainA}, ${uniqueToB.length} unique to ${domainB}. ${aToB ? `${domainA} directly drives ${domainB} (${(aToB.weight * 100).toFixed(0)}%).` : ''}${bToA ? `${domainB} directly drives ${domainA} (${(bToA.weight * 100).toFixed(0)}%).` : ''}`;

    return {
      data: {
        type: 'comparison',
        domainA,
        domainB,
        sharedDrivers,
        uniqueToA,
        uniqueToB,
        directLink: { aToB, bToA },
        divergences,
      },
      narrative,
      confidence,
      drivers,
      interventions,
      modulesUsed: ['causal-graph', 'comparison-engine'],
      metadata: { sharedDriverCount: sharedDrivers.length, divergenceCount: divergences.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const domA = data.domainA as string;
    const domB = data.domainB as string;
    const shared = data.sharedDrivers as Array<{ source: string; influenceOnA: number; influenceOnB: number }>;
    const divs = data.divergences as Array<{ aspect: string; domainA: string; domainB: string; insight: string }>;

    lines.push(`## ⚖️ COMPARISON: ${domA} vs ${domB}`);
    lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    lines.push('');

    if (shared && shared.length > 0) {
      lines.push('### Shared Drivers (optimize these for dual benefit)');
      for (const s of shared) {
        lines.push(`- **${s.source}**: ${(s.influenceOnA * 100).toFixed(0)}% on ${domA}, ${(s.influenceOnB * 100).toFixed(0)}% on ${domB}`);
      }
      lines.push('');
    }

    if (divs && divs.length > 0) {
      lines.push('### Divergence Points');
      lines.push(formatTable(
        ['Aspect', domA, domB, 'Insight'],
        divs.map(d => [d.aspect, d.domainA, d.domainB, d.insight])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 7: MONITOR — Persistent Brain Watchers (NEW)
// ============================================================================

export const monitorDomain: ActionDomainDefinition = defineActionDomain({
  name: 'monitor',
  description: 'Creates persistent brain watchers that fire when conditions trigger — the vigilance system',
  brainAnalog: 'Reticular Activating System — persistent vigilance, wakes the brain when conditions change',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'anomalyDetector', 'motorCommands', 'signalCollector'],
  intents: ['monitor'],
  intentKeywords: ['monitor', 'watch', 'alert', 'notify', 'track', 'keep an eye', 'warn me', 'let me know', 'trigger'],
  intentPatterns: [
    /\bmonitor\b/i,
    /\bwatch\s+(for|out)/i,
    /alert\s+me\s+(when|if)/i,
    /notify\s+(me|us|team)\s+(when|if)/i,
    /keep\s+(an\s+)?eye\s+on/i,
  ],
  priority: 50,
  outputSchema: {
    dataType: 'monitor',
    fields: ['watchers', 'currentStatus', 'thresholds', 'alertHistory'],
    composable: false,
    consumableBy: ['recommend', 'narrate'],
  },
  composableWith: ['forecast', 'diagnose'],
  tags: ['new', 'realtime', 'alerting'],

  execute: async (ctx) => {
    const { brain, modules, log } = ctx;
    const domain = brain.primaryDomain;

    log(`Setting up monitor for ${domain}`);

    // Analyze current state
    const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream', 5);
    const domainMastery = computeDomainMastery(brain);

    // Create watcher definitions based on causal structure
    const watchers = upstreamEdges.map(edge => ({
      id: `watch_${edge.source}_${domain}_${Date.now()}`,
      source: edge.source,
      target: domain,
      condition: `${edge.source} change > ${(edge.weight * 20).toFixed(0)}% within ${edge.lagDays}d`,
      threshold: edge.weight * 0.2,
      lagDays: edge.lagDays,
      severity: edge.weight > 0.6 ? 'critical' : edge.weight > 0.3 ? 'warning' : 'info',
      action: `Alert: ${edge.source} shift detected — ${domain} likely affected in ${edge.lagDays}d`,
      enabled: true,
    }));

    // Check current anomaly status
    const currentAlerts: Array<{ domain: string; severity: string; message: string }> = [];
    for (const rule of brain.matchedRules.filter(r => r.triggered)) {
      if (rule.naturalLanguage.toLowerCase().includes(domain)) {
        currentAlerts.push({
          domain,
          severity: 'warning',
          message: `Rule triggered: ${rule.title}`,
        });
      }
    }

    const confidence = Math.min(0.9, domainMastery * 1.2 + 0.2);

    const interventions = watchers.slice(0, 2).map(w => ({
      action: `Set up ${w.severity} alert: ${w.condition}`,
      targetDomains: [w.source, domain],
      expectedImpact: `Early warning: ${w.lagDays}d advance notice of ${domain} impact`,
      confidence: confidence,
      evidence: `Causal edge: ${w.source}→${domain}, weight=${(upstreamEdges.find(e => e.source === w.source)?.weight || 0).toFixed(2)}`,
      owner: `${domain} team`,
      effort: 'low' as const,
    }));

    const narrative = `Monitor setup for ${domain}: ${watchers.length} causal watchers defined across ${upstreamEdges.length} upstream signals. ${currentAlerts.length} current alerts active. Domain mastery: ${(domainMastery * 100).toFixed(0)}% — ${domainMastery > 0.7 ? 'high confidence in watcher accuracy' : 'watchers will improve as more data arrives'}.`;

    return {
      data: {
        type: 'monitor',
        watchers,
        currentAlerts,
        domainMastery,
        monitoringCapability: {
          upstreamSignals: upstreamEdges.length,
          ruleCount: brain.matchedRules.length,
          timeSeriesAvailable: brain.timeSeries.has(domain),
        },
      },
      narrative,
      confidence,
      drivers: upstreamEdges.map(e => ({ domain: e.source, weight: e.weight, lagDays: e.lagDays, direction: 'positive' as const })),
      interventions,
      modulesUsed: ['causal-graph', 'monitor-engine'],
      metadata: { watcherCount: watchers.length, currentAlertCount: currentAlerts.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const watchers = data.watchers as Array<{ source: string; condition: string; severity: string; lagDays: number }>;
    const alerts = data.currentAlerts as Array<{ severity: string; message: string }>;

    lines.push(`## 👁️ MONITOR: ${ctx.primaryDomain}`);
    lines.push(`Watchers: ${watchers?.length || 0} | Current Alerts: ${alerts?.length || 0}`);
    lines.push('');

    if (alerts && alerts.length > 0) {
      lines.push('### ⚠️ Current Alerts');
      for (const a of alerts) lines.push(`- [${a.severity}] ${a.message}`);
      lines.push('');
    }

    if (watchers && watchers.length > 0) {
      lines.push('### Configured Watchers');
      for (const w of watchers) {
        lines.push(`- [${w.severity}] ${w.condition} (${w.lagDays}d early warning)`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 8: OPTIMIZE — Goal-Directed Intervention Planning (NEW)
// ============================================================================

export const optimizeDomain: ActionDomainDefinition = defineActionDomain({
  name: 'optimize',
  description: 'Finds the optimal set of interventions to maximize a target metric using causal graph traversal',
  brainAnalog: 'Prefrontal Planning Circuit — goal-directed, evaluates intervention portfolios',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'contextAwareReasoner', 'whatIfSimulator'],
  intents: ['optimize'],
  intentKeywords: ['optimize', 'maximize', 'minimize', 'improve', 'best way to', 'how to increase', 'how to reduce', 'most efficient', 'highest impact'],
  intentPatterns: [
    /\boptimize\b/i,
    /maximize\s+\w+/i,
    /minimize\s+\w+/i,
    /best\s+way\s+to\s+(increase|improve|reduce|grow)/i,
    /how\s+(can|do)\s+(we|i)\s+(increase|improve|reduce|grow)/i,
    /highest\s+impact/i,
  ],
  priority: 60,
  outputSchema: {
    dataType: 'optimization',
    fields: ['targetMetric', 'rankedInterventions', 'portfolioEffect', 'constraints'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'simulate'],
  },
  composableWith: ['simulate', 'forecast', 'recommend', 'narrate'],
  tags: ['new', 'optimization', 'planning'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domain = brain.primaryDomain;

    log(`Optimizing for ${domain}`);

    // Get all upstream levers (things we can change to affect target)
    const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream', 10);

    // Score each lever by: weight × accessibility × cost-effectiveness
    const scoredLevers = upstreamEdges.map(edge => {
      // Accessibility: how many downstream effects does this lever have? (fewer = easier to control)
      const leverDownstream = getTopEdges(brain.dag, edge.source, 'downstream');
      const accessibility = 1 / (1 + leverDownstream.length * 0.1);

      // Speed: inverse of lag (faster impact = better)
      const speed = 1 / (1 + edge.lagDays / 30);

      // Combined optimization score
      const score = edge.weight * 0.5 + accessibility * 0.25 + speed * 0.25;

      return {
        lever: edge.source,
        weight: edge.weight,
        lagDays: edge.lagDays,
        accessibility,
        speed,
        score,
        sideEffects: leverDownstream.filter(e => e.target !== domain).map(e => ({
          domain: e.target,
          impact: e.weight,
          direction: 'positive',
        })),
      };
    }).sort((a, b) => b.score - a.score);

    // Build optimal intervention portfolio
    const portfolio = scoredLevers.slice(0, 5);
    const portfolioEffect = portfolio.reduce((sum, l) => sum + l.weight * 15, 0);

    const confidence = portfolio.length > 0
      ? Math.min(0.9, portfolio[0].score * 1.3)
      : 0.3;

    const interventions = portfolio.map(l => ({
      action: `Optimize ${l.lever} → ${(l.weight * 15).toFixed(0)}% improvement in ${domain} within ${l.lagDays}d`,
      targetDomains: [l.lever, domain],
      expectedImpact: `+${(l.weight * 15).toFixed(0)}% ${domain}`,
      confidence: l.score,
      evidence: `Optimization score: ${l.score.toFixed(2)} (weight=${l.weight.toFixed(2)}, accessibility=${l.accessibility.toFixed(2)}, speed=${l.speed.toFixed(2)})`,
      owner: `${l.lever} team`,
      effort: l.accessibility > 0.7 ? 'low' as const : l.accessibility > 0.4 ? 'medium' as const : 'high' as const,
    }));

    const narrative = `Optimization for ${domain}: ${portfolio.length} intervention levers ranked. Top lever: ${portfolio[0]?.lever || 'none'} (optimization score: ${portfolio[0]?.score.toFixed(2) || 0}). Combined portfolio effect: +${portfolioEffect.toFixed(0)}% improvement. ${portfolio.filter(l => l.sideEffects.length > 0).length} levers have positive side effects on other domains.`;

    return {
      data: {
        type: 'optimization',
        targetDomain: domain,
        scoredLevers,
        portfolio,
        portfolioEffect,
        sideEffectSummary: portfolio.flatMap(l => l.sideEffects),
      },
      narrative,
      confidence,
      drivers: portfolio.map(l => ({ domain: l.lever, weight: l.score, lagDays: l.lagDays, direction: 'positive' as const })),
      interventions,
      modulesUsed: ['causal-graph', 'optimization-engine'],
      metadata: { leversAnalyzed: scoredLevers.length, portfolioSize: portfolio.length, portfolioEffect },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const portfolio = data.portfolio as Array<{ lever: string; score: number; weight: number; lagDays: number; sideEffects: unknown[] }>;

    lines.push(`## 🎯 OPTIMIZATION: ${ctx.primaryDomain}`);
    lines.push(`Portfolio Effect: +${((data.portfolioEffect as number) || 0).toFixed(0)}% | Levers: ${portfolio?.length || 0}`);
    lines.push('');

    if (portfolio && portfolio.length > 0) {
      lines.push('### Ranked Intervention Levers');
      lines.push(formatTable(
        ['Rank', 'Lever', 'Score', 'Impact', 'Lag', 'Side Effects'],
        portfolio.map((l, i) => [
          String(i + 1),
          l.lever,
          l.score.toFixed(2),
          `+${(l.weight * 15).toFixed(0)}%`,
          `${l.lagDays}d`,
          `${l.sideEffects.length} domains`,
        ])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 9: RECOMMEND — Priority-Ranked Action Stack (NEW)
// ============================================================================

export const recommendDomain: ActionDomainDefinition = defineActionDomain({
  name: 'recommend',
  description: 'CTO-grade priority stack: synthesizes all brain knowledge into ranked, actionable recommendations',
  brainAnalog: 'Executive Function — the CEO of the brain, makes final decisions on resource allocation',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'rules', 'patterns', 'calibrationLoop'],
  intents: ['recommend'],
  intentKeywords: ['recommend', 'what should', 'priority', 'focus', 'most important', 'top actions', 'what to do', 'action items', 'next steps', 'this week'],
  intentPatterns: [
    /what\s+should\s+(i|we)\s+(do|focus|prioritize)/i,
    /\brecommend/i,
    /top\s+\d+\s+(actions|priorities|things)/i,
    /what\s+(are|is)\s+(the\s+)?most\s+important/i,
    /this\s+week/i,
  ],
  priority: 75,
  outputSchema: {
    dataType: 'recommendations',
    fields: ['priorityStack', 'urgentItems', 'strategicItems', 'quickWins'],
    composable: false,
    consumableBy: ['narrate'],
  },
  composableWith: ['narrate'],
  tags: ['new', 'executive', 'actionable'],

  execute: async (ctx) => {
    const { brain, log } = ctx;

    log(`Building recommendation stack`);

    // Scan ALL domains for issues and opportunities
    const allDomains = Array.from(brain.dag.nodes);
    const domainScores: Array<{
      domain: string;
      urgency: number;
      impact: number;
      confidence: number;
      category: 'urgent' | 'strategic' | 'quick_win' | 'monitor';
      reasoning: string;
    }> = [];

    for (const domain of allDomains) {
      const upstream = getTopEdges(brain.dag, domain, 'upstream');
      const downstream = getTopEdges(brain.dag, domain, 'downstream');

      // Impact: how many downstream domains does this affect?
      const impact = Math.min(1, downstream.length / 5);

      // Urgency: are there triggered rules or patterns?
      const triggeredRules = brain.matchedRules.filter(r =>
        r.triggered && (r.naturalLanguage.toLowerCase().includes(domain) || r.conditions.some(c => c.includes(domain)))
      );
      const urgency = Math.min(1, triggeredRules.length / 3 + (brain.patterns.filter(p => p.domain === domain).length > 0 ? 0.3 : 0));

      // Confidence: data availability
      const confidence = Math.min(1, (upstream.length + downstream.length) / 8);

      // Category
      let category: 'urgent' | 'strategic' | 'quick_win' | 'monitor';
      if (urgency > 0.6 && impact > 0.5) category = 'urgent';
      else if (impact > 0.5 && urgency <= 0.6) category = 'strategic';
      else if (urgency > 0.3 && upstream.length > 0 && upstream[0].lagDays < 14) category = 'quick_win';
      else category = 'monitor';

      const reasoning = `${domain}: impact=${(impact * 100).toFixed(0)}%, urgency=${(urgency * 100).toFixed(0)}%, ${downstream.length} downstream, ${triggeredRules.length} triggered rules`;

      domainScores.push({ domain, urgency, impact, confidence, category, reasoning });
    }

    // Sort by combined score
    domainScores.sort((a, b) => (b.urgency * 0.4 + b.impact * 0.4 + b.confidence * 0.2) - (a.urgency * 0.4 + a.impact * 0.4 + a.confidence * 0.2));

    const urgent = domainScores.filter(d => d.category === 'urgent').slice(0, 3);
    const strategic = domainScores.filter(d => d.category === 'strategic').slice(0, 3);
    const quickWins = domainScores.filter(d => d.category === 'quick_win').slice(0, 3);

    // Build actionable interventions for top items
    const interventions = domainScores.slice(0, 5).map(d => {
      const topLever = getTopEdges(brain.dag, d.domain, 'upstream', 1)[0];
      return {
        action: topLever
          ? `[${d.category.toUpperCase()}] Optimize ${topLever.source} to improve ${d.domain}`
          : `[${d.category.toUpperCase()}] Investigate ${d.domain} — ${d.reasoning}`,
        targetDomains: [d.domain],
        expectedImpact: `${(d.impact * 100).toFixed(0)}% downstream impact`,
        confidence: d.confidence,
        evidence: d.reasoning,
        owner: `${d.domain} team`,
        effort: d.category === 'quick_win' ? 'low' as const : d.category === 'strategic' ? 'high' as const : 'medium' as const,
      };
    });

    const confidence = domainScores.length > 0
      ? domainScores.slice(0, 5).reduce((s, d) => s + d.confidence, 0) / Math.min(5, domainScores.length)
      : 0.3;

    const narrative = `Priority stack: ${urgent.length} urgent, ${strategic.length} strategic, ${quickWins.length} quick wins across ${allDomains.length} domains. ${urgent.length > 0 ? `Top urgent: ${urgent[0].domain}.` : 'No urgent items.'} ${quickWins.length > 0 ? `Quick win: ${quickWins[0].domain}.` : ''}`;

    return {
      data: {
        type: 'recommendations',
        priorityStack: domainScores.slice(0, 10),
        urgent,
        strategic,
        quickWins,
        totalDomainsScanned: allDomains.length,
      },
      narrative,
      confidence,
      drivers: domainScores.slice(0, 5).map(d => ({
        domain: d.domain,
        weight: d.urgency * 0.5 + d.impact * 0.5,
        lagDays: 0,
        direction: 'positive' as const,
      })),
      interventions,
      modulesUsed: ['causal-graph', 'recommendation-engine', 'rules-engine'],
      metadata: { urgentCount: urgent.length, strategicCount: strategic.length, quickWinCount: quickWins.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const urgent = data.urgent as Array<{ domain: string; urgency: number; impact: number; reasoning: string }>;
    const strategic = data.strategic as Array<{ domain: string; impact: number; reasoning: string }>;
    const quickWins = data.quickWins as Array<{ domain: string; reasoning: string }>;

    lines.push(`## 🚀 RECOMMENDATIONS: Priority Action Stack`);
    lines.push(`Scanned: ${data.totalDomainsScanned} domains | Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    lines.push('');

    if (urgent && urgent.length > 0) {
      lines.push('### 🔴 URGENT (act now)');
      for (const u of urgent) lines.push(`- **${u.domain}**: urgency=${(u.urgency * 100).toFixed(0)}%, impact=${(u.impact * 100).toFixed(0)}%`);
      lines.push('');
    }

    if (strategic && strategic.length > 0) {
      lines.push('### 🟡 STRATEGIC (plan this quarter)');
      for (const s of strategic) lines.push(`- **${s.domain}**: impact=${(s.impact * 100).toFixed(0)}%`);
      lines.push('');
    }

    if (quickWins && quickWins.length > 0) {
      lines.push('### 🟢 QUICK WINS (low effort, fast impact)');
      for (const q of quickWins) lines.push(`- **${q.domain}**: ${q.reasoning}`);
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 10: AUDIT — Assumption Verification (NEW)
// ============================================================================

export const auditDomain: ActionDomainDefinition = defineActionDomain({
  name: 'audit',
  description: 'Traces every causal claim back to evidence, flags unsupported assumptions, checks for confounders',
  brainAnalog: 'Anterior Cingulate — error detection, conflict monitoring, intellectual honesty',
  requires: ['causalDAG'],
  optional: ['rules', 'patterns', 'calibrationLoop'],
  intents: ['audit'],
  intentKeywords: ['audit', 'verify', 'validate', 'check assumptions', 'evidence', 'is this right', 'confidence', 'trust', 'how reliable', 'prove'],
  intentPatterns: [
    /\baudit\b/i,
    /verify\s+(the|our|my)/i,
    /check\s+(the\s+)?assumptions/i,
    /how\s+(reliable|trustworthy|accurate)/i,
    /can\s+(i|we)\s+trust/i,
  ],
  priority: 45,
  outputSchema: {
    dataType: 'audit',
    fields: ['evidenceMap', 'unsupportedClaims', 'confounders', 'dataGaps', 'trustScore'],
    composable: true,
    consumableBy: ['recommend', 'narrate'],
  },
  composableWith: ['explain', 'forecast', 'narrate'],
  tags: ['new', 'integrity', 'verification'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domain = brain.primaryDomain;

    log(`Auditing ${domain}`);

    const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream', 10);

    // Audit each causal claim
    const evidenceMap = upstreamEdges.map(edge => {
      const strength = edge.weight > 0.5 ? 'strong' : edge.weight > 0.25 ? 'moderate' : 'weak';
      const significance = edge.pValue < 0.01 ? 'highly_significant' : edge.pValue < 0.05 ? 'significant' : 'marginal';
      const hasKnockout = (edge as unknown as { knockoutScore?: number }).knockoutScore !== undefined;
      const hasPredictionAccuracy = (edge as unknown as { predictionAccuracy?: number }).predictionAccuracy !== undefined;

      return {
        claim: `${edge.source} → ${domain}`,
        weight: edge.weight,
        pValue: edge.pValue,
        lagDays: edge.lagDays,
        strength,
        significance,
        validatedByCausalIntervention: hasKnockout,
        hasPredictionTrackRecord: hasPredictionAccuracy,
        trustLevel: strength === 'strong' && significance !== 'marginal' ? 'high' : strength === 'moderate' ? 'medium' : 'low',
      };
    });

    // Find unsupported claims (weak + marginal)
    const unsupportedClaims = evidenceMap.filter(e => e.trustLevel === 'low');

    // Find potential confounders
    const confounders: Array<{ source: string; target: string; suspicion: string }> = [];
    for (const edge of upstreamEdges) {
      // Check if there's a common upstream source that drives both
      const edgeSourceUpstream = getTopEdges(brain.dag, edge.source, 'upstream', 3);
      for (const meta of edgeSourceUpstream) {
        const metaToTarget = getTopEdges(brain.dag, domain, 'upstream').find(e => e.source === meta.source);
        if (metaToTarget) {
          confounders.push({
            source: meta.source,
            target: `${edge.source} AND ${domain}`,
            suspicion: `${meta.source} drives both ${edge.source} and ${domain} — the ${edge.source}→${domain} link may be confounded`,
          });
        }
      }
    }

    // Data gaps
    const dataGaps: string[] = [];
    if (!brain.timeSeries.has(domain)) dataGaps.push(`No time series data for ${domain}`);
    if (upstreamEdges.length < 3) dataGaps.push(`Only ${upstreamEdges.length} upstream edges — limited causal coverage`);
    if (brain.matchedRules.length === 0) dataGaps.push('No business rules available for validation');
    if (brain.patterns.filter(p => p.domain === domain).length === 0) dataGaps.push(`No detected patterns for ${domain}`);

    // Trust score
    const avgTrust = evidenceMap.length > 0
      ? evidenceMap.filter(e => e.trustLevel !== 'low').length / evidenceMap.length
      : 0;
    const trustScore = Math.min(0.95, avgTrust * 0.7 + (1 - dataGaps.length / 5) * 0.3);

    const confidence = trustScore;

    const narrative = `Audit for ${domain}: ${evidenceMap.length} causal claims examined. Trust score: ${(trustScore * 100).toFixed(0)}%. ${unsupportedClaims.length} unsupported claims, ${confounders.length} potential confounders, ${dataGaps.length} data gaps. ${unsupportedClaims.length > 0 ? `WARNING: ${unsupportedClaims[0].claim} has weak evidence.` : 'All major claims have supporting evidence.'}`;

    return {
      data: {
        type: 'audit',
        evidenceMap,
        unsupportedClaims,
        confounders,
        dataGaps,
        trustScore,
      },
      narrative,
      confidence,
      drivers: evidenceMap.map(e => ({
        domain: e.claim.split(' → ')[0],
        weight: e.weight,
        lagDays: e.lagDays,
        direction: 'positive' as const,
      })),
      interventions: [
        ...unsupportedClaims.slice(0, 2).map(c => ({
          action: `Gather more evidence for ${c.claim} — currently ${c.strength} with ${c.significance} significance`,
          targetDomains: [c.claim.split(' → ')[0], domain],
          expectedImpact: 'Improved decision confidence',
          confidence: 0.5,
          evidence: `Audit: trust level = ${c.trustLevel}`,
          owner: 'Data team',
          effort: 'medium' as const,
        })),
        ...dataGaps.slice(0, 1).map(gap => ({
          action: `Close data gap: ${gap}`,
          targetDomains: [domain],
          expectedImpact: 'Better audit coverage',
          confidence: 0.6,
          evidence: `Data gap identified during audit`,
          owner: 'Data team',
          effort: 'medium' as const,
        })),
      ],
      modulesUsed: ['causal-graph', 'audit-engine'],
      metadata: { trustScore, unsupportedCount: unsupportedClaims.length, confounderCount: confounders.length, gapCount: dataGaps.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const evidence = data.evidenceMap as Array<{ claim: string; strength: string; significance: string; trustLevel: string }>;
    const unsupported = data.unsupportedClaims as unknown[];
    const confounders = data.confounders as Array<{ suspicion: string }>;
    const gaps = data.dataGaps as string[];

    lines.push(`## 🔎 AUDIT: ${ctx.primaryDomain}`);
    lines.push(`Trust Score: ${((data.trustScore as number) * 100).toFixed(0)}% | Claims: ${evidence?.length || 0} | Issues: ${(unsupported?.length || 0) + (confounders?.length || 0)}`);
    lines.push('');

    if (evidence && evidence.length > 0) {
      lines.push('### Evidence Map');
      lines.push(formatTable(
        ['Claim', 'Strength', 'Significance', 'Trust'],
        evidence.slice(0, 8).map(e => [e.claim, e.strength, e.significance, e.trustLevel])
      ));
      lines.push('');
    }

    if (confounders && confounders.length > 0) {
      lines.push('### ⚠️ Potential Confounders');
      for (const c of confounders.slice(0, 3)) lines.push(`- ${c.suspicion}`);
      lines.push('');
    }

    if (gaps && gaps.length > 0) {
      lines.push('### 📊 Data Gaps');
      for (const g of gaps) lines.push(`- ${g}`);
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 11: CORRELATE — Cross-Domain Co-Movement Discovery (NEW)
// ============================================================================

export const correlateDomain: ActionDomainDefinition = defineActionDomain({
  name: 'correlate',
  description: 'Discovers unexpected co-movements and hidden connections across all domains',
  brainAnalog: 'Pattern Recognition Network — finds structure in noise, discovers what moves together',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'patterns'],
  intents: ['correlate'],
  intentKeywords: ['correlate', 'correlation', 'co-move', 'connected', 'linked', 'what else moves', 'related to', 'associated'],
  intentPatterns: [
    /what\s+else\s+(moves|changes|is\s+affected)/i,
    /\bcorrelat/i,
    /\bconnected\s+to\b/i,
  ],
  priority: 45,
  outputSchema: {
    dataType: 'correlation',
    fields: ['correlationMatrix', 'clusters', 'surprisingConnections', 'isolatedDomains'],
    composable: true,
    consumableBy: ['explain', 'recommend', 'narrate'],
  },
  composableWith: ['explain', 'compare', 'narrate'],
  tags: ['new', 'discovery', 'pattern-recognition'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domain = brain.primaryDomain;

    log(`Discovering correlations for ${domain}`);

    // Build connectivity map for target domain
    const upstream = getTopEdges(brain.dag, domain, 'upstream', 10);
    const downstream = getTopEdges(brain.dag, domain, 'downstream', 10);

    // Find 2nd-degree connections (domains connected through intermediaries)
    const secondDegree: Array<{ domain: string; via: string; strength: number; path: string }> = [];

    for (const up of upstream) {
      const upUpstream = getTopEdges(brain.dag, up.source, 'upstream', 5);
      for (const uu of upUpstream) {
        if (uu.source !== domain && !upstream.some(u => u.source === uu.source)) {
          secondDegree.push({
            domain: uu.source,
            via: up.source,
            strength: uu.weight * up.weight,
            path: `${uu.source} → ${up.source} → ${domain}`,
          });
        }
      }
    }

    for (const down of downstream) {
      const downDownstream = getTopEdges(brain.dag, down.target, 'downstream', 5);
      for (const dd of downDownstream) {
        if (dd.target !== domain && !downstream.some(d => d.target === dd.target)) {
          secondDegree.push({
            domain: dd.target,
            via: down.target,
            strength: dd.weight * down.weight,
            path: `${domain} → ${down.target} → ${dd.target}`,
          });
        }
      }
    }

    // Deduplicate and sort by strength
    const uniqueSecondDegree = secondDegree
      .reduce((acc, item) => {
        const existing = acc.find(a => a.domain === item.domain);
        if (!existing || item.strength > existing.strength) {
          return [...acc.filter(a => a.domain !== item.domain), item];
        }
        return acc;
      }, [] as typeof secondDegree)
      .sort((a, b) => b.strength - a.strength);

    // Identify clusters (groups of domains that co-move)
    const allConnected = new Set([
      ...upstream.map(e => e.source),
      ...downstream.map(e => e.target),
      ...uniqueSecondDegree.map(s => s.domain),
    ]);

    // Isolated domains (nodes with no connection to target)
    const isolatedDomains = Array.from(brain.dag.nodes).filter(n =>
      n !== domain && !allConnected.has(n)
    );

    const confidence = Math.min(0.9, (upstream.length + downstream.length + uniqueSecondDegree.length) / 15);

    const narrative = `Correlation analysis for ${domain}: ${upstream.length} direct upstream, ${downstream.length} direct downstream, ${uniqueSecondDegree.length} 2nd-degree connections. ${uniqueSecondDegree.length > 0 ? `Surprising connection: ${uniqueSecondDegree[0].path} (strength: ${(uniqueSecondDegree[0].strength * 100).toFixed(0)}%).` : ''} ${isolatedDomains.length} domains show no connection to ${domain}.`;

    return {
      data: {
        type: 'correlation',
        directConnections: { upstream, downstream },
        secondDegreeConnections: uniqueSecondDegree,
        isolatedDomains,
        totalReachable: allConnected.size,
      },
      narrative,
      confidence,
      drivers: [
        ...upstream.map(e => ({ domain: e.source, weight: e.weight, lagDays: e.lagDays, direction: 'positive' as const })),
        ...uniqueSecondDegree.slice(0, 3).map(s => ({ domain: s.domain, weight: s.strength, lagDays: 0, direction: 'positive' as const })),
      ],
      interventions: uniqueSecondDegree.slice(0, 2).map(s => ({
        action: `Investigate hidden connection: ${s.path} (${(s.strength * 100).toFixed(0)}% combined strength)`,
        targetDomains: [s.domain, s.via, domain],
        expectedImpact: 'Understanding hidden dependencies',
        confidence: s.strength,
        evidence: `2nd-degree path: ${s.path}`,
        owner: `${s.via} team`,
        effort: 'low' as const,
      })),
      modulesUsed: ['causal-graph', 'correlation-engine'],
      metadata: { directCount: upstream.length + downstream.length, secondDegreeCount: uniqueSecondDegree.length, isolatedCount: isolatedDomains.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const second = data.secondDegreeConnections as Array<{ domain: string; via: string; strength: number; path: string }>;
    const isolated = data.isolatedDomains as string[];

    lines.push(`## 🕸️ CORRELATIONS: ${ctx.primaryDomain}`);
    lines.push(`Reachable: ${data.totalReachable} domains | Hidden Connections: ${second?.length || 0}`);
    lines.push('');

    if (second && second.length > 0) {
      lines.push('### Hidden Connections (2nd degree)');
      for (const s of second.slice(0, 5)) {
        lines.push(`- ${s.path} (${(s.strength * 100).toFixed(0)}% combined)`);
      }
      lines.push('');
    }

    if (isolated && isolated.length > 0) {
      lines.push(`### Isolated (no connection to ${ctx.primaryDomain})`);
      lines.push(isolated.slice(0, 5).join(', '));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 12: BENCHMARK — External Reference Comparison (NEW)
// ============================================================================

export const benchmarkDomain: ActionDomainDefinition = defineActionDomain({
  name: 'benchmark',
  description: 'Compares internal metrics against training pack knowledge — SEC filings, VC benchmarks, case studies',
  brainAnalog: 'Comparative Cortex — evaluates performance against external reference frames',
  requires: ['causalDAG'],
  optional: ['rules', 'patterns', 'timeSeries'],
  intents: ['benchmark'],
  intentKeywords: ['benchmark', 'compare to industry', 'how do we compare', 'industry average', 'best practice', 'standard', 'percentile', 'peer', 'competitive'],
  intentPatterns: [
    /\bbenchmark\b/i,
    /compare\s+(to|with)\s+(industry|peers|competitors)/i,
    /how\s+do\s+(we|our)\s+\w+\s+compare/i,
    /industry\s+(average|standard|benchmark)/i,
  ],
  priority: 40,
  outputSchema: {
    dataType: 'benchmark',
    fields: ['internalMetrics', 'externalBenchmarks', 'gaps', 'strengths'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'optimize'],
  },
  composableWith: ['recommend', 'narrate', 'optimize'],
  tags: ['new', 'comparative', 'external'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domain = brain.primaryDomain;

    log(`Benchmarking ${domain}`);

    // Analyze internal state
    const upstream = getTopEdges(brain.dag, domain, 'upstream');
    const downstream = getTopEdges(brain.dag, domain, 'downstream');
    const domainMastery = computeDomainMastery(brain);

    // Extract knowledge-base benchmarks from patterns and rules
    const domainPatterns = brain.patterns.filter(p => p.domain === domain || p.domain === 'all');
    const relevantRules = brain.matchedRules.filter(r =>
      r.naturalLanguage.toLowerCase().includes(domain) ||
      r.naturalLanguage.toLowerCase().includes('benchmark') ||
      r.naturalLanguage.toLowerCase().includes('industry')
    );

    // Build benchmark comparison
    const benchmarks = [
      {
        metric: 'Causal complexity',
        internal: `${upstream.length} upstream + ${downstream.length} downstream edges`,
        benchmark: 'Typical SaaS: 5-8 per domain',
        gap: upstream.length + downstream.length < 5 ? 'below_average' : upstream.length + downstream.length > 10 ? 'above_average' : 'average',
        insight: upstream.length + downstream.length > 8
          ? `${domain} has rich causal structure — high-confidence analysis possible`
          : `${domain} causal structure is thin — more data needed for reliable analysis`,
      },
      {
        metric: 'Data coverage',
        internal: brain.timeSeries.has(domain) ? 'Time series available' : 'No time series',
        benchmark: 'Best practice: daily time series per domain',
        gap: brain.timeSeries.has(domain) ? 'meets_standard' : 'below_standard',
        insight: brain.timeSeries.has(domain) ? 'Good data coverage for forecasting' : 'Missing time series data limits forecasting accuracy',
      },
      {
        metric: 'Rule coverage',
        internal: `${relevantRules.length} rules`,
        benchmark: 'Mature systems: 5+ rules per domain',
        gap: relevantRules.length >= 5 ? 'above_average' : relevantRules.length >= 2 ? 'average' : 'below_average',
        insight: relevantRules.length >= 3 ? 'Business logic well-captured' : 'More business rules would improve diagnosis accuracy',
      },
      {
        metric: 'Pattern detection',
        internal: `${domainPatterns.length} patterns`,
        benchmark: 'Active systems: 3+ patterns per domain',
        gap: domainPatterns.length >= 3 ? 'above_average' : domainPatterns.length >= 1 ? 'average' : 'below_average',
        insight: domainPatterns.length > 0 ? 'Statistical patterns detected' : 'No patterns detected — either stable or insufficient data',
      },
    ];

    const strengths = benchmarks.filter(b => b.gap === 'above_average' || b.gap === 'meets_standard');
    const gaps = benchmarks.filter(b => b.gap === 'below_average' || b.gap === 'below_standard');

    const confidence = Math.min(0.85, domainMastery * 0.8 + 0.2);

    const narrative = `Benchmark for ${domain}: ${strengths.length} strengths, ${gaps.length} gaps. Domain mastery: ${(domainMastery * 100).toFixed(0)}%. ${strengths.length > 0 ? `Strength: ${strengths[0].metric}.` : ''} ${gaps.length > 0 ? `Gap: ${gaps[0].metric} — ${gaps[0].insight}` : 'All benchmarks met.'}`;

    return {
      data: {
        type: 'benchmark',
        benchmarks,
        strengths,
        gaps,
        domainMastery,
        knowledgeBase: {
          patterns: domainPatterns.length,
          rules: relevantRules.length,
        },
      },
      narrative,
      confidence,
      drivers: [],
      interventions: gaps.slice(0, 3).map(g => ({
        action: `Close benchmark gap: ${g.metric} — ${g.insight}`,
        targetDomains: [domain],
        expectedImpact: 'Improved analysis quality',
        confidence: 0.6,
        evidence: `Benchmark: ${g.internal} vs ${g.benchmark}`,
        owner: 'Data team',
        effort: 'medium' as const,
      })),
      modulesUsed: ['causal-graph', 'benchmark-engine', 'knowledge-base'],
      metadata: { strengthCount: strengths.length, gapCount: gaps.length, domainMastery },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const benchmarks = data.benchmarks as Array<{ metric: string; internal: string; benchmark: string; gap: string }>;

    lines.push(`## 📊 BENCHMARK: ${ctx.primaryDomain}`);
    lines.push(`Domain Mastery: ${((data.domainMastery as number) * 100).toFixed(0)}%`);
    lines.push('');

    if (benchmarks && benchmarks.length > 0) {
      lines.push(formatTable(
        ['Metric', 'Internal', 'Benchmark', 'Status'],
        benchmarks.map(b => [b.metric, b.internal, b.benchmark, b.gap.replace('_', ' ')])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 13: NARRATE — Investor-Grade Communication (NEW)
// ============================================================================

export const narrateDomain: ActionDomainDefinition = defineActionDomain({
  name: 'narrate',
  description: 'Produces investor-grade narratives grounded in causal evidence — board updates, reports, briefings',
  brainAnalog: "Broca's Area — language production, converts complex analysis into clear communication",
  requires: ['causalDAG'],
  optional: ['llmAmplifier', 'timeSeries', 'rules'],
  intents: ['narrate'],
  intentKeywords: ['write', 'draft', 'compose', 'board update', 'investor update', 'briefing', 'summary', 'report', 'narrative', 'communicate', 'present'],
  intentPatterns: [
    /write\s+(a|an|the)\s+(board|investor|executive|team)/i,
    /\bdraft\s+(a|an)/i,
    /board\s+update/i,
    /investor\s+update/i,
    /executive\s+(summary|briefing)/i,
  ],
  priority: 50,
  outputSchema: {
    dataType: 'narrative',
    fields: ['executiveSummary', 'sections', 'keyMetrics', 'outlook', 'risks'],
    composable: false,
  },
  composableWith: [],
  tags: ['new', 'communication', 'reporting'],

  execute: async (ctx) => {
    const { brain, log } = ctx;

    log(`Generating narrative`);

    // Gather intelligence from all domains
    const allDomains = Array.from(brain.dag.nodes);
    const domainSummaries: Array<{
      domain: string;
      upstreamCount: number;
      downstreamCount: number;
      topDriver: string;
      triggeredRules: number;
      health: 'strong' | 'moderate' | 'weak';
    }> = [];

    for (const domain of allDomains.slice(0, 10)) {
      const up = getTopEdges(brain.dag, domain, 'upstream', 3);
      const down = getTopEdges(brain.dag, domain, 'downstream', 3);
      const rules = brain.matchedRules.filter(r => r.triggered && r.naturalLanguage.toLowerCase().includes(domain));

      domainSummaries.push({
        domain,
        upstreamCount: up.length,
        downstreamCount: down.length,
        topDriver: up[0]?.source || 'none',
        triggeredRules: rules.length,
        health: rules.length > 2 ? 'weak' : up.length + down.length > 5 ? 'strong' : 'moderate',
      });
    }

    const strong = domainSummaries.filter(d => d.health === 'strong');
    const weak = domainSummaries.filter(d => d.health === 'weak');
    const triggeredRuleCount = brain.matchedRules.filter(r => r.triggered).length;

    // Build executive summary sections
    const sections = [
      {
        title: 'Business Health Overview',
        content: `${allDomains.length} domains tracked. ${strong.length} strong, ${domainSummaries.length - strong.length - weak.length} moderate, ${weak.length} need attention. ${triggeredRuleCount} business rules currently triggered.`,
      },
      {
        title: 'Key Strengths',
        content: strong.length > 0
          ? strong.map(d => `${d.domain}: ${d.downstreamCount} downstream domains influenced, driven by ${d.topDriver}`).join('. ')
          : 'No domains currently showing strong performance signals.',
      },
      {
        title: 'Areas Requiring Attention',
        content: weak.length > 0
          ? weak.map(d => `${d.domain}: ${d.triggeredRules} rules triggered — investigate root causes`).join('. ')
          : 'No domains flagged for immediate attention.',
      },
      {
        title: 'Causal Intelligence',
        content: `The brain tracks ${brain.dag.nodes.size} nodes with causal relationships. ${brain.patterns.length} statistical patterns detected. ${brain.cascadePaths.length} cross-domain cascade paths identified.`,
      },
    ];

    const confidence = Math.min(0.85, allDomains.length / 15 + 0.3);

    const narrative = `Executive briefing: ${allDomains.length} domains, ${strong.length} strong, ${weak.length} need attention. ${triggeredRuleCount} rules triggered. The causal graph contains ${brain.dag.nodes.size} nodes providing ${allDomains.length > 10 ? 'comprehensive' : 'moderate'} coverage.`;

    return {
      data: {
        type: 'narrative',
        sections,
        domainSummaries,
        keyMetrics: {
          totalDomains: allDomains.length,
          strongDomains: strong.length,
          weakDomains: weak.length,
          triggeredRules: triggeredRuleCount,
          dagNodes: brain.dag.nodes.size,
        },
      },
      narrative,
      confidence,
      drivers: domainSummaries.slice(0, 5).map(d => ({
        domain: d.domain,
        weight: d.health === 'strong' ? 0.8 : d.health === 'moderate' ? 0.5 : 0.3,
        lagDays: 0,
        direction: 'positive' as const,
      })),
      interventions: weak.slice(0, 3).map(d => ({
        action: `Address ${d.domain} — ${d.triggeredRules} rules triggered, needs investigation`,
        targetDomains: [d.domain],
        expectedImpact: 'Improved domain health',
        confidence: 0.6,
        evidence: `${d.triggeredRules} rules triggered`,
        owner: `${d.domain} team`,
        effort: 'medium' as const,
      })),
      modulesUsed: ['causal-graph', 'narrative-engine', 'rules-engine'],
      metadata: { sectionCount: sections.length, domainCount: allDomains.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const sections = data.sections as Array<{ title: string; content: string }>;
    const metrics = data.keyMetrics as Record<string, number>;

    lines.push(`## 📝 EXECUTIVE BRIEFING`);
    lines.push(`Domains: ${metrics?.totalDomains || 0} | Strong: ${metrics?.strongDomains || 0} | Attention: ${metrics?.weakDomains || 0} | Rules: ${metrics?.triggeredRules || 0}`);
    lines.push('');

    if (sections) {
      for (const s of sections) {
        lines.push(`### ${s.title}`);
        lines.push(s.content);
        lines.push('');
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 14: SENTIMENT — Organizational Mood & Signal Tone Analysis (V6.1)
// ============================================================================

export const sentimentDomain: ActionDomainDefinition = defineActionDomain({
  name: 'sentiment',
  description: 'Analyzes the emotional tone and momentum direction of business signals — detects fear, optimism, panic, complacency across domains',
  brainAnalog: 'Amygdala — emotional signal processing, threat/opportunity detection',
  requires: ['causalDAG', 'timeSeries'],
  optional: ['contextAwareReasoner', 'llmAmplifier'],
  intents: ['sentiment'],
  intentKeywords: ['sentiment', 'mood', 'tone', 'feeling', 'morale', 'confidence level', 'team health', 'optimism', 'pessimism', 'fear', 'panic', 'complacency', 'momentum'],
  intentPatterns: [
    /\bsentiment\b/i,
    /\bmood\b/i,
    /how\s+(is|are)\s+(the\s+)?(team|org|company)\s+(feeling|doing)/i,
    /\bmorale\b/i,
    /\bmomentum\b/i,
    /\btone\b.*\b(signals?|data|metrics)\b/i,
  ],
  priority: 45,
  outputSchema: {
    dataType: 'sentiment_analysis',
    fields: ['domainSentiments', 'overallMood', 'moodShifts', 'divergences', 'alerts'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'monitor'],
  },
  composableWith: ['recommend', 'narrate', 'monitor', 'diagnose'],
  tags: ['advanced', 'emotional-intelligence', 'signal-tone'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    log('Analyzing organizational sentiment');

    // Analyze momentum for each domain with time series data
    const domainSentiments: Array<{
      domain: string;
      momentum: 'accelerating' | 'decelerating' | 'stable' | 'volatile';
      trend: 'improving' | 'declining' | 'flat';
      signalStrength: number;
      riskTone: 'fear' | 'caution' | 'neutral' | 'optimism' | 'euphoria';
    }> = [];

    for (const [domainName, ts] of brain.timeSeries) {
      const values = (ts as unknown as { values: number[] }).values || [];
      if (values.length < 3) continue;

      // Calculate momentum (rate of change)
      const recent = values.slice(-7);
      const earlier = values.slice(-14, -7);
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const earlierAvg = earlier.length > 0 ? earlier.reduce((s, v) => s + v, 0) / earlier.length : recentAvg;
      const momentumRate = earlierAvg !== 0 ? (recentAvg - earlierAvg) / Math.abs(earlierAvg) : 0;

      // Calculate volatility
      const mean = values.slice(-14).reduce((s, v) => s + v, 0) / Math.min(14, values.length);
      const variance = values.slice(-14).reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.min(14, values.length);
      const volatility = Math.sqrt(variance) / Math.max(0.01, Math.abs(mean));

      // Determine momentum category
      let momentum: typeof domainSentiments[0]['momentum'];
      if (volatility > 0.3) momentum = 'volatile';
      else if (momentumRate > 0.05) momentum = 'accelerating';
      else if (momentumRate < -0.05) momentum = 'decelerating';
      else momentum = 'stable';

      // Determine trend
      const trend = momentumRate > 0.02 ? 'improving' : momentumRate < -0.02 ? 'declining' : 'flat';

      // Determine risk tone based on trend + volatility
      let riskTone: typeof domainSentiments[0]['riskTone'];
      if (momentum === 'volatile' && trend === 'declining') riskTone = 'fear';
      else if (trend === 'declining') riskTone = 'caution';
      else if (momentum === 'accelerating' && volatility < 0.1) riskTone = 'euphoria';
      else if (trend === 'improving') riskTone = 'optimism';
      else riskTone = 'neutral';

      domainSentiments.push({
        domain: domainName,
        momentum,
        trend,
        signalStrength: Math.min(1, 1 - volatility),
        riskTone,
      });
    }

    // Detect mood divergences (one domain fearful while another euphoric)
    const divergences: Array<{ domain1: string; domain2: string; mood1: string; mood2: string; concern: string }> = [];
    for (let i = 0; i < domainSentiments.length; i++) {
      for (let j = i + 1; j < domainSentiments.length; j++) {
        const a = domainSentiments[i];
        const b = domainSentiments[j];
        if ((a.riskTone === 'fear' && b.riskTone === 'euphoria') ||
            (a.riskTone === 'euphoria' && b.riskTone === 'fear')) {
          divergences.push({
            domain1: a.domain, domain2: b.domain,
            mood1: a.riskTone, mood2: b.riskTone,
            concern: `${a.domain} shows ${a.riskTone} while ${b.domain} shows ${b.riskTone} — investigate disconnect`,
          });
        }
      }
    }

    // Calculate overall organizational mood
    const moodScores = { fear: 0, caution: 0, neutral: 0, optimism: 0, euphoria: 0 };
    for (const ds of domainSentiments) moodScores[ds.riskTone]++;
    const overallMood = (Object.entries(moodScores) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    // Alerts
    const alerts: string[] = [];
    const fearDomains = domainSentiments.filter(d => d.riskTone === 'fear');
    if (fearDomains.length > 0) alerts.push(`Fear detected in: ${fearDomains.map(d => d.domain).join(', ')}`);
    const euphoriaDomains = domainSentiments.filter(d => d.riskTone === 'euphoria');
    if (euphoriaDomains.length > 0) alerts.push(`Euphoria risk in: ${euphoriaDomains.map(d => d.domain).join(', ')} — watch for complacency`);
    if (divergences.length > 0) alerts.push(`${divergences.length} mood divergences detected — organizational alignment needed`);

    const confidence = domainSentiments.length > 3 ? 0.75 : domainSentiments.length > 0 ? 0.5 : 0.2;

    return {
      data: {
        type: 'sentiment_analysis',
        domainSentiments,
        overallMood,
        divergences,
        alerts,
        moodDistribution: moodScores,
        domainsAnalyzed: domainSentiments.length,
      },
      narrative: `Organizational sentiment: ${overallMood}. ${domainSentiments.length} domains analyzed. ${fearDomains.length} in fear, ${euphoriaDomains.length} euphoric. ${divergences.length} mood divergences. ${alerts.length} alerts generated.`,
      confidence,
      drivers: domainSentiments.slice(0, 5).map(d => ({
        domain: d.domain, weight: d.signalStrength, lagDays: 0,
        direction: d.trend === 'improving' ? 'positive' as const : d.trend === 'declining' ? 'negative' as const : 'positive' as const,
      })),
      interventions: fearDomains.slice(0, 3).map(d => ({
        action: `Investigate fear signals in ${d.domain} — momentum is ${d.momentum}, trend is ${d.trend}`,
        targetDomains: [d.domain],
        expectedImpact: 'Prevent panic-driven decisions',
        confidence: 0.6,
        evidence: `${d.domain} shows ${d.riskTone} with ${d.momentum} momentum`,
        owner: `${d.domain} team lead`,
        effort: 'low' as const,
      })),
      modulesUsed: ['time-series-momentum', 'sentiment-engine'],
      metadata: { domainsAnalyzed: domainSentiments.length, alerts: alerts.length, divergences: divergences.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const sentiments = data.domainSentiments as Array<{ domain: string; riskTone: string; momentum: string; trend: string }>;

    lines.push(`## 🎭 SENTIMENT: Organizational Mood Analysis`);
    lines.push(`Overall Mood: ${data.overallMood} | Domains: ${(data.domainsAnalyzed as number) || 0} | Alerts: ${(data.alerts as string[])?.length || 0}`);
    lines.push('');

    if (sentiments && sentiments.length > 0) {
      lines.push('### Domain Sentiment Map');
      lines.push(formatTable(
        ['Domain', 'Tone', 'Momentum', 'Trend'],
        sentiments.slice(0, 8).map(s => [s.domain, s.riskTone, s.momentum, s.trend])
      ));
    }

    const alerts = data.alerts as string[];
    if (alerts && alerts.length > 0) {
      lines.push('');
      lines.push('### ⚠️ Alerts');
      for (const a of alerts) lines.push(`- ${a}`);
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 15: SCENARIO-TREE — Branching Future Analysis (V6.1)
// ============================================================================

export const scenarioTreeDomain: ActionDomainDefinition = defineActionDomain({
  name: 'scenario-tree',
  description: 'Builds a branching tree of possible futures with probability-weighted paths — best case, worst case, and every fork in between',
  brainAnalog: 'Hippocampal Prospection — mental time travel, branching future simulation',
  requires: ['causalDAG', 'timeSeries'],
  optional: ['whatIfSimulator', 'temporalForecaster', 'llmAmplifier'],
  intents: ['scenario-tree'],
  intentKeywords: ['scenario tree', 'branching', 'possible futures', 'best case', 'worst case', 'probability', 'what could happen', 'range of outcomes', 'scenario planning', 'contingency', 'decision tree'],
  intentPatterns: [
    /\bscenario\s+tree\b/i,
    /\bbranch(ing)?\s+(future|scenario|analys)/i,
    /\bbest\s+case.*worst\s+case/i,
    /\brange\s+of\s+outcomes?\b/i,
    /\bpossible\s+futures?\b/i,
    /\bcontingency\s+plan/i,
    /\bdecision\s+tree\b/i,
  ],
  priority: 55,
  outputSchema: {
    dataType: 'scenario_tree',
    fields: ['branches', 'probabilities', 'expectedValue', 'worstCase', 'bestCase'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'optimize'],
  },
  composableWith: ['forecast', 'simulate', 'recommend', 'narrate', 'risk-cascade'],
  tags: ['advanced', 'strategic', 'branching-futures'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const domain = brain.primaryDomain;
    log(`Building scenario tree for ${domain}`);

    const upstreamEdges = getTopEdges(brain.dag, domain, 'upstream', 5);
    const downstreamEdges = getTopEdges(brain.dag, domain, 'downstream', 3);

    // Build scenario branches based on each major driver's possible states
    const branches: Array<{
      name: string;
      probability: number;
      drivers: Array<{ domain: string; assumption: string; direction: 'up' | 'down' | 'flat' }>;
      impactOnTarget: number;
      timeline: string;
      keyRisks: string[];
    }> = [];

    // Branch 1: Base case (current trajectory continues)
    branches.push({
      name: 'Base Case — Current Trajectory',
      probability: 0.45,
      drivers: upstreamEdges.slice(0, 3).map(e => ({
        domain: e.source, assumption: `${e.source} continues current trend`, direction: 'flat' as const,
      })),
      impactOnTarget: 0,
      timeline: `${brain.horizonDays} days`,
      keyRisks: ['Assumes no external shocks', 'Historical patterns may not repeat'],
    });

    // Branch 2: Upside case (top drivers improve)
    const upsideImpact = upstreamEdges.slice(0, 3).reduce((sum, e) => sum + e.weight * 15, 0);
    branches.push({
      name: 'Upside — Key Drivers Strengthen',
      probability: 0.25,
      drivers: upstreamEdges.slice(0, 3).map(e => ({
        domain: e.source, assumption: `${e.source} improves 15-25%`, direction: 'up' as const,
      })),
      impactOnTarget: upsideImpact,
      timeline: `${Math.max(...upstreamEdges.slice(0, 3).map(e => e.lagDays), 30)}d to materialize`,
      keyRisks: ['Requires sustained improvement across multiple domains', 'Capacity constraints may limit upside'],
    });

    // Branch 3: Downside case (top drivers deteriorate)
    branches.push({
      name: 'Downside — Key Drivers Weaken',
      probability: 0.20,
      drivers: upstreamEdges.slice(0, 3).map(e => ({
        domain: e.source, assumption: `${e.source} declines 10-20%`, direction: 'down' as const,
      })),
      impactOnTarget: -upsideImpact * 0.8,
      timeline: `${Math.min(...upstreamEdges.slice(0, 3).map(e => e.lagDays), 14)}d to show impact`,
      keyRisks: ['Cascade effects may amplify downside', 'Recovery may take 2-3x the impact timeline'],
    });

    // Branch 4: Black swan (cascading failure)
    branches.push({
      name: 'Black Swan — Cascading Disruption',
      probability: 0.10,
      drivers: [
        { domain: 'external', assumption: 'Major market or operational disruption', direction: 'down' as const },
        ...upstreamEdges.slice(0, 2).map(e => ({
          domain: e.source, assumption: `${e.source} collapses unexpectedly`, direction: 'down' as const,
        })),
      ],
      impactOnTarget: -upsideImpact * 2,
      timeline: 'Immediate to 30d',
      keyRisks: ['Low probability but extreme impact', 'Standard playbooks insufficient — need crisis response'],
    });

    // Expected value calculation
    const expectedValue = branches.reduce((sum, b) => sum + b.probability * b.impactOnTarget, 0);

    // Decision gates — what triggers moving from base to upside/downside
    const decisionGates = upstreamEdges.slice(0, 3).map(e => ({
      driver: e.source,
      upsideTrigger: `${e.source} improves >10% sustained for 2+ weeks`,
      downsideTrigger: `${e.source} declines >8% for 1+ week`,
      monitorFrequency: 'weekly',
    }));

    const confidence = upstreamEdges.length > 2 ? 0.7 : upstreamEdges.length > 0 ? 0.45 : 0.2;

    return {
      data: {
        type: 'scenario_tree',
        branches,
        expectedValue,
        bestCase: branches.find(b => b.name.includes('Upside')),
        worstCase: branches.find(b => b.name.includes('Black Swan')),
        decisionGates,
        branchCount: branches.length,
      },
      narrative: `Scenario tree for ${domain}: ${branches.length} branches. Expected value: ${expectedValue > 0 ? '+' : ''}${expectedValue.toFixed(1)}%. Base case (${(branches[0].probability * 100).toFixed(0)}% likely): status quo. Upside: +${upsideImpact.toFixed(0)}%. Downside: -${(upsideImpact * 0.8).toFixed(0)}%. Black swan: -${(upsideImpact * 2).toFixed(0)}%. ${decisionGates.length} decision gates identified.`,
      confidence,
      drivers: upstreamEdges.slice(0, 5).map(e => ({
        domain: e.source, weight: e.weight, lagDays: e.lagDays,
        direction: e.weight > 0 ? 'positive' as const : 'negative' as const,
      })),
      interventions: [
        {
          action: `Prepare contingency plans for the ${branches.length} identified scenarios — focus on early warning triggers`,
          targetDomains: [domain, ...upstreamEdges.slice(0, 2).map(e => e.source)],
          expectedImpact: 'Reduce downside exposure by 30-40% through early action',
          confidence: 0.65,
          evidence: `${decisionGates.length} decision gates with specific trigger criteria`,
          owner: `${domain} strategy team`,
          effort: 'medium' as const,
        },
      ],
      modulesUsed: ['causal-dag-analysis', 'scenario-branching-engine'],
      metadata: { branches: branches.length, decisionGates: decisionGates.length, expectedValue },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const branches = data.branches as Array<{ name: string; probability: number; impactOnTarget: number; timeline: string }>;

    lines.push(`## 🌳 SCENARIO TREE: ${ctx.primaryDomain}`);
    lines.push(`Expected Value: ${((data.expectedValue as number) || 0) > 0 ? '+' : ''}${((data.expectedValue as number) || 0).toFixed(1)}% | Branches: ${branches?.length || 0}`);
    lines.push('');

    if (branches) {
      lines.push(formatTable(
        ['Scenario', 'Probability', 'Impact', 'Timeline'],
        branches.map(b => [
          b.name, `${(b.probability * 100).toFixed(0)}%`,
          `${b.impactOnTarget > 0 ? '+' : ''}${b.impactOnTarget.toFixed(0)}%`, b.timeline,
        ])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 16: RISK-CASCADE — Cascading Risk Propagation Analysis (V6.1)
// ============================================================================

export const riskCascadeDomain: ActionDomainDefinition = defineActionDomain({
  name: 'risk-cascade',
  description: 'Maps how risks propagate through the causal graph — finds the fastest and most destructive failure paths, identifies systemic risks and single points of failure',
  brainAnalog: 'Insular Cortex — risk perception, interoception of organizational health threats',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'whatIfSimulator'],
  intents: ['risk-cascade'],
  intentKeywords: ['risk', 'cascade', 'propagate', 'domino effect', 'contagion', 'systemic', 'single point of failure', 'vulnerability', 'fragility', 'exposure', 'what could go wrong', 'failure mode'],
  intentPatterns: [
    /\brisk\s+cascade\b/i,
    /\bdomino\s+effect\b/i,
    /\bsingle\s+point\s+of\s+failure\b/i,
    /what\s+could\s+go\s+wrong/i,
    /\bfailure\s+mode/i,
    /\bsystemic\s+risk/i,
    /\bvulnerab(le|ility)\b/i,
    /\bfragil(e|ity)\b/i,
  ],
  priority: 55,
  outputSchema: {
    dataType: 'risk_cascade',
    fields: ['cascadePaths', 'singlePointsOfFailure', 'systemicRisk', 'vulnerabilityMap', 'mitigations'],
    composable: true,
    consumableBy: ['recommend', 'monitor', 'scenario-tree', 'narrate'],
  },
  composableWith: ['monitor', 'scenario-tree', 'recommend', 'narrate', 'diagnose'],
  tags: ['advanced', 'risk', 'systemic'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    log('Analyzing risk cascade paths');

    // Build full adjacency for path traversal
    const adjacency = new Map<string, Array<{ target: string; weight: number; lagDays: number }>>();
    for (const [source, targets] of brain.dag.edges) {
      const edges: Array<{ target: string; weight: number; lagDays: number }> = [];
      for (const [target, edge] of targets) {
        edges.push({ target, weight: edge.weight, lagDays: edge.lagDays });
      }
      adjacency.set(source, edges);
    }

    // Find single points of failure — nodes where many paths converge
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    for (const node of brain.dag.nodes) {
      inDegree.set(node, 0);
      outDegree.set(node, 0);
    }
    for (const [source, targets] of brain.dag.edges) {
      for (const [target] of targets) {
        outDegree.set(source, (outDegree.get(source) || 0) + 1);
        inDegree.set(target, (inDegree.get(target) || 0) + 1);
      }
    }

    // Betweenness centrality approximation — nodes that bridge many paths
    const centrality = new Map<string, number>();
    for (const node of brain.dag.nodes) {
      const inD = inDegree.get(node) || 0;
      const outD = outDegree.get(node) || 0;
      centrality.set(node, inD * outD); // Bridge score
    }

    const singlePointsOfFailure = [...centrality.entries()]
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([node, score]) => ({
        domain: node,
        bridgeScore: score,
        inDegree: inDegree.get(node) || 0,
        outDegree: outDegree.get(node) || 0,
        risk: score > 4 ? 'critical' : score > 2 ? 'high' : 'medium',
        description: `${node} connects ${inDegree.get(node)} inputs to ${outDegree.get(node)} outputs — failure here cascades widely`,
      }));

    // Find fastest cascade paths (BFS from each node)
    const cascadePaths: Array<{
      source: string;
      path: string[];
      totalLagDays: number;
      cumulativeImpact: number;
      domainsAffected: number;
    }> = [];

    for (const startNode of brain.dag.nodes) {
      const visited = new Set<string>();
      const queue: Array<{ node: string; path: string[]; totalLag: number; cumulativeWeight: number }> = [
        { node: startNode, path: [startNode], totalLag: 0, cumulativeWeight: 1 }
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.node)) continue;
        visited.add(current.node);

        const neighbors = adjacency.get(current.node) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.target)) {
            const newPath = [...current.path, neighbor.target];
            const newLag = current.totalLag + neighbor.lagDays;
            const newWeight = current.cumulativeWeight * neighbor.weight;

            if (newPath.length <= 5) { // Max depth 5
              queue.push({ node: neighbor.target, path: newPath, totalLag: newLag, cumulativeWeight: newWeight });
            }

            if (newPath.length >= 3) {
              cascadePaths.push({
                source: startNode,
                path: newPath,
                totalLagDays: newLag,
                cumulativeImpact: newWeight * 100,
                domainsAffected: newPath.length - 1,
              });
            }
          }
        }
      }
    }

    // Sort by destructiveness (most domains affected × highest impact)
    cascadePaths.sort((a, b) => (b.domainsAffected * b.cumulativeImpact) - (a.domainsAffected * a.cumulativeImpact));
    const topCascades = cascadePaths.slice(0, 8);

    // Systemic risk score
    const maxCentrality = Math.max(...[...centrality.values()], 1);
    const systemicRiskScore = Math.min(1, (singlePointsOfFailure.filter(s => s.risk === 'critical').length * 0.3) +
      (topCascades.length > 5 ? 0.3 : topCascades.length * 0.06) +
      (maxCentrality > 6 ? 0.4 : maxCentrality * 0.067));

    // Build mitigations
    const mitigations = singlePointsOfFailure.slice(0, 3).map(spof => ({
      action: `Reduce concentration risk in ${spof.domain} by diversifying inputs or adding redundancy`,
      targetDomains: [spof.domain],
      expectedImpact: `Reduce cascade risk by ${Math.min(40, spof.bridgeScore * 10)}%`,
      confidence: 0.6,
      evidence: `${spof.domain} has bridge score ${spof.bridgeScore} (${spof.inDegree} in, ${spof.outDegree} out)`,
      owner: `${spof.domain} team + risk committee`,
      effort: 'high' as const,
    }));

    const confidence = brain.dag.nodes.size > 5 ? 0.75 : brain.dag.nodes.size > 2 ? 0.5 : 0.25;

    return {
      data: {
        type: 'risk_cascade',
        singlePointsOfFailure,
        cascadePaths: topCascades,
        systemicRiskScore,
        systemicRiskLevel: systemicRiskScore > 0.7 ? 'critical' : systemicRiskScore > 0.4 ? 'elevated' : 'moderate',
        nodesAnalyzed: brain.dag.nodes.size,
        totalPaths: cascadePaths.length,
      },
      narrative: `Risk cascade analysis: ${brain.dag.nodes.size} nodes, ${cascadePaths.length} propagation paths found. Systemic risk: ${(systemicRiskScore * 100).toFixed(0)}% (${systemicRiskScore > 0.7 ? 'CRITICAL' : systemicRiskScore > 0.4 ? 'ELEVATED' : 'MODERATE'}). ${singlePointsOfFailure.length} single points of failure — ${singlePointsOfFailure.filter(s => s.risk === 'critical').length} critical. Fastest cascade path: ${topCascades[0]?.path.join(' → ') || 'none'} (${topCascades[0]?.totalLagDays || 0}d).`,
      confidence,
      drivers: singlePointsOfFailure.slice(0, 5).map(s => ({
        domain: s.domain, weight: s.bridgeScore / maxCentrality, lagDays: 0,
        direction: 'negative' as const,
      })),
      interventions: mitigations,
      modulesUsed: ['causal-dag-analysis', 'cascade-propagation-engine', 'centrality-analysis'],
      metadata: { systemicRiskScore, singlePoints: singlePointsOfFailure.length, cascadePaths: topCascades.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const spofs = data.singlePointsOfFailure as Array<{ domain: string; risk: string; bridgeScore: number }>;
    const cascades = data.cascadePaths as Array<{ path: string[]; totalLagDays: number; cumulativeImpact: number }>;

    lines.push(`## ⚡ RISK CASCADE: Systemic Risk Analysis`);
    lines.push(`Systemic Risk: ${((data.systemicRiskScore as number) * 100).toFixed(0)}% (${data.systemicRiskLevel}) | Nodes: ${data.nodesAnalyzed} | Paths: ${data.totalPaths}`);
    lines.push('');

    if (spofs && spofs.length > 0) {
      lines.push('### Single Points of Failure');
      lines.push(formatTable(
        ['Domain', 'Risk', 'Bridge Score'],
        spofs.map(s => [s.domain, s.risk, String(s.bridgeScore)])
      ));
      lines.push('');
    }

    if (cascades && cascades.length > 0) {
      lines.push('### Top Cascade Paths');
      for (const c of cascades.slice(0, 5)) {
        lines.push(`- ${c.path.join(' → ')} (${c.totalLagDays}d, ${c.cumulativeImpact.toFixed(1)}% impact)`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 17: RESOURCE-ALLOCATE — Optimal Resource Distribution (V6.1)
// ============================================================================

export const resourceAllocateDomain: ActionDomainDefinition = defineActionDomain({
  name: 'resource-allocate',
  description: 'Determines optimal allocation of budget, headcount, or effort across domains using causal impact analysis — every dollar goes where the brain says it has maximum effect',
  brainAnalog: 'Dorsolateral Prefrontal Cortex — resource planning, allocation optimization, constraint satisfaction',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'contextAwareReasoner'],
  intents: ['resource-allocate'],
  intentKeywords: ['allocate', 'resource', 'budget', 'headcount', 'distribute', 'invest', 'spend', 'where to put money', 'hiring plan', 'budget allocation', 'investment priority', 'capacity planning'],
  intentPatterns: [
    /\ballocat(e|ion)\b/i,
    /\bbudget\s+(allocat|distribut|plan)/i,
    /where\s+(should|to)\s+(we\s+)?(invest|spend|allocate|hire)/i,
    /\bheadcount\s+(plan|allocat)/i,
    /\bcapacity\s+plan/i,
    /\bhiring\s+plan/i,
    /how\s+should\s+(we\s+)?(distribute|split|allocate)/i,
  ],
  priority: 55,
  outputSchema: {
    dataType: 'resource_allocation',
    fields: ['allocations', 'totalBudget', 'expectedROI', 'constraints', 'tradeoffs'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'optimize'],
  },
  composableWith: ['optimize', 'forecast', 'recommend', 'narrate', 'risk-cascade'],
  tags: ['advanced', 'resource-planning', 'allocation'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const targetDomain = brain.primaryDomain;
    log(`Optimizing resource allocation for ${targetDomain}`);

    // Get all domains that influence the target
    const upstreamEdges = getTopEdges(brain.dag, targetDomain, 'upstream', 10);

    // Score each domain by: causal impact × time efficiency × diminishing returns
    const allocationCandidates = upstreamEdges.map(edge => {
      const impactScore = edge.weight; // How much this domain affects target
      const timeEfficiency = 1 / (1 + edge.lagDays / 60); // Faster impact = higher score
      const pValuePenalty = edge.pValue < 0.05 ? 1 : edge.pValue < 0.1 ? 0.7 : 0.4; // Statistical confidence

      // Combined allocation score
      const score = impactScore * 0.5 + timeEfficiency * 0.3 + pValuePenalty * 0.2;

      return {
        domain: edge.source,
        impactScore,
        timeEfficiency,
        statisticalConfidence: pValuePenalty,
        allocationScore: score,
        lagDays: edge.lagDays,
        weight: edge.weight,
      };
    }).sort((a, b) => b.allocationScore - a.allocationScore);

    // Normalize allocation scores to percentages
    const totalScore = allocationCandidates.reduce((sum, c) => sum + c.allocationScore, 0);
    const allocations = allocationCandidates.map(c => ({
      ...c,
      allocationPercent: totalScore > 0 ? (c.allocationScore / totalScore) * 100 : 0,
      rationale: `${c.domain} drives ${(c.weight * 100).toFixed(0)}% of ${targetDomain} with ${c.lagDays}d lag — ${c.allocationScore > 0.5 ? 'high priority' : 'moderate priority'} investment`,
    }));

    // Calculate expected ROI for this allocation
    const expectedROI = allocations.reduce((sum, a) => sum + a.allocationPercent * a.impactScore * 0.15, 0);

    // Identify tradeoffs — domains that compete for resources
    const tradeoffs: Array<{ domain1: string; domain2: string; tension: string }> = [];
    for (let i = 0; i < Math.min(3, allocations.length); i++) {
      for (let j = i + 1; j < Math.min(5, allocations.length); j++) {
        if (Math.abs(allocations[i].allocationScore - allocations[j].allocationScore) < 0.1) {
          tradeoffs.push({
            domain1: allocations[i].domain,
            domain2: allocations[j].domain,
            tension: `${allocations[i].domain} (${allocations[i].lagDays}d faster) vs ${allocations[j].domain} (${((allocations[j].impactScore - allocations[i].impactScore) * 100).toFixed(0)}% higher impact) — similar ROI, choose based on urgency vs magnitude`,
          });
        }
      }
    }

    const confidence = allocations.length > 3 ? 0.8 : allocations.length > 0 ? 0.55 : 0.2;

    return {
      data: {
        type: 'resource_allocation',
        targetDomain,
        allocations: allocations.slice(0, 8),
        expectedROI,
        tradeoffs,
        candidatesAnalyzed: allocationCandidates.length,
      },
      narrative: `Resource allocation for ${targetDomain}: ${allocations.length} investment domains ranked. Top allocation: ${allocations[0]?.domain || 'none'} (${allocations[0]?.allocationPercent.toFixed(0) || 0}%). Expected portfolio ROI: ${expectedROI.toFixed(1)}%. ${tradeoffs.length} tradeoffs identified requiring judgment calls.`,
      confidence,
      drivers: allocations.slice(0, 5).map(a => ({
        domain: a.domain, weight: a.allocationScore, lagDays: a.lagDays,
        direction: 'positive' as const,
      })),
      interventions: allocations.slice(0, 3).map(a => ({
        action: `Allocate ${a.allocationPercent.toFixed(0)}% of resources to ${a.domain} — ${a.rationale}`,
        targetDomains: [a.domain, targetDomain],
        expectedImpact: `+${(a.impactScore * 15).toFixed(0)}% ${targetDomain} improvement within ${a.lagDays}d`,
        confidence: a.statisticalConfidence,
        evidence: `Allocation score: ${a.allocationScore.toFixed(2)} (impact=${a.impactScore.toFixed(2)}, speed=${a.timeEfficiency.toFixed(2)}, stats=${a.statisticalConfidence.toFixed(2)})`,
        owner: `${a.domain} team + finance`,
        effort: a.allocationPercent > 25 ? 'high' as const : a.allocationPercent > 10 ? 'medium' as const : 'low' as const,
      })),
      modulesUsed: ['causal-dag-analysis', 'resource-optimizer'],
      metadata: { candidatesAnalyzed: allocationCandidates.length, tradeoffs: tradeoffs.length, expectedROI },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const allocations = data.allocations as Array<{ domain: string; allocationPercent: number; impactScore: number; lagDays: number }>;

    lines.push(`## 💰 RESOURCE ALLOCATION: ${ctx.primaryDomain}`);
    lines.push(`Expected ROI: ${((data.expectedROI as number) || 0).toFixed(1)}% | Candidates: ${data.candidatesAnalyzed}`);
    lines.push('');

    if (allocations && allocations.length > 0) {
      lines.push(formatTable(
        ['Rank', 'Domain', 'Allocation', 'Impact', 'Time to Impact'],
        allocations.map((a, i) => [
          String(i + 1), a.domain, `${a.allocationPercent.toFixed(0)}%`,
          `${(a.impactScore * 100).toFixed(0)}%`, `${a.lagDays}d`,
        ])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 18: ANOMALY-PREDICT — Predictive Anomaly Detection (V6.1)
// ============================================================================

export const anomalyPredictDomain: ActionDomainDefinition = defineActionDomain({
  name: 'anomaly-predict',
  description: 'Predicts FUTURE anomalies before they happen by analyzing trend acceleration, pattern breaks, and causal tension — the brain sees problems coming before the data shows them',
  brainAnalog: 'Anterior Cingulate Cortex — error prediction, pre-conscious anomaly detection',
  requires: ['causalDAG', 'timeSeries'],
  optional: ['temporalForecaster', 'contextAwareReasoner'],
  intents: ['anomaly-predict'],
  intentKeywords: ['predict anomaly', 'early warning', 'detect problems', 'foresee', 'upcoming issues', 'emerging risk', 'red flag', 'warning sign', 'trouble ahead', 'what problems are coming'],
  intentPatterns: [
    /\bpredict\s+(anomal|problem|issue|risk)/i,
    /\bearly\s+warning/i,
    /\bwhat\s+(problems?|issues?|risks?)\s+(are|could be)\s+(coming|ahead|emerging)/i,
    /\bred\s+flag/i,
    /\bwarning\s+sign/i,
    /\bforesee\b/i,
    /\bemerging\s+(risk|threat|problem|issue)/i,
  ],
  priority: 60,
  outputSchema: {
    dataType: 'anomaly_prediction',
    fields: ['predictedAnomalies', 'earlyWarnings', 'causalTensions', 'timeToAnomaly'],
    composable: true,
    consumableBy: ['recommend', 'monitor', 'risk-cascade', 'diagnose'],
  },
  composableWith: ['risk-cascade', 'monitor', 'diagnose', 'recommend', 'narrate'],
  tags: ['advanced', 'predictive', 'anomaly-detection'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    log('Predicting future anomalies');

    const predictedAnomalies: Array<{
      domain: string;
      type: 'trend_acceleration' | 'pattern_break' | 'causal_tension' | 'volatility_spike' | 'divergence';
      probability: number;
      estimatedDaysToAnomaly: number;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      evidence: string;
    }> = [];

    // Analyze each domain for pre-anomaly signals
    for (const [domainName, ts] of brain.timeSeries) {
      const values = (ts as unknown as { values: number[] }).values || [];
      if (values.length < 14) continue;

      const recent7 = values.slice(-7);
      const prev7 = values.slice(-14, -7);
      const prev14 = values.slice(-28, -14);

      const recentMean = recent7.reduce((s, v) => s + v, 0) / recent7.length;
      const prevMean = prev7.reduce((s, v) => s + v, 0) / prev7.length;
      const historicalMean = prev14.length > 0 ? prev14.reduce((s, v) => s + v, 0) / prev14.length : prevMean;

      // Signal 1: Trend acceleration (rate of change is increasing)
      const rate1 = prevMean !== 0 ? (recentMean - prevMean) / Math.abs(prevMean) : 0;
      const rate2 = historicalMean !== 0 ? (prevMean - historicalMean) / Math.abs(historicalMean) : 0;
      const acceleration = rate1 - rate2;

      if (Math.abs(acceleration) > 0.1) {
        predictedAnomalies.push({
          domain: domainName,
          type: 'trend_acceleration',
          probability: Math.min(0.85, Math.abs(acceleration) * 2),
          estimatedDaysToAnomaly: Math.max(3, Math.round(14 / (Math.abs(acceleration) * 10))),
          severity: Math.abs(acceleration) > 0.3 ? 'critical' : Math.abs(acceleration) > 0.2 ? 'high' : 'medium',
          description: `${domainName} trend is ${acceleration > 0 ? 'accelerating upward' : 'accelerating downward'} — rate of change increasing`,
          evidence: `Acceleration: ${(acceleration * 100).toFixed(1)}%. Rate now: ${(rate1 * 100).toFixed(1)}%, was: ${(rate2 * 100).toFixed(1)}%`,
        });
      }

      // Signal 2: Volatility spike (variance suddenly increasing)
      const recentVariance = recent7.reduce((s, v) => s + Math.pow(v - recentMean, 2), 0) / recent7.length;
      const prevVariance = prev7.reduce((s, v) => s + Math.pow(v - prevMean, 2), 0) / prev7.length;
      const volatilityRatio = prevVariance > 0 ? recentVariance / prevVariance : 1;

      if (volatilityRatio > 2) {
        predictedAnomalies.push({
          domain: domainName,
          type: 'volatility_spike',
          probability: Math.min(0.75, volatilityRatio * 0.15),
          estimatedDaysToAnomaly: Math.max(2, Math.round(7 / volatilityRatio)),
          severity: volatilityRatio > 4 ? 'critical' : volatilityRatio > 3 ? 'high' : 'medium',
          description: `${domainName} volatility spiked ${volatilityRatio.toFixed(1)}x — instability detected`,
          evidence: `Variance ratio: ${volatilityRatio.toFixed(2)}. Recent variance: ${recentVariance.toFixed(4)}, previous: ${prevVariance.toFixed(4)}`,
        });
      }
    }

    // Signal 3: Causal tension — when connected domains diverge
    for (const [source, targets] of brain.dag.edges) {
      for (const [target, edge] of targets) {
        const sourceTS = brain.timeSeries.get(source);
        const targetTS = brain.timeSeries.get(target);
        if (!sourceTS || !targetTS) continue;

        const sourceValues = (sourceTS as unknown as { values: number[] }).values || [];
        const targetValues = (targetTS as unknown as { values: number[] }).values || [];
        if (sourceValues.length < 7 || targetValues.length < 7) continue;

        const sourceRecent = sourceValues.slice(-7).reduce((s, v) => s + v, 0) / 7;
        const sourcePrev = sourceValues.slice(-14, -7).reduce((s, v) => s + v, 0) / Math.min(7, sourceValues.slice(-14, -7).length || 1);
        const targetRecent = targetValues.slice(-7).reduce((s, v) => s + v, 0) / 7;
        const targetPrev = targetValues.slice(-14, -7).reduce((s, v) => s + v, 0) / Math.min(7, targetValues.slice(-14, -7).length || 1);

        const sourceDirection = sourcePrev !== 0 ? (sourceRecent - sourcePrev) / Math.abs(sourcePrev) : 0;
        const targetDirection = targetPrev !== 0 ? (targetRecent - targetPrev) / Math.abs(targetPrev) : 0;

        // Tension: source going one way, target going the opposite (but they should be correlated)
        if (edge.weight > 0.3 && sourceDirection * targetDirection < -0.02) {
          predictedAnomalies.push({
            domain: target,
            type: 'causal_tension',
            probability: Math.min(0.8, edge.weight * Math.abs(sourceDirection - targetDirection)),
            estimatedDaysToAnomaly: edge.lagDays,
            severity: edge.weight > 0.5 ? 'high' : 'medium',
            description: `Causal tension: ${source} moving ${sourceDirection > 0 ? 'up' : 'down'} but ${target} moving ${targetDirection > 0 ? 'up' : 'down'} — causally linked (weight: ${edge.weight.toFixed(2)})`,
            evidence: `${source} trend: ${(sourceDirection * 100).toFixed(1)}%, ${target} trend: ${(targetDirection * 100).toFixed(1)}%. Causal weight: ${edge.weight.toFixed(2)}, lag: ${edge.lagDays}d`,
          });
        }
      }
    }

    // Sort by probability × severity
    const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    predictedAnomalies.sort((a, b) => (b.probability * severityWeight[b.severity]) - (a.probability * severityWeight[a.severity]));

    const topAnomalies = predictedAnomalies.slice(0, 10);
    const criticalCount = topAnomalies.filter(a => a.severity === 'critical').length;
    const confidence = topAnomalies.length > 3 ? 0.7 : topAnomalies.length > 0 ? 0.5 : 0.3;

    return {
      data: {
        type: 'anomaly_prediction',
        predictedAnomalies: topAnomalies,
        totalDetected: predictedAnomalies.length,
        criticalCount,
        earliestAnomaly: topAnomalies[0]?.estimatedDaysToAnomaly || null,
        typeDistribution: {
          trend_acceleration: topAnomalies.filter(a => a.type === 'trend_acceleration').length,
          volatility_spike: topAnomalies.filter(a => a.type === 'volatility_spike').length,
          causal_tension: topAnomalies.filter(a => a.type === 'causal_tension').length,
        },
      },
      narrative: `Anomaly prediction: ${predictedAnomalies.length} potential anomalies detected. ${criticalCount} critical. Earliest expected in ${topAnomalies[0]?.estimatedDaysToAnomaly || '?'}d (${topAnomalies[0]?.domain || 'unknown'}: ${topAnomalies[0]?.type || ''}). Top risk: ${topAnomalies[0]?.description || 'none detected'}.`,
      confidence,
      drivers: topAnomalies.slice(0, 5).map(a => ({
        domain: a.domain, weight: a.probability, lagDays: a.estimatedDaysToAnomaly,
        direction: 'negative' as const,
      })),
      interventions: topAnomalies.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 3).map(a => ({
        action: `Preemptive action on ${a.domain}: ${a.description}. Expected in ~${a.estimatedDaysToAnomaly}d`,
        targetDomains: [a.domain],
        expectedImpact: `Prevent ${a.severity} anomaly before it materializes`,
        confidence: a.probability,
        evidence: a.evidence,
        owner: `${a.domain} team lead`,
        effort: a.severity === 'critical' ? 'high' as const : 'medium' as const,
      })),
      modulesUsed: ['time-series-analysis', 'anomaly-prediction-engine', 'causal-tension-detector'],
      metadata: { totalDetected: predictedAnomalies.length, criticalCount, typeCounts: { trend: topAnomalies.filter(a => a.type === 'trend_acceleration').length, volatility: topAnomalies.filter(a => a.type === 'volatility_spike').length, tension: topAnomalies.filter(a => a.type === 'causal_tension').length } },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const anomalies = data.predictedAnomalies as Array<{ domain: string; type: string; probability: number; estimatedDaysToAnomaly: number; severity: string; description: string }>;

    lines.push(`## 🔮 ANOMALY PREDICTION: Future Risk Radar`);
    lines.push(`Detected: ${data.totalDetected} | Critical: ${data.criticalCount} | Earliest: ${(data.earliestAnomaly as number) || '?'}d`);
    lines.push('');

    if (anomalies && anomalies.length > 0) {
      lines.push(formatTable(
        ['Domain', 'Type', 'Prob', 'ETA', 'Severity'],
        anomalies.slice(0, 8).map(a => [
          a.domain, a.type, `${(a.probability * 100).toFixed(0)}%`,
          `${a.estimatedDaysToAnomaly}d`, a.severity,
        ])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 19: GOAL-DECOMPOSE — Strategic Goal → Executable Steps (V6.1)
// ============================================================================

export const goalDecomposeDomain: ActionDomainDefinition = defineActionDomain({
  name: 'goal-decompose',
  description: 'Takes a high-level strategic goal and decomposes it into a causal execution plan — the brain maps EXACTLY which levers to pull, in what order, with what milestones, to reach the goal',
  brainAnalog: 'Prefrontal Executive Network — goal decomposition, means-end analysis, hierarchical planning',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'temporalForecaster', 'llmAmplifier'],
  intents: ['goal-decompose'],
  intentKeywords: ['goal', 'achieve', 'reach', 'get to', 'how do we', 'plan to', 'roadmap', 'strategy for', 'path to', 'steps to', 'grow to', 'reduce to', 'hit target', 'OKR', 'milestone'],
  intentPatterns: [
    /\bhow\s+(do|can)\s+(we|i)\s+(achieve|reach|get\s+to|grow|hit|reduce|increase)/i,
    /\bplan\s+to\s+(achieve|reach|grow|reduce|increase)/i,
    /\broadmap\s+(for|to)\b/i,
    /\bsteps?\s+to\s+(achieve|reach|grow|increase|reduce)/i,
    /\bpath\s+to\b/i,
    /\bgoal\s+(decompos|break(down|ing))/i,
    /\bOKR\b/i,
  ],
  priority: 60,
  outputSchema: {
    dataType: 'goal_decomposition',
    fields: ['goal', 'causalPath', 'phases', 'levers', 'milestones', 'dependencies'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'optimize', 'resource-allocate'],
  },
  composableWith: ['optimize', 'resource-allocate', 'forecast', 'recommend', 'narrate'],
  tags: ['advanced', 'strategic', 'goal-planning'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const targetDomain = brain.primaryDomain;
    log(`Decomposing goal for ${targetDomain}`);

    // Find ALL causal paths that lead to the target domain
    const upstreamEdges = getTopEdges(brain.dag, targetDomain, 'upstream', 10);
    const downstreamEffects = getTopEdges(brain.dag, targetDomain, 'downstream', 5);

    // Build lever hierarchy: direct levers → indirect levers → enabling conditions
    const directLevers = upstreamEdges.filter(e => e.weight > 0.2).map(e => ({
      lever: e.source,
      type: 'direct' as const,
      impact: e.weight,
      lagDays: e.lagDays,
      actionable: true,
    }));

    // Find second-order levers (things that affect the direct levers)
    const indirectLevers: Array<{ lever: string; type: 'direct' | 'indirect'; impact: number; lagDays: number; actionable: boolean }> = [];
    for (const dl of directLevers) {
      const secondOrder = getTopEdges(brain.dag, dl.lever, 'upstream', 3);
      for (const so of secondOrder) {
        if (!directLevers.find(d => d.lever === so.source) && !indirectLevers.find(i => i.lever === so.source)) {
          indirectLevers.push({
            lever: so.source,
            type: 'indirect' as const,
            impact: so.weight * dl.impact, // Cascading impact
            lagDays: so.lagDays + dl.lagDays,
            actionable: true,
          });
        }
      }
    }

    const allLevers = [...directLevers, ...indirectLevers].sort((a, b) => b.impact - a.impact);

    // Build phased execution plan based on lag times
    const quickWins = allLevers.filter(l => l.lagDays <= 14 && l.type === 'direct');
    const mediumTerm = allLevers.filter(l => l.lagDays > 14 && l.lagDays <= 60);
    const longTerm = allLevers.filter(l => l.lagDays > 60);

    const phases = [
      {
        name: 'Phase 1: Quick Wins (Week 1-2)',
        timeframe: '0-14 days',
        levers: quickWins.slice(0, 3),
        milestones: quickWins.slice(0, 3).map(l => ({
          metric: `${l.lever} improvement`,
          target: `+${(l.impact * 10).toFixed(0)}%`,
          deadline: `${l.lagDays}d`,
          owner: `${l.lever} team`,
        })),
        expectedImpact: quickWins.reduce((s, l) => s + l.impact * 15, 0),
      },
      {
        name: 'Phase 2: Foundation Building (Month 1-2)',
        timeframe: '14-60 days',
        levers: mediumTerm.slice(0, 4),
        milestones: mediumTerm.slice(0, 4).map(l => ({
          metric: `${l.lever} improvement`,
          target: `+${(l.impact * 10).toFixed(0)}%`,
          deadline: `${l.lagDays}d`,
          owner: `${l.lever} team`,
        })),
        expectedImpact: mediumTerm.reduce((s, l) => s + l.impact * 15, 0),
      },
      {
        name: 'Phase 3: Strategic Transformation (Month 2+)',
        timeframe: '60+ days',
        levers: longTerm.slice(0, 3),
        milestones: longTerm.slice(0, 3).map(l => ({
          metric: `${l.lever} improvement`,
          target: `+${(l.impact * 10).toFixed(0)}%`,
          deadline: `${l.lagDays}d`,
          owner: `${l.lever} team`,
        })),
        expectedImpact: longTerm.reduce((s, l) => s + l.impact * 15, 0),
      },
    ].filter(p => p.levers.length > 0);

    // Dependency graph
    const dependencies: Array<{ from: string; to: string; reason: string }> = [];
    for (const il of indirectLevers) {
      const dependsOn = directLevers.find(dl => {
        const edges = getTopEdges(brain.dag, dl.lever, 'upstream', 5);
        return edges.some(e => e.source === il.lever);
      });
      if (dependsOn) {
        dependencies.push({
          from: il.lever,
          to: dependsOn.lever,
          reason: `${il.lever} must improve first for ${dependsOn.lever} to see gains (${il.lagDays}d lag)`,
        });
      }
    }

    const totalExpectedImpact = phases.reduce((s, p) => s + p.expectedImpact, 0);
    const confidence = allLevers.length > 3 ? 0.75 : allLevers.length > 0 ? 0.5 : 0.2;

    return {
      data: {
        type: 'goal_decomposition',
        targetDomain,
        directLevers,
        indirectLevers,
        allLevers: allLevers.slice(0, 10),
        phases,
        dependencies,
        downstreamEffects: downstreamEffects.map(e => ({ domain: e.target, impact: e.weight })),
        totalExpectedImpact,
      },
      narrative: `Goal decomposition for ${targetDomain}: ${allLevers.length} levers identified (${directLevers.length} direct, ${indirectLevers.length} indirect). ${phases.length} execution phases. Quick wins: ${quickWins.length} levers within 14d. Total expected impact: +${totalExpectedImpact.toFixed(0)}%. ${dependencies.length} dependencies mapped.`,
      confidence,
      drivers: allLevers.slice(0, 5).map(l => ({
        domain: l.lever, weight: l.impact, lagDays: l.lagDays,
        direction: 'positive' as const,
      })),
      interventions: allLevers.slice(0, 4).map(l => ({
        action: `${l.type === 'direct' ? 'Directly' : 'Indirectly'} improve ${l.lever} to drive ${targetDomain} (+${(l.impact * 15).toFixed(0)}% within ${l.lagDays}d)`,
        targetDomains: [l.lever, targetDomain],
        expectedImpact: `+${(l.impact * 15).toFixed(0)}% ${targetDomain}`,
        confidence: l.impact,
        evidence: `${l.type} lever with ${(l.impact * 100).toFixed(0)}% causal weight, ${l.lagDays}d lag`,
        owner: `${l.lever} team`,
        effort: l.lagDays > 60 ? 'high' as const : l.lagDays > 14 ? 'medium' as const : 'low' as const,
      })),
      modulesUsed: ['causal-dag-analysis', 'goal-decomposition-engine', 'dependency-mapper'],
      metadata: { directLevers: directLevers.length, indirectLevers: indirectLevers.length, phases: phases.length, dependencies: dependencies.length },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const phases = data.phases as Array<{ name: string; timeframe: string; expectedImpact: number; levers: Array<{ lever: string; impact: number; lagDays: number }> }>;

    lines.push(`## 🎯 GOAL DECOMPOSITION: ${ctx.primaryDomain}`);
    lines.push(`Levers: ${(data.directLevers as unknown[])?.length || 0} direct + ${(data.indirectLevers as unknown[])?.length || 0} indirect | Expected Impact: +${((data.totalExpectedImpact as number) || 0).toFixed(0)}%`);
    lines.push('');

    if (phases) {
      for (const phase of phases) {
        lines.push(`### ${phase.name}`);
        lines.push(`Timeframe: ${phase.timeframe} | Expected: +${phase.expectedImpact.toFixed(0)}%`);
        for (const l of phase.levers) {
          lines.push(`- **${l.lever}**: ${(l.impact * 100).toFixed(0)}% influence, ${l.lagDays}d lag`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 20: CAUSAL-INTERVENE — Precision Intervention Targeting (V6.1)
// ============================================================================

export const causalInterveneDomain: ActionDomainDefinition = defineActionDomain({
  name: 'causal-intervene',
  description: 'Identifies the SINGLE most impactful causal intervention — the one edge in the graph where applying pressure creates maximum downstream effect with minimum side-effects',
  brainAnalog: 'Basal Ganglia — action selection, reward prediction, precision motor control for interventions',
  requires: ['causalDAG'],
  optional: ['timeSeries', 'whatIfSimulator', 'contextAwareReasoner'],
  intents: ['causal-intervene'],
  intentKeywords: ['intervene', 'lever', 'single most impactful', 'biggest lever', 'where to push', 'intervention point', 'acupuncture point', 'highest leverage', 'precision intervention', 'surgical strike'],
  intentPatterns: [
    /\bintervene\b/i,
    /\bbiggest\s+lever\b/i,
    /\bsingle\s+most\s+(impactful|important)/i,
    /where\s+(should|to)\s+(we\s+)?push/i,
    /\bhighest\s+leverage\b/i,
    /\bprecision\s+intervention\b/i,
    /\bacupuncture\s+point/i,
    /one\s+thing\s+(to|we\s+should)\s+(do|change|fix|improve)/i,
  ],
  priority: 65,
  outputSchema: {
    dataType: 'causal_intervention',
    fields: ['topIntervention', 'alternativeInterventions', 'sideEffectAnalysis', 'confidenceAnalysis'],
    composable: true,
    consumableBy: ['recommend', 'narrate', 'simulate', 'goal-decompose'],
  },
  composableWith: ['simulate', 'forecast', 'goal-decompose', 'recommend', 'narrate'],
  tags: ['advanced', 'causal', 'precision-targeting'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    const targetDomain = brain.primaryDomain;
    log(`Finding precision intervention for ${targetDomain}`);

    const upstreamEdges = getTopEdges(brain.dag, targetDomain, 'upstream', 10);

    // Score each potential intervention by: direct impact + cascade multiplier - side effect risk
    const interventionCandidates = upstreamEdges.map(edge => {
      // Direct impact
      const directImpact = edge.weight;

      // Cascade multiplier — does this lever also affect other domains positively?
      const leverDownstream = getTopEdges(brain.dag, edge.source, 'downstream');
      const positiveSpill = leverDownstream.filter(e => e.target !== targetDomain && e.weight > 0);
      const negativeSpill = leverDownstream.filter(e => e.weight < 0);
      const cascadeMultiplier = 1 + (positiveSpill.length * 0.1);

      // Side effect risk — does intervening here hurt other domains?
      const sideEffectRisk = negativeSpill.reduce((sum, e) => sum + Math.abs(e.weight), 0);

      // Controllability — how many inputs does this lever have? (fewer = more controllable)
      const leverUpstream = getTopEdges(brain.dag, edge.source, 'upstream');
      const controllability = 1 / (1 + leverUpstream.length * 0.15);

      // Statistical confidence
      const statConfidence = edge.pValue < 0.01 ? 1.0 : edge.pValue < 0.05 ? 0.8 : 0.5;

      // Combined intervention score
      const score = (directImpact * 0.4 + cascadeMultiplier * 0.15 + controllability * 0.15 + statConfidence * 0.15) - (sideEffectRisk * 0.15);

      return {
        lever: edge.source,
        directImpact,
        cascadeMultiplier,
        sideEffectRisk,
        controllability,
        statConfidence,
        score,
        lagDays: edge.lagDays,
        positiveSpillover: positiveSpill.map(e => ({ domain: e.target, impact: e.weight })),
        negativeSpillover: negativeSpill.map(e => ({ domain: e.target, impact: e.weight })),
        upstreamDependencies: leverUpstream.length,
      };
    }).sort((a, b) => b.score - a.score);

    const topIntervention = interventionCandidates[0] || null;
    const alternatives = interventionCandidates.slice(1, 4);

    // Why this intervention is THE one
    const rationale = topIntervention
      ? `${topIntervention.lever} is the precision intervention point because: ` +
        `${(topIntervention.directImpact * 100).toFixed(0)}% direct effect on ${targetDomain}, ` +
        `${topIntervention.cascadeMultiplier.toFixed(2)}x cascade multiplier, ` +
        `${topIntervention.positiveSpillover.length} positive side effects, ` +
        `${(topIntervention.controllability * 100).toFixed(0)}% controllable, ` +
        `p-value ${topIntervention.statConfidence >= 0.8 ? 'strong' : 'moderate'}. ` +
        `Time to impact: ${topIntervention.lagDays}d.`
      : 'No viable intervention found — insufficient causal data.';

    const confidence = topIntervention ? Math.min(0.9, topIntervention.score * 1.2) : 0.1;

    return {
      data: {
        type: 'causal_intervention',
        targetDomain,
        topIntervention,
        alternatives,
        rationale,
        candidatesAnalyzed: interventionCandidates.length,
      },
      narrative: rationale,
      confidence,
      drivers: interventionCandidates.slice(0, 5).map(c => ({
        domain: c.lever, weight: c.score, lagDays: c.lagDays,
        direction: 'positive' as const,
      })),
      interventions: topIntervention ? [{
        action: `PRECISION INTERVENTION: Focus all effort on ${topIntervention.lever} → ${targetDomain}. Expected +${(topIntervention.directImpact * 15).toFixed(0)}% impact in ${topIntervention.lagDays}d`,
        targetDomains: [topIntervention.lever, targetDomain],
        expectedImpact: `+${(topIntervention.directImpact * 15).toFixed(0)}% ${targetDomain} + ${topIntervention.positiveSpillover.length} bonus domain improvements`,
        confidence: topIntervention.score,
        evidence: rationale,
        owner: `${topIntervention.lever} team lead`,
        effort: topIntervention.controllability > 0.6 ? 'low' as const : 'medium' as const,
      }] : [],
      modulesUsed: ['causal-dag-analysis', 'intervention-scoring-engine', 'spillover-analyzer'],
      metadata: { candidatesAnalyzed: interventionCandidates.length, topScore: topIntervention?.score || 0 },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const top = data.topIntervention as { lever: string; score: number; directImpact: number; lagDays: number; positiveSpillover: unknown[]; controllability: number } | null;
    const alts = data.alternatives as Array<{ lever: string; score: number; directImpact: number; lagDays: number }>;

    lines.push(`## 🎯 PRECISION INTERVENTION: ${ctx.primaryDomain}`);
    if (top) {
      lines.push(`**#1 LEVER: ${top.lever}** (score: ${top.score.toFixed(2)}, impact: ${(top.directImpact * 100).toFixed(0)}%, lag: ${top.lagDays}d, spillover: ${top.positiveSpillover.length} domains)`);
      lines.push(`Controllability: ${(top.controllability * 100).toFixed(0)}%`);
    }
    lines.push('');

    if (alts && alts.length > 0) {
      lines.push('### Alternative Interventions');
      lines.push(formatTable(
        ['Rank', 'Lever', 'Score', 'Impact', 'Lag'],
        alts.map((a, i) => [String(i + 2), a.lever, a.score.toFixed(2), `${(a.directImpact * 100).toFixed(0)}%`, `${a.lagDays}d`])
      ));
    }

    return lines.join('\n');
  },
});

// ============================================================================
// DOMAIN 21: PATTERN-MEMORY — Temporal Pattern Library & Match (V6.1)
// ============================================================================

export const patternMemoryDomain: ActionDomainDefinition = defineActionDomain({
  name: 'pattern-memory',
  description: 'Remembers and matches temporal patterns — recognizes "we have seen this before" situations by comparing current signals to historical pattern library',
  brainAnalog: 'Entorhinal Cortex — pattern completion, episodic memory matching, déjà vu detection',
  requires: ['timeSeries'],
  optional: ['causalDAG', 'contextAwareReasoner'],
  intents: ['pattern-memory'],
  intentKeywords: ['pattern', 'seen before', 'similar to', 'historical', 'recognize', 'déjà vu', 'precedent', 'repeating', 'cycle', 'seasonal', 'looks like last', 'happened before'],
  intentPatterns: [
    /\bpattern\s+(match|recogni|memor)/i,
    /\bseen\s+(this|something\s+like\s+this)\s+before\b/i,
    /\bsimilar\s+to\s+(last|previous|Q[1-4]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /\bhappened?\s+before\b/i,
    /\brepeating\s+(pattern|cycle)/i,
    /\bseasonal\b/i,
    /\bhistorical\s+(pattern|comparison|precedent)/i,
    /\bd[eé]j[aà]\s+vu\b/i,
  ],
  priority: 50,
  outputSchema: {
    dataType: 'pattern_memory',
    fields: ['matchedPatterns', 'currentSignature', 'bestMatch', 'patternLibrary'],
    composable: true,
    consumableBy: ['forecast', 'diagnose', 'anomaly-predict', 'narrate'],
  },
  composableWith: ['forecast', 'diagnose', 'anomaly-predict', 'narrate', 'recommend'],
  tags: ['advanced', 'temporal', 'pattern-recognition'],

  execute: async (ctx) => {
    const { brain, log } = ctx;
    log('Searching pattern memory');

    const matchedPatterns: Array<{
      domain: string;
      patternType: 'seasonal_cycle' | 'growth_acceleration' | 'decline_pattern' | 'volatility_regime' | 'mean_reversion' | 'regime_shift';
      confidence: number;
      periodDays: number;
      description: string;
      whatHappenedLast: string;
      implication: string;
    }> = [];

    for (const [domainName, ts] of brain.timeSeries) {
      const values = (ts as unknown as { values: number[] }).values || [];
      if (values.length < 30) continue;

      // Pattern 1: Seasonal cycle detection (autocorrelation at common periods)
      for (const period of [7, 14, 30, 90]) {
        if (values.length < period * 2) continue;
        const currentSegment = values.slice(-period);
        const previousSegment = values.slice(-period * 2, -period);

        // Compute correlation between segments
        const mean1 = currentSegment.reduce((s, v) => s + v, 0) / currentSegment.length;
        const mean2 = previousSegment.reduce((s, v) => s + v, 0) / previousSegment.length;
        let cov = 0, var1 = 0, var2 = 0;
        for (let i = 0; i < Math.min(currentSegment.length, previousSegment.length); i++) {
          cov += (currentSegment[i] - mean1) * (previousSegment[i] - mean2);
          var1 += (currentSegment[i] - mean1) ** 2;
          var2 += (previousSegment[i] - mean2) ** 2;
        }
        const correlation = (var1 > 0 && var2 > 0) ? cov / (Math.sqrt(var1) * Math.sqrt(var2)) : 0;

        if (correlation > 0.6) {
          matchedPatterns.push({
            domain: domainName,
            patternType: 'seasonal_cycle',
            confidence: Math.min(0.9, correlation),
            periodDays: period,
            description: `${domainName} shows a ${period}-day cycle (correlation: ${correlation.toFixed(2)})`,
            whatHappenedLast: `Previous ${period}-day period: mean=${mean2.toFixed(3)}, current: mean=${mean1.toFixed(3)}`,
            implication: mean1 > mean2
              ? `Currently above historical pattern — ${mean1 > mean2 * 1.1 ? 'possible peak approaching' : 'healthy growth'}`
              : `Currently below historical pattern — ${mean1 < mean2 * 0.9 ? 'watch for continued decline' : 'normal variance'}`,
          });
        }
      }

      // Pattern 2: Regime shift detection (significant mean change)
      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const firstMean = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const secondMean = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      const meanShift = firstMean !== 0 ? Math.abs(secondMean - firstMean) / Math.abs(firstMean) : 0;

      if (meanShift > 0.15) {
        matchedPatterns.push({
          domain: domainName,
          patternType: 'regime_shift',
          confidence: Math.min(0.8, meanShift * 2),
          periodDays: values.length,
          description: `${domainName} underwent a regime shift: ${(meanShift * 100).toFixed(0)}% mean change detected`,
          whatHappenedLast: `Mean shifted from ${firstMean.toFixed(3)} to ${secondMean.toFixed(3)}`,
          implication: secondMean > firstMean
            ? `Upward regime shift — new normal is ${(meanShift * 100).toFixed(0)}% higher. Don't compare to old baseline.`
            : `Downward regime shift — the brain needs to recalibrate expectations ${(meanShift * 100).toFixed(0)}% lower.`,
        });
      }

      // Pattern 3: Mean reversion tendency
      const recent10 = values.slice(-10);
      const overallMean = values.reduce((s, v) => s + v, 0) / values.length;
      const recentMean = recent10.reduce((s, v) => s + v, 0) / recent10.length;
      const deviation = overallMean !== 0 ? (recentMean - overallMean) / Math.abs(overallMean) : 0;

      if (Math.abs(deviation) > 0.15) {
        matchedPatterns.push({
          domain: domainName,
          patternType: 'mean_reversion',
          confidence: Math.min(0.7, Math.abs(deviation) * 2),
          periodDays: values.length,
          description: `${domainName} is ${deviation > 0 ? 'above' : 'below'} long-term mean by ${(Math.abs(deviation) * 100).toFixed(0)}%`,
          whatHappenedLast: `Long-term mean: ${overallMean.toFixed(3)}, recent: ${recentMean.toFixed(3)}`,
          implication: `Historical patterns suggest ${domainName} will ${deviation > 0 ? 'pull back toward' : 'recover toward'} the mean of ${overallMean.toFixed(3)}. Plan for reversion.`,
        });
      }
    }

    // Also include explicitly declared patterns from brain context
    for (const p of brain.patterns) {
      matchedPatterns.push({
        domain: p.domain,
        patternType: 'seasonal_cycle',
        confidence: p.significance,
        periodDays: 0,
        description: p.pattern,
        whatHappenedLast: 'From training data pattern library',
        implication: `Known pattern: ${p.pattern} (significance: ${(p.significance * 100).toFixed(0)}%)`,
      });
    }

    matchedPatterns.sort((a, b) => b.confidence - a.confidence);
    const topPatterns = matchedPatterns.slice(0, 12);

    const bestMatch = topPatterns[0] || null;
    const confidence = topPatterns.length > 3 ? 0.7 : topPatterns.length > 0 ? 0.5 : 0.2;

    return {
      data: {
        type: 'pattern_memory',
        matchedPatterns: topPatterns,
        totalPatternsFound: matchedPatterns.length,
        bestMatch,
        typeDistribution: {
          seasonal_cycle: topPatterns.filter(p => p.patternType === 'seasonal_cycle').length,
          regime_shift: topPatterns.filter(p => p.patternType === 'regime_shift').length,
          mean_reversion: topPatterns.filter(p => p.patternType === 'mean_reversion').length,
        },
        domainsWithPatterns: new Set(topPatterns.map(p => p.domain)).size,
      },
      narrative: `Pattern memory: ${matchedPatterns.length} patterns detected across ${new Set(matchedPatterns.map(p => p.domain)).size} domains. Best match: ${bestMatch?.description || 'none'}. ${topPatterns.filter(p => p.patternType === 'seasonal_cycle').length} seasonal cycles, ${topPatterns.filter(p => p.patternType === 'regime_shift').length} regime shifts, ${topPatterns.filter(p => p.patternType === 'mean_reversion').length} mean reversions.`,
      confidence,
      drivers: topPatterns.slice(0, 5).map(p => ({
        domain: p.domain, weight: p.confidence, lagDays: p.periodDays,
        direction: 'positive' as const,
      })),
      interventions: topPatterns.filter(p => p.patternType === 'regime_shift').slice(0, 2).map(p => ({
        action: `Recalibrate ${p.domain} baselines — regime shift detected. ${p.implication}`,
        targetDomains: [p.domain],
        expectedImpact: 'Accurate baselines prevent false alarms and missed signals',
        confidence: p.confidence,
        evidence: p.description,
        owner: `${p.domain} analytics team`,
        effort: 'low' as const,
      })),
      modulesUsed: ['time-series-analysis', 'autocorrelation-engine', 'regime-detector', 'pattern-library'],
      metadata: { totalPatterns: matchedPatterns.length, types: { seasonal: topPatterns.filter(p => p.patternType === 'seasonal_cycle').length, regimeShift: topPatterns.filter(p => p.patternType === 'regime_shift').length, meanReversion: topPatterns.filter(p => p.patternType === 'mean_reversion').length } },
    };
  },

  formatForPrompt: (result, ctx) => {
    const lines: string[] = [];
    const data = result.data as Record<string, unknown>;
    const patterns = data.matchedPatterns as Array<{ domain: string; patternType: string; confidence: number; description: string; implication: string }>;

    lines.push(`## 🧬 PATTERN MEMORY: Historical Pattern Match`);
    lines.push(`Patterns Found: ${data.totalPatternsFound} | Domains: ${data.domainsWithPatterns}`);
    lines.push('');

    if (patterns && patterns.length > 0) {
      lines.push(formatTable(
        ['Domain', 'Type', 'Confidence', 'Pattern'],
        patterns.slice(0, 8).map(p => [
          p.domain, p.patternType, `${(p.confidence * 100).toFixed(0)}%`,
          p.description.slice(0, 50) + (p.description.length > 50 ? '...' : ''),
        ])
      ));
      lines.push('');
      lines.push('### Implications');
      for (const p of patterns.slice(0, 5)) {
        lines.push(`- **${p.domain}**: ${p.implication}`);
      }
    }

    return lines.join('\n');
  },
});

// ============================================================================
// REGISTER ALL DOMAINS
// ============================================================================

/** All 20 action domains in registration order */
export const ALL_ACTION_DOMAINS: ActionDomainDefinition[] = [
  // Core (V2-V5 refactored)
  forecastDomain,
  simulateDomain,
  explainDomain,
  diagnoseDomain,
  compositeDomain,
  // V6 — Brain Function Expansion
  compareDomain,
  monitorDomain,
  optimizeDomain,
  recommendDomain,
  auditDomain,
  correlateDomain,
  benchmarkDomain,
  narrateDomain,
  // V6.1 — Advanced Brain Cognition
  sentimentDomain,
  scenarioTreeDomain,
  riskCascadeDomain,
  resourceAllocateDomain,
  anomalyPredictDomain,
  goalDecomposeDomain,
  causalInterveneDomain,
  patternMemoryDomain,
];

/**
 * Register all 20 action domains into a registry.
 *
 * @example
 * ```typescript
 * const registry = createActionDomainRegistry({ verbose: true });
 * registerAllActionDomains(registry);
 * // Registry now has all 20 domains ready to execute
 * ```
 */
export function registerAllActionDomains(
  registry: { register: (def: ActionDomainDefinition) => void },
): void {
  for (const domain of ALL_ACTION_DOMAINS) {
    registry.register(domain);
  }
}
