/**
 * Active Information Seeker — "Active Inference"
 *
 * Like the brain's active inference that drives curiosity and exploration,
 * this engine detects knowledge gaps in the causal graph and generates
 * specific data requests to fill them.
 *
 * It doesn't just passively wait for data — it ASKS FOR FOOD:
 *   1. **Gap Detection**: Finds domains with data but no causal edges
 *   2. **Weak Edge Triage**: Identifies edges that need more evidence
 *   3. **Missing Domain Discovery**: Detects domains referenced in rules
 *      but never observed in signals
 *   4. **Temporal Coverage Gaps**: Finds time periods with sparse data
 *   5. **Data Request Generation**: Produces structured requests for
 *      specific connectors/APIs to fill each gap
 *
 * Output: A prioritized list of "data requests" that the org can act on:
 *   - "We need 30 more days of marketing spend data to validate the
 *      marketing → revenue edge (currently at 0.3 confidence)"
 *   - "The support → churn edge has no data from weekends — request
 *      weekend ticket data from Zendesk"
 *   - "No signals from 'hiring' domain — connect HRIS to fill gap"
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../persistence/supabase-repository';
import { getDefaultLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

/** A request for specific data to fill a knowledge gap */
export interface DataRequest {
  /** Unique request ID */
  id: string;
  /** Type of gap this addresses */
  gapType: 'disconnected_domain' | 'weak_edge' | 'missing_domain' | 'temporal_gap' | 'low_sample_size';
  /** Priority (0-1, higher = more urgent) */
  priority: number;
  /** Human-readable description of what data is needed */
  description: string;
  /** Which domain(s) need data */
  targetDomains: string[];
  /** Specific data types/metrics needed */
  dataNeeded: string[];
  /** Estimated data points required */
  estimatedDataPoints: number;
  /** Which connector/integration could provide this */
  suggestedSource?: string;
  /** Why this data matters */
  rationale: string;
  /** Expected improvement to causal graph */
  expectedImprovement: string;
  /** When this request was generated */
  createdAt: string;
  /** Status */
  status: 'open' | 'in_progress' | 'fulfilled' | 'dismissed';
}

/** Result of an exploration scan */
export interface ExplorationResult {
  /** Data requests generated */
  requests: DataRequest[];
  /** Domains analyzed */
  domainsAnalyzed: number;
  /** Edges analyzed */
  edgesAnalyzed: number;
  /** Overall graph health score (0-1) */
  graphHealth: number;
  /** Duration in ms */
  durationMs: number;
  /** Summary */
  summary: string;
}

/** Active explorer configuration */
export interface ActiveExplorerConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Minimum edge weight to consider "healthy" (default: 0.4) */
  healthyEdgeWeight?: number;
  /** Minimum sample size to consider "sufficient" (default: 20) */
  sufficientSampleSize?: number;
  /** Maximum data requests per scan (default: 15) */
  maxRequests?: number;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// ACTIVE EXPLORER
// ============================================================================

export function createActiveExplorer(config: ActiveExplorerConfig) {
  const {
    supabase,
    organizationId,
    healthyEdgeWeight = 0.4,
    sufficientSampleSize = 20,
    maxRequests = 15,
    verbose = false,
  } = config;

  const repository = createSupabaseRepository(supabase, organizationId);
  const logger = getDefaultLogger().child({ module: 'active-explorer', orgId: organizationId.substring(0, 8) });

  function log(msg: string): void {
    if (verbose) {
      logger.info(msg);
    }
  }

  function generateId(): string {
    return `datareq-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // ── Gap Detector 1: Disconnected Domains ──────────────────────────

  async function findDisconnectedDomains(): Promise<DataRequest[]> {
    const requests: DataRequest[] = [];

    // Get all domains with signals
    const { data: signalDomains } = await supabase
      .from('cross_domain_signals')
      .select('source_domain')
      .eq('organization_id', organizationId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);

    if (!signalDomains) return requests;

    const allDomains = [...new Set(signalDomains.map((d: any) => d.source_domain))];

    // Get connected domains (those with at least one causal edge)
    const { data: connectedEdges } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain')
      .eq('organization_id', organizationId)
      .eq('is_significant', true);

    const connectedDomains = new Set<string>();
    for (const e of connectedEdges || []) {
      connectedDomains.add(e.source_domain);
      connectedDomains.add(e.target_domain);
    }

    // Find disconnected domains
    const disconnected = allDomains.filter(d => !connectedDomains.has(d));

    for (const domain of disconnected) {
      // Count how much data we have for this domain
      const { count } = await supabase
        .from('cross_domain_signals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('source_domain', domain);

      const dataCount = count || 0;
      const needsMore = dataCount < sufficientSampleSize;

      requests.push({
        id: generateId(),
        gapType: needsMore ? 'low_sample_size' : 'disconnected_domain',
        priority: needsMore ? 0.8 : 0.5,
        description: needsMore
          ? `Domain "${domain}" has only ${dataCount} signals — need ${sufficientSampleSize}+ for causal discovery`
          : `Domain "${domain}" has ${dataCount} signals but no causal connections discovered yet`,
        targetDomains: [domain],
        dataNeeded: ['time-series signals', 'cross-domain interaction events'],
        estimatedDataPoints: Math.max(0, sufficientSampleSize - dataCount),
        rationale: needsMore
          ? `Causal discovery needs minimum ${sufficientSampleSize} observations to detect relationships. Currently only ${dataCount} available.`
          : `This domain has sufficient data but no causal links found. More diverse signal types may reveal hidden connections.`,
        expectedImprovement: `Could discover new causal pathways involving ${domain}`,
        createdAt: new Date().toISOString(),
        status: 'open',
      });
    }

    log(`Found ${disconnected.length} disconnected domains`);
    return requests;
  }

  // ── Gap Detector 2: Weak Edges ────────────────────────────────────

  async function findWeakEdges(): Promise<DataRequest[]> {
    const requests: DataRequest[] = [];

    const { data: weakEdges } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, evidence_weight, sample_size, natural_language')
      .eq('organization_id', organizationId)
      .eq('is_significant', true)
      .lt('evidence_weight', healthyEdgeWeight)
      .order('evidence_weight', { ascending: true })
      .limit(20);

    for (const edge of weakEdges || []) {
      const deficit = sufficientSampleSize - (edge.sample_size || 0);

      requests.push({
        id: generateId(),
        gapType: 'weak_edge',
        priority: 0.7 - (edge.evidence_weight || 0) * 0.5, // Weaker = more urgent
        description: `Weak causal edge: ${edge.source_domain} → ${edge.target_domain} (weight: ${(edge.evidence_weight || 0).toFixed(2)}, samples: ${edge.sample_size || 0})`,
        targetDomains: [edge.source_domain, edge.target_domain],
        dataNeeded: [
          `More ${edge.source_domain} signals`,
          `More ${edge.target_domain} signals`,
          'Temporal overlap data between both domains',
        ],
        estimatedDataPoints: Math.max(10, deficit),
        suggestedSource: undefined,
        rationale: `This edge ${edge.natural_language ? `"${edge.natural_language}"` : ''} has evidence weight ${(edge.evidence_weight || 0).toFixed(2)} (healthy threshold: ${healthyEdgeWeight}). More data could either strengthen it (validating the relationship) or weaken it (revealing it as spurious).`,
        expectedImprovement: `Increase edge confidence from ${((edge.evidence_weight || 0) * 100).toFixed(0)}% toward ${(healthyEdgeWeight * 100).toFixed(0)}%+ or prune if spurious`,
        createdAt: new Date().toISOString(),
        status: 'open',
      });
    }

    log(`Found ${(weakEdges || []).length} weak edges needing reinforcement`);
    return requests;
  }

  // ── Gap Detector 3: Missing Domains ───────────────────────────────

  async function findMissingDomains(): Promise<DataRequest[]> {
    const requests: DataRequest[] = [];

    // Get domains mentioned in cascade rules but not in signals
    const { data: rules } = await supabase
      .from('cascade_rules')
      .select('source_domain, target_domain')
      .eq('organization_id', organizationId);

    if (!rules) return requests;

    const ruleDomains = new Set<string>();
    for (const r of rules) {
      ruleDomains.add(r.source_domain);
      ruleDomains.add(r.target_domain);
    }

    // Get domains with actual signals
    const { data: signalDomains } = await supabase
      .from('cross_domain_signals')
      .select('source_domain')
      .eq('organization_id', organizationId)
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);

    const activeDomains = new Set<string>();
    for (const s of signalDomains || []) {
      activeDomains.add(s.source_domain);
    }

    // Find domains in rules but not in signals
    for (const domain of ruleDomains) {
      if (!activeDomains.has(domain)) {
        requests.push({
          id: generateId(),
          gapType: 'missing_domain',
          priority: 0.6,
          description: `Domain "${domain}" is referenced in cascade rules but has NO signal data`,
          targetDomains: [domain],
          dataNeeded: ['Any time-series signals from this domain'],
          estimatedDataPoints: sufficientSampleSize,
          rationale: `Cascade rules expect data from "${domain}" but no signals exist. This creates blind spots in cascade prediction.`,
          expectedImprovement: `Enable cascade tracking for pathways involving ${domain}`,
          createdAt: new Date().toISOString(),
          status: 'open',
        });
      }
    }

    log(`Found ${requests.length} missing domains referenced in rules`);
    return requests;
  }

  // ── Gap Detector 4: Temporal Coverage Gaps ────────────────────────

  async function findTemporalGaps(): Promise<DataRequest[]> {
    const requests: DataRequest[] = [];

    // Check data freshness per domain
    const { data: latestByDomain } = await supabase
      .from('cross_domain_signals')
      .select('source_domain, signal_timestamp')
      .eq('organization_id', organizationId)
      .order('signal_timestamp', { ascending: false })
      .limit(500);

    if (!latestByDomain) return requests;

    // Group by domain and find the most recent signal
    const domainFreshness = new Map<string, string>();
    for (const s of latestByDomain) {
      if (!domainFreshness.has(s.source_domain)) {
        domainFreshness.set(s.source_domain, s.signal_timestamp);
      }
    }

    const now = Date.now();
    const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [domain, lastTimestamp] of domainFreshness) {
      const age = now - new Date(lastTimestamp).getTime();
      if (age > STALE_THRESHOLD_MS) {
        const daysSinceLastSignal = Math.floor(age / (24 * 60 * 60 * 1000));

        requests.push({
          id: generateId(),
          gapType: 'temporal_gap',
          priority: Math.min(0.9, 0.3 + (daysSinceLastSignal / 30) * 0.5),
          description: `Domain "${domain}" has no signals for ${daysSinceLastSignal} days (last: ${new Date(lastTimestamp).toISOString().substring(0, 10)})`,
          targetDomains: [domain],
          dataNeeded: ['Recent signals from this domain'],
          estimatedDataPoints: daysSinceLastSignal, // ~1 signal per missing day
          rationale: `Stale data means causal relationships involving "${domain}" may be based on outdated patterns. The graph cannot detect recent changes.`,
          expectedImprovement: `Restore real-time monitoring for ${domain} and detect any behavioral shifts in the last ${daysSinceLastSignal} days`,
          createdAt: new Date().toISOString(),
          status: 'open',
        });
      }
    }

    log(`Found ${requests.length} domains with stale data`);
    return requests;
  }

  // ── Graph Health Score ────────────────────────────────────────────

  function computeGraphHealth(
    totalDomains: number,
    connectedDomains: number,
    avgWeight: number,
    staleCount: number,
  ): number {
    if (totalDomains === 0) return 0;

    const connectivity = connectedDomains / totalDomains;
    const strength = avgWeight;
    const freshness = Math.max(0, 1 - (staleCount / totalDomains));

    return (connectivity * 0.4 + strength * 0.3 + freshness * 0.3);
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Run a full exploration scan — detect all knowledge gaps.
     */
    async explore(): Promise<ExplorationResult> {
      const start = Date.now();
      log('Starting exploration scan...');

      // Run all detectors in parallel
      const [disconnected, weak, missing, temporal] = await Promise.all([
        findDisconnectedDomains(),
        findWeakEdges(),
        findMissingDomains(),
        findTemporalGaps(),
      ]);

      // Merge and sort by priority
      let allRequests = [...disconnected, ...weak, ...missing, ...temporal];
      allRequests.sort((a, b) => b.priority - a.priority);
      allRequests = allRequests.slice(0, maxRequests);

      // Compute graph health
      const { data: allDomains } = await supabase
        .from('cross_domain_signals')
        .select('source_domain')
        .eq('organization_id', organizationId)
        .limit(1000);

      const totalDomains = allDomains ? [...new Set(allDomains.map((d: any) => d.source_domain))].length : 0;

      const { data: edges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, evidence_weight')
        .eq('organization_id', organizationId)
        .eq('is_significant', true);

      const edgeList = edges || [];
      const connectedDomains = new Set<string>();
      let totalWeight = 0;
      for (const e of edgeList) {
        connectedDomains.add(e.source_domain);
        connectedDomains.add(e.target_domain);
        totalWeight += e.evidence_weight || 0;
      }
      const avgWeight = edgeList.length > 0 ? totalWeight / edgeList.length : 0;

      const graphHealth = computeGraphHealth(
        totalDomains,
        connectedDomains.size,
        avgWeight,
        temporal.length,
      );

      // Persist data requests as memories
      for (const req of allRequests) {
        try {
          await repository.upsertMemory({
            memoryType: 'data_request',
            domain: req.targetDomains[0] || 'cross_domain',
            content: `[${req.gapType}] ${req.description}. ${req.rationale}`,
            importance: req.priority,
            metadata: {
              requestId: req.id,
              gapType: req.gapType,
              targetDomains: req.targetDomains,
              estimatedDataPoints: req.estimatedDataPoints,
              expectedImprovement: req.expectedImprovement,
            },
          });
        } catch {
          // Non-critical
        }
      }

      // Log activity
      try {
        await repository.logActivity({
          agentType: 'active_explorer',
          actionType: 'exploration_scan',
          inputSummary: `Exploration scan for ${organizationId.substring(0, 8)}`,
          outputSummary: `Generated ${allRequests.length} data requests. Graph health: ${(graphHealth * 100).toFixed(0)}%`,
          metadata: {
            requestCount: allRequests.length,
            byType: {
              disconnected_domain: disconnected.length,
              weak_edge: weak.length,
              missing_domain: missing.length,
              temporal_gap: temporal.length,
            },
            graphHealth,
          },
        });
      } catch {
        // Non-critical
      }

      // Build summary
      const summaryParts: string[] = [];
      summaryParts.push(`Graph health: ${(graphHealth * 100).toFixed(0)}% (${totalDomains} domains, ${edgeList.length} edges)`);
      if (disconnected.length > 0) summaryParts.push(`${disconnected.length} disconnected domain(s) need data`);
      if (weak.length > 0) summaryParts.push(`${weak.length} weak edge(s) need reinforcement`);
      if (missing.length > 0) summaryParts.push(`${missing.length} domain(s) referenced in rules but never observed`);
      if (temporal.length > 0) summaryParts.push(`${temporal.length} domain(s) have stale data (7+ days old)`);

      const result: ExplorationResult = {
        requests: allRequests,
        domainsAnalyzed: totalDomains,
        edgesAnalyzed: edgeList.length,
        graphHealth,
        durationMs: Date.now() - start,
        summary: summaryParts.join('. '),
      };

      if (verbose) {
        logger.info(`Scan complete in ${(result.durationMs / 1000).toFixed(1)}s`, {
          summary: result.summary,
          topRequests: allRequests.slice(0, 5).map(r => ({ priority: r.priority, description: r.description })),
        });
      }

      return result;
    },

    /**
     * Get open data requests from memory.
     */
    async getOpenRequests(limit: number = 20): Promise<DataRequest[]> {
      const { data } = await supabase
        .from('ai_memory')
        .select('content, importance, metadata, created_at')
        .eq('organization_id', organizationId)
        .eq('memory_type', 'data_request')
        .order('importance', { ascending: false })
        .limit(limit);

      if (!data) return [];

      return data.map((row: any) => ({
        id: row.metadata?.requestId || '',
        gapType: row.metadata?.gapType || 'disconnected_domain',
        priority: row.importance || 0,
        description: row.content?.replace(/^\[.*?\]\s*/, '').split('.')[0] || '',
        targetDomains: row.metadata?.targetDomains || [],
        dataNeeded: [],
        estimatedDataPoints: row.metadata?.estimatedDataPoints || 0,
        rationale: row.content || '',
        expectedImprovement: row.metadata?.expectedImprovement || '',
        createdAt: row.created_at,
        status: 'open' as const,
      }));
    },
  };
}
