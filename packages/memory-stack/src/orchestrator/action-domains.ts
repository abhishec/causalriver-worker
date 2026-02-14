/**
 * Action Domains V1 — 13 Self-Registering Brain Functions
 * ========================================================
 *
 * Each action domain is a specialized neural pathway in the brain.
 * Instead of a 3,366-line monolith with 27 switch cases, each domain
 * is ~50-100 lines, self-describing, composable, and learnable.
 *
 * The 13 Domains:
 *
 *   CORE (existing V2-V5, refactored):
 *   1. forecast   — Temporal prediction (Temporal Cortex)
 *   2. simulate   — What-if scenario analysis (Imagination Network)
 *   3. explain    — Causal explanation (Wernicke's Area)
 *   4. diagnose   — Root cause diagnosis (Diagnostic Cortex)
 *   5. composite  — Multi-domain synthesis (Association Cortex)
 *
 *   NEW (V6 additions):
 *   6. compare    — Side-by-side domain analysis (Lateral Thinking)
 *   7. monitor    — Persistent brain watchers (Vigilance System)
 *   8. optimize   — Goal-directed intervention planning (Prefrontal Planning)
 *   9. recommend  — Priority-ranked action stack (Executive Function)
 *  10. audit      — Assumption verification (Integrity Checker)
 *  11. correlate  — Cross-domain co-movement discovery (Pattern Recognition)
 *  12. benchmark  — External reference comparison (Comparative Cortex)
 *  13. narrate    — Investor-grade communication (Broca's Area)
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
// REGISTER ALL DOMAINS
// ============================================================================

/** All 13 action domains in registration order */
export const ALL_ACTION_DOMAINS: ActionDomainDefinition[] = [
  // Core (V2-V5 refactored)
  forecastDomain,
  simulateDomain,
  explainDomain,
  diagnoseDomain,
  compositeDomain,
  // New (V6)
  compareDomain,
  monitorDomain,
  optimizeDomain,
  recommendDomain,
  auditDomain,
  correlateDomain,
  benchmarkDomain,
  narrateDomain,
];

/**
 * Register all 13 action domains into a registry.
 *
 * @example
 * ```typescript
 * const registry = createActionDomainRegistry({ verbose: true });
 * registerAllActionDomains(registry);
 * // Registry now has all 13 domains ready to execute
 * ```
 */
export function registerAllActionDomains(
  registry: { register: (def: ActionDomainDefinition) => void },
): void {
  for (const domain of ALL_ACTION_DOMAINS) {
    registry.register(domain);
  }
}
