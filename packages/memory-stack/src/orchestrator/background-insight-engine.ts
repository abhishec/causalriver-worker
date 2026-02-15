/**
 * Background Insight Engine — "Default Mode Network"
 *
 * Like the brain's Default Mode Network that makes unexpected connections
 * when you're not actively thinking, this engine runs in the background
 * discovering insights nobody asked about.
 *
 * It is PROACTIVE, not reactive:
 *   - Scans for unexpected cross-domain correlations
 *   - Detects emerging cascade patterns before they complete
 *   - Generates "Did you know?" intelligence briefings
 *   - Runs "what changed?" analysis between cycles
 *   - Pushes proactive insights to stakeholders
 *
 * The DMN sits between consolidation cycles and fills the gaps:
 *   Consolidation (nightly) → deep learning
 *   DMN (every 2-4 hours)  → surface-level scanning for surprises
 *   Real-time (continuous)  → anomaly monitoring
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

export interface DMNConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Hours between insight scans (default: 4) */
  scanIntervalHours?: number;
  /** Minimum surprise score to surface an insight (default: 0.5) */
  minSurpriseScore?: number;
  /** Maximum insights per scan (default: 10) */
  maxInsightsPerScan?: number;
  /** Notification callback (Slack, webhook, etc.) */
  onInsight?: (insight: ProactiveInsight) => Promise<void>;
  /** Verbose logging */
  verbose?: boolean;
}

export interface ProactiveInsight {
  /** Unique insight ID */
  id: string;
  /** Insight type */
  type: 'unexpected_correlation' | 'emerging_cascade' | 'what_changed' | 'knowledge_gap' | 'prediction_opportunity';
  /** Severity/importance (0-1) */
  importance: number;
  /** Surprise score — how unexpected this finding is (0-1) */
  surpriseScore: number;
  /** Human-readable title */
  title: string;
  /** Detailed explanation */
  explanation: string;
  /** Domains involved */
  domains: string[];
  /** Supporting evidence */
  evidence: InsightEvidence;
  /** When discovered */
  discoveredAt: string;
  /** Whether this insight has been delivered to stakeholders */
  delivered: boolean;
}

export interface InsightEvidence {
  /** Causal edges supporting this insight */
  causalEdges?: Array<{
    source: string;
    target: string;
    effectSize: number;
    pValue: number;
  }>;
  /** Statistical metrics */
  statistics?: {
    correlationStrength?: number;
    sampleSize?: number;
    confidenceInterval?: [number, number];
  };
  /** Comparison with baseline (for "what changed") */
  baseline?: {
    previousValue: number;
    currentValue: number;
    changePercent: number;
    changeDirection: 'increasing' | 'decreasing' | 'stable';
  };
}

export interface DMNScanResult {
  /** Insights discovered in this scan */
  insights: ProactiveInsight[];
  /** How many domains were scanned */
  domainsScanned: number;
  /** How many relationship pairs were tested */
  pairsAnalyzed: number;
  /** Duration in ms */
  durationMs: number;
  /** Scan timestamp */
  scannedAt: string;
}

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// BACKGROUND INSIGHT ENGINE
// ============================================================================

export function createBackgroundInsightEngine(config: DMNConfig) {
  const {
    supabase,
    organizationId,
    minSurpriseScore = 0.65, // Tightened from 0.5: require higher surprise to surface
    maxInsightsPerScan = 5, // Tightened from 10: only surface the top 5 most important
    onInsight,
    verbose = false,
  } = config;

  const repository = createSupabaseRepository(supabase, organizationId);

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [DMN] ${msg}`);
    }
  }

  function generateId(): string {
    return `insight-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // ── Scanner 1: Unexpected Correlations ───────────────────────────

  async function scanForUnexpectedCorrelations(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    try {
      // Get significant relationships (capped for 10M scale)
      const { data: relationships } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(1000);

      if (!relationships || relationships.length < 2) return insights;

      // Find domain pairs with NO known relationship but correlated recent signals
      const knownPairs = new Set<string>();
      for (const r of relationships) {
        knownPairs.add(`${r.source_domain}→${r.target_domain}`);
        knownPairs.add(`${r.target_domain}→${r.source_domain}`);
      }

      // Get unique domains from recent signals
      const { data: recentDomains } = await supabase
        .from('cross_domain_signals')
        .select('source_domain')
        .eq('organization_id', organizationId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(500);

      if (!recentDomains) return insights;

      const domains = [...new Set(recentDomains.map((d: any) => d.source_domain))];

      // For each unconnected domain pair, check if there's a surprising signal correlation
      for (let i = 0; i < domains.length; i++) {
        for (let j = i + 1; j < domains.length; j++) {
          const pairKey = `${domains[i]}→${domains[j]}`;
          if (knownPairs.has(pairKey)) continue;

          // Get recent signal trends for both domains
          const [domainA, domainB] = await Promise.all([
            getRecentSignalTrend(domains[i]),
            getRecentSignalTrend(domains[j]),
          ]);

          if (!domainA || !domainB || domainA.length < 5 || domainB.length < 5) continue;

          // Compute simple correlation between trends
          const correlation = computeCorrelation(
            domainA.map(v => v.value),
            domainB.map(v => v.value),
          );

          // If strongly correlated but NOT in causal graph → surprising
          // Tightened from 0.6 to 0.75: only flag truly strong correlations to reduce noise
          if (Math.abs(correlation) > 0.75) {
            const surprise = Math.abs(correlation); // Higher correlation = more surprising since it's unknown
            if (surprise >= minSurpriseScore) {
              insights.push({
                id: generateId(),
                type: 'unexpected_correlation',
                importance: surprise,
                surpriseScore: surprise,
                title: `Unexpected link: ${domains[i]} ↔ ${domains[j]}`,
                explanation: `${domains[i]} and ${domains[j]} show a ${correlation > 0 ? 'positive' : 'negative'} correlation of ${(correlation * 100).toFixed(0)}% over the last 7 days, but no causal relationship has been established. This could indicate a hidden connection worth investigating.`,
                domains: [domains[i], domains[j]],
                evidence: {
                  statistics: {
                    correlationStrength: correlation,
                    sampleSize: Math.min(domainA.length, domainB.length),
                  },
                },
                discoveredAt: new Date().toISOString(),
                delivered: false,
              });
            }
          }
        }
      }

      log(`Scanned ${domains.length} domains, found ${insights.length} unexpected correlations`);
    } catch (err: any) {
      log(`Unexpected correlation scan failed: ${err.message}`);
    }

    return insights;
  }

  // ── Scanner 2: Emerging Cascade Patterns ─────────────────────────

  async function scanForEmergingCascades(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    try {
      // Get the causal graph (capped for 10M scale)
      const { data: relationships } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(1000);

      if (!relationships || relationships.length < 2) return insights;

      // Build adjacency list
      const graph = new Map<string, Array<{ target: string; effectSize: number; lagDays: number }>>();
      for (const r of relationships) {
        if (!graph.has(r.source_domain)) graph.set(r.source_domain, []);
        graph.get(r.source_domain)!.push({
          target: r.target_domain,
          effectSize: r.effect_size || 0,
          lagDays: r.optimal_lag_days || 7,
        });
      }

      // Look for domains that recently spiked AND are upstream of long cascade paths
      const { data: recentAnomalies } = await supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_value')
        .eq('organization_id', organizationId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('signal_value', { ascending: false })
        .limit(100);

      if (!recentAnomalies) return insights;

      // Group by domain and check for unusual values
      const domainValues = new Map<string, number[]>();
      for (const s of recentAnomalies) {
        if (!domainValues.has(s.source_domain)) domainValues.set(s.source_domain, []);
        domainValues.get(s.source_domain)!.push(s.signal_value);
      }

      for (const [domain, values] of domainValues) {
        // Trace cascade path from this domain
        const path = traceCascadePath(graph, domain, 5);
        if (path.length < 3) continue; // Not interesting unless multi-hop

        // Check if this domain has anomalous recent values
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const historical = await getHistoricalAverage(domain);
        if (!historical) continue;

        const deviation = Math.abs(avg - historical.mean) / (historical.std || 1);
        if (deviation < 2.5) continue; // Tightened from 1.5σ to 2.5σ: require truly anomalous signals

        const totalLag = path.reduce((sum, step) => sum + step.lagDays, 0);
        const totalEffect = path.reduce((prod, step) => prod * Math.abs(step.effectSize), 1);

        insights.push({
          id: generateId(),
          type: 'emerging_cascade',
          importance: Math.min(1.0, deviation * 0.3 + path.length * 0.1),
          surpriseScore: Math.min(1.0, deviation / 3),
          title: `Emerging cascade: ${domain} → ${path.map(p => p.target).join(' → ')}`,
          explanation: `${domain} is showing unusual activity (${deviation.toFixed(1)}σ from normal). Based on the causal graph, this could cascade through ${path.length} downstream domains over ~${totalLag} days. The estimated compound effect is ${(totalEffect * 100).toFixed(1)}%.`,
          domains: [domain, ...path.map(p => p.target)],
          evidence: {
            causalEdges: path.map(p => ({
              source: p.source || domain,
              target: p.target,
              effectSize: p.effectSize,
              pValue: 0.05, // approximate
            })),
            baseline: {
              previousValue: historical.mean,
              currentValue: avg,
              changePercent: ((avg - historical.mean) / (historical.mean || 1)) * 100,
              changeDirection: avg > historical.mean ? 'increasing' : 'decreasing',
            },
          },
          discoveredAt: new Date().toISOString(),
          delivered: false,
        });
      }

      log(`Found ${insights.length} emerging cascades`);
    } catch (err: any) {
      log(`Emerging cascade scan failed: ${err.message}`);
    }

    return insights;
  }

  // ── Scanner 3: What Changed? ─────────────────────────────────────

  async function scanForChanges(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    try {
      // Compare causal graph with previous consolidation
      const { data: recentRuns } = await supabase
        .from('consolidation_runs')
        .select('report')
        .eq('organization_id', organizationId)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(2);

      if (!recentRuns || recentRuns.length < 2) return insights;

      const current = recentRuns[0].report as any;
      const previous = recentRuns[1].report as any;

      if (!current?.stats || !previous?.stats) return insights;

      // Check for significant changes
      const changes: Array<{ metric: string; prev: number; curr: number }> = [
        { metric: 'causal edges', prev: previous.stats.causalEdgesDiscovered || 0, curr: current.stats.causalEdgesDiscovered || 0 },
        { metric: 'anomalies', prev: previous.stats.anomaliesDetected || 0, curr: current.stats.anomaliesDetected || 0 },
        { metric: 'patterns', prev: previous.stats.patternsFound || 0, curr: current.stats.patternsFound || 0 },
        { metric: 'edges pruned', prev: previous.stats.edgesPruned || 0, curr: current.stats.edgesPruned || 0 },
      ];

      for (const change of changes) {
        if (change.prev === 0 && change.curr === 0) continue;
        const pctChange = change.prev > 0
          ? ((change.curr - change.prev) / change.prev) * 100
          : (change.curr > 0 ? 100 : 0);

        if (Math.abs(pctChange) > 30) {
          insights.push({
            id: generateId(),
            type: 'what_changed',
            importance: Math.min(1.0, Math.abs(pctChange) / 100),
            surpriseScore: Math.min(1.0, Math.abs(pctChange) / 200),
            title: `${change.metric} ${pctChange > 0 ? 'increased' : 'decreased'} ${Math.abs(pctChange).toFixed(0)}%`,
            explanation: `Between the last two consolidation cycles, ${change.metric} changed from ${change.prev} to ${change.curr} (${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%). This ${Math.abs(pctChange) > 50 ? 'significant' : 'notable'} shift may indicate ${pctChange > 0 ? 'new activity or growing complexity' : 'stabilization or data reduction'} in the organization.`,
            domains: ['cross_domain'],
            evidence: {
              baseline: {
                previousValue: change.prev,
                currentValue: change.curr,
                changePercent: pctChange,
                changeDirection: pctChange > 0 ? 'increasing' : 'decreasing',
              },
            },
            discoveredAt: new Date().toISOString(),
            delivered: false,
          });
        }
      }

      log(`Found ${insights.length} significant changes since last consolidation`);
    } catch (err: any) {
      log(`What-changed scan failed: ${err.message}`);
    }

    return insights;
  }

  // ── Scanner 4: Knowledge Gaps ────────────────────────────────────

  async function scanForKnowledgeGaps(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    try {
      // Get all domains with signals
      const { data: allDomains } = await supabase
        .from('cross_domain_signals')
        .select('source_domain')
        .eq('organization_id', organizationId)
        .limit(1000);

      if (!allDomains) return insights;

      const domains = [...new Set(allDomains.map((d: any) => d.source_domain))];

      // Get known relationships (capped for 10M scale)
      const { data: relationships } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .limit(2000);

      // Find domains with data but NO outgoing or incoming causal edges
      const connectedDomains = new Set<string>();
      for (const r of relationships || []) {
        connectedDomains.add(r.source_domain);
        connectedDomains.add(r.target_domain);
      }

      const disconnectedDomains = domains.filter(d => !connectedDomains.has(d));

      if (disconnectedDomains.length > 0) {
        insights.push({
          id: generateId(),
          type: 'knowledge_gap',
          importance: 0.6,
          surpriseScore: 0.5,
          title: `${disconnectedDomains.length} domain${disconnectedDomains.length > 1 ? 's' : ''} with data but no causal connections`,
          explanation: `The brain has signal data for ${disconnectedDomains.join(', ')} but hasn't discovered any causal relationships with other domains. This could mean: (1) there are connections waiting to be discovered with more data, (2) these domains are truly independent, or (3) the data quality needs improvement.`,
          domains: disconnectedDomains,
          evidence: {
            statistics: {
              sampleSize: disconnectedDomains.length,
            },
          },
          discoveredAt: new Date().toISOString(),
          delivered: false,
        });
      }

      // Find edges with very low evidence weight — dying connections (capped for 10M scale)
      const { data: weakEdges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, evidence_weight')
        .eq('organization_id', organizationId)
        .lt('evidence_weight', 0.3)
        .gt('evidence_weight', 0.1)
        .limit(500);

      if (weakEdges && weakEdges.length > 3) {
        insights.push({
          id: generateId(),
          type: 'knowledge_gap',
          importance: 0.5,
          surpriseScore: 0.4,
          title: `${weakEdges.length} causal edges are fading`,
          explanation: `${weakEdges.length} causal relationships have evidence weights below 0.3, meaning they haven't been validated recently. They may be pruned in the next consolidation cycle unless new supporting evidence arrives. Key fading edges: ${weakEdges.slice(0, 3).map((e: any) => `${e.source_domain}→${e.target_domain}`).join(', ')}.`,
          domains: [...new Set(weakEdges.map((e: any) => e.source_domain).concat(weakEdges.map((e: any) => e.target_domain)))],
          evidence: {},
          discoveredAt: new Date().toISOString(),
          delivered: false,
        });
      }

      log(`Found ${insights.length} knowledge gaps`);
    } catch (err: any) {
      log(`Knowledge gap scan failed: ${err.message}`);
    }

    return insights;
  }

  // ══════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════

  async function getRecentSignalTrend(domain: string): Promise<Array<{ timestamp: string; value: number }> | null> {
    const { data } = await supabase
      .from('cross_domain_signals')
      .select('signal_timestamp, signal_value')
      .eq('organization_id', organizationId)
      .eq('source_domain', domain)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('signal_timestamp', { ascending: true })
      .limit(100);

    if (!data || data.length === 0) return null;
    return data.map((d: any) => ({ timestamp: d.signal_timestamp, value: d.signal_value }));
  }

  async function getHistoricalAverage(domain: string): Promise<{ mean: number; std: number } | null> {
    const { data } = await supabase
      .from('cross_domain_signals')
      .select('signal_value')
      .eq('organization_id', organizationId)
      .eq('source_domain', domain)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(500);

    if (!data || data.length < 5) return null;

    const values = data.map((d: any) => d.signal_value);
    const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const variance = values.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    return { mean, std };
  }

  function computeCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n < 5) return 0;

    const aSlice = a.slice(0, n);
    const bSlice = b.slice(0, n);

    const meanA = aSlice.reduce((s, v) => s + v, 0) / n;
    const meanB = bSlice.reduce((s, v) => s + v, 0) / n;

    let cov = 0, varA = 0, varB = 0;
    for (let i = 0; i < n; i++) {
      const dA = aSlice[i] - meanA;
      const dB = bSlice[i] - meanB;
      cov += dA * dB;
      varA += dA * dA;
      varB += dB * dB;
    }

    const denom = Math.sqrt(varA * varB);
    return denom > 0 ? cov / denom : 0;
  }

  function traceCascadePath(
    graph: Map<string, Array<{ target: string; effectSize: number; lagDays: number }>>,
    start: string,
    maxDepth: number,
  ): Array<{ source: string; target: string; effectSize: number; lagDays: number }> {
    const path: Array<{ source: string; target: string; effectSize: number; lagDays: number }> = [];
    const visited = new Set<string>();
    visited.add(start);

    let current = start;
    for (let depth = 0; depth < maxDepth; depth++) {
      const edges = graph.get(current);
      if (!edges || edges.length === 0) break;

      // Follow strongest unvisited edge
      const best = edges
        .filter(e => !visited.has(e.target))
        .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))[0];

      if (!best) break;

      path.push({ source: current, target: best.target, effectSize: best.effectSize, lagDays: best.lagDays });
      visited.add(best.target);
      current = best.target;
    }

    return path;
  }

  // ══════════════════════════════════════════════════════════════════
  // MAIN: Run DMN Scan
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Run a full DMN scan — discovers proactive insights.
     */
    async scan(): Promise<DMNScanResult> {
      const start = Date.now();
      log('Starting DMN scan...');

      // Run all scanners in parallel
      const [correlations, cascades, changes, gaps] = await Promise.all([
        scanForUnexpectedCorrelations(),
        scanForEmergingCascades(),
        scanForChanges(),
        scanForKnowledgeGaps(),
      ]);

      // Merge, deduplicate, sort by importance
      let allInsights = [...correlations, ...cascades, ...changes, ...gaps];
      allInsights.sort((a, b) => b.importance - a.importance);
      allInsights = allInsights.slice(0, maxInsightsPerScan);

      // ── Deduplication: Check against recent insights (last 48h) ────
      // Prevents the same insight from surfacing repeatedly across scans
      try {
        const { data: recentMemories } = await supabase
          .from('ai_memory')
          .select('content')
          .eq('organization_id', organizationId)
          .eq('memory_type', 'proactive_insight')
          .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(50);

        if (recentMemories && recentMemories.length > 0) {
          const recentTitles = new Set(
            recentMemories.map((m: any) => {
              // Extract the title portion from "[type] title: explanation"
              const match = (m.content || '').match(/\] (.+?):/);
              return match ? match[1].toLowerCase().trim() : '';
            }).filter(Boolean)
          );

          // Also extract domain pairs from recent insights for semantic dedup
          const recentDomainPairs = new Set(
            recentMemories.map((m: any) => {
              const domains = (m.content || '').match(/(\w+)\s*[↔→]\s*(\w+)/);
              return domains ? `${domains[1].toLowerCase()}|${domains[2].toLowerCase()}` : '';
            }).filter(Boolean)
          );

          const beforeCount = allInsights.length;
          allInsights = allInsights.filter(insight => {
            const titleKey = insight.title.toLowerCase().trim();
            // Check exact title match
            if (recentTitles.has(titleKey)) return false;
            // Check same domain pair already surfaced
            if (insight.domains.length >= 2) {
              const pairKey = `${insight.domains[0].toLowerCase()}|${insight.domains[1].toLowerCase()}`;
              const reversePairKey = `${insight.domains[1].toLowerCase()}|${insight.domains[0].toLowerCase()}`;
              if (recentDomainPairs.has(pairKey) || recentDomainPairs.has(reversePairKey)) return false;
            }
            return true;
          });

          if (beforeCount > allInsights.length) {
            log(`Dedup: filtered ${beforeCount - allInsights.length} duplicate insights (${allInsights.length} remaining)`);
          }
        }
      } catch {
        // Dedup is non-critical — continue with all insights
      }

      // Persist insights as memories
      for (const insight of allInsights) {
        try {
          await repository.upsertMemory({
            memoryType: 'proactive_insight',
            domain: insight.domains[0] || 'cross_domain',
            content: `[${insight.type}] ${insight.title}: ${insight.explanation}`,
            importance: insight.importance,
            metadata: {
              insightId: insight.id,
              type: insight.type,
              surpriseScore: insight.surpriseScore,
              domains: insight.domains,
              evidence: insight.evidence,
            },
          });
        } catch {
          // Non-critical
        }

        // Deliver via callback if configured
        if (onInsight) {
          try {
            await onInsight(insight);
            insight.delivered = true;
          } catch {
            // Delivery failed — insight is still stored
          }
        }
      }

      // Log activity
      await repository.logActivity({
        agentType: 'dmn_engine',
        actionType: 'background_scan',
        inputSummary: `DMN scan for ${organizationId.substring(0, 8)}`,
        outputSummary: `Found ${allInsights.length} proactive insights: ${allInsights.map(i => i.type).join(', ')}`,
        metadata: {
          insightsFound: allInsights.length,
          byType: {
            unexpected_correlation: correlations.length,
            emerging_cascade: cascades.length,
            what_changed: changes.length,
            knowledge_gap: gaps.length,
          },
        },
      });

      const result: DMNScanResult = {
        insights: allInsights,
        domainsScanned: 0, // Set below
        pairsAnalyzed: 0,
        durationMs: Date.now() - start,
        scannedAt: new Date().toISOString(),
      };

      if (verbose) {
        console.log(`\n[DMN] Scan complete in ${(result.durationMs / 1000).toFixed(1)}s — ${allInsights.length} insights:`);
        for (const insight of allInsights) {
          console.log(`  [${insight.type}] ${insight.title} (importance: ${(insight.importance * 100).toFixed(0)}%)`);
        }
        console.log('');
      }

      return result;
    },

    /**
     * Get recent proactive insights from memory.
     */
    async getRecentInsights(limit: number = 20): Promise<ProactiveInsight[]> {
      const { data } = await supabase
        .from('ai_memory')
        .select('content, importance, metadata, created_at')
        .eq('organization_id', organizationId)
        .eq('memory_type', 'proactive_insight')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!data) return [];

      return data.map((row: any) => ({
        id: row.metadata?.insightId || '',
        type: row.metadata?.type || 'unknown',
        importance: row.importance || 0,
        surpriseScore: row.metadata?.surpriseScore || 0,
        title: row.content?.split(':')[0]?.replace(/^\[.*?\]\s*/, '') || '',
        explanation: row.content || '',
        domains: row.metadata?.domains || [],
        evidence: row.metadata?.evidence || {},
        discoveredAt: row.created_at,
        delivered: true,
      }));
    },
  };
}
