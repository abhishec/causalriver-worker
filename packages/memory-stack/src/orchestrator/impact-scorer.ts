/**
 * Business Impact Scorer — "Amygdala"
 *
 * Like the brain's amygdala that assigns emotional significance to stimuli,
 * this engine scores every signal, anomaly, and insight by its real business
 * impact before it reaches human attention.
 *
 * The scoring formula:
 *   Impact = CascadeReach × DollarEffect × StrategicAlignment × Novelty
 *
 * Where:
 *   - CascadeReach: How many downstream domains will be affected?
 *   - DollarEffect: Estimated revenue/cost impact based on causal effect sizes
 *   - StrategicAlignment: Does this align with org's declared priorities?
 *   - Novelty: Is this new (high) or routine (low)?
 *
 * The impact scorer sits BETWEEN signal ingestion and human notification:
 *   Signal → Impact Score → (if high enough) → Alert / Dashboard
 *
 * This prevents alert fatigue by ensuring only business-meaningful events
 * reach stakeholders, while still logging everything for the brain to learn.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

/** A strategic priority declared by the organization */
export interface StrategicPriority {
  /** Unique ID */
  id: string;
  /** Organization ID */
  organizationId: string;
  /** Priority name (e.g., "Reduce churn", "Increase NRR") */
  name: string;
  /** Description of what this priority means */
  description: string;
  /** Domains this priority touches */
  relevantDomains: string[];
  /** Keywords that indicate alignment */
  keywords: string[];
  /** Relative weight (0-1, higher = more important) */
  weight: number;
  /** Whether this priority is active */
  active: boolean;
  /** When this priority was set */
  createdAt: string;
  /** Optional expiry date */
  expiresAt?: string;
}

/** Something that needs to be scored — a signal, anomaly, or insight */
export interface ScorableEvent {
  /** Unique event ID */
  id: string;
  /** Type of event */
  type: 'signal' | 'anomaly' | 'insight' | 'cascade' | 'pattern';
  /** Domain(s) involved */
  domains: string[];
  /** Brief description */
  title: string;
  /** Detail */
  description: string;
  /** Raw severity (0-1) from the originating system */
  rawSeverity: number;
  /** Optional: entity affected */
  entityId?: string;
  entityType?: string;
  /** Optional: metric involved */
  metricName?: string;
  /** Optional: numeric value */
  value?: number;
  /** Optional: source module */
  source?: string;
  /** When this event occurred */
  timestamp: string;
  /** Any additional context */
  metadata?: Record<string, unknown>;
}

/** Result of scoring a single event */
export interface ImpactScore {
  /** The event that was scored */
  eventId: string;
  /** Overall composite impact score (0-100) */
  compositeScore: number;
  /** Cascade reach: how many downstream domains (0-1 normalized) */
  cascadeReach: number;
  /** Dollar effect: estimated monetary impact (0-1 normalized) */
  dollarEffect: number;
  /** Strategic alignment: match with declared priorities (0-1) */
  strategicAlignment: number;
  /** Novelty: how new/unexpected this is (0-1) */
  novelty: number;
  /** Human-readable impact summary */
  summary: string;
  /** Which strategic priorities this aligns with */
  alignedPriorities: string[];
  /** Estimated downstream domains affected */
  affectedDomains: string[];
  /** Estimated cascade depth */
  cascadeDepth: number;
  /** Whether this should trigger an alert */
  shouldAlert: boolean;
  /** Alert tier (if shouldAlert is true) */
  alertTier?: 'critical' | 'high' | 'medium' | 'low';
  /** Scored at */
  scoredAt: string;
}

/** Configuration for the impact scorer */
export interface ImpactScorerConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Minimum composite score to trigger an alert (default: 40) */
  alertThreshold?: number;
  /** Strategic priorities (override DB-stored ones) */
  priorities?: StrategicPriority[];
  /** Weight for cascade reach component (default: 0.25) */
  weightCascadeReach?: number;
  /** Weight for dollar effect component (default: 0.35) */
  weightDollarEffect?: number;
  /** Weight for strategic alignment component (default: 0.25) */
  weightStrategicAlignment?: number;
  /** Weight for novelty component (default: 0.15) */
  weightNovelty?: number;
  /** Verbose logging */
  verbose?: boolean;
  /** Optional LLM amplifier for enriched impact summaries */
  amplifier?: import('./llm-brain-amplifier').BrainAmplifier;
}

/** Batch scoring result */
export interface BatchImpactResult {
  /** All scores */
  scores: ImpactScore[];
  /** Events that should trigger alerts */
  alerts: ImpactScore[];
  /** Average score across all events */
  averageScore: number;
  /** Highest scoring event */
  topEvent: ImpactScore | null;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// IMPACT SCORER ENGINE
// ============================================================================

export function createImpactScorer(config: ImpactScorerConfig) {
  const {
    supabase,
    organizationId,
    alertThreshold = 40,
    weightCascadeReach = 0.25,
    weightDollarEffect = 0.35,
    weightStrategicAlignment = 0.25,
    weightNovelty = 0.15,
    verbose = false,
    amplifier,
  } = config;

  const repository = createSupabaseRepository(supabase, organizationId);

  // Cache for reuse across scoring calls
  let cachedGraph: Map<string, Array<{ target: string; effectSize: number }>> | null = null;
  let cachedPriorities: StrategicPriority[] | null = config.priorities || null;
  let cachedRecentEvents: Set<string> | null = null;
  let cacheTimestamp = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [AMYGDALA] ${msg}`);
    }
  }

  // ── Load Causal Graph ──────────────────────────────────────────────

  async function loadCausalGraph(): Promise<Map<string, Array<{ target: string; effectSize: number }>>> {
    if (cachedGraph && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return cachedGraph;
    }

    const { data: relationships } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size')
      .eq('organization_id', organizationId)
      .eq('is_significant', true);

    const graph = new Map<string, Array<{ target: string; effectSize: number }>>();
    for (const r of relationships || []) {
      if (!graph.has(r.source_domain)) graph.set(r.source_domain, []);
      graph.get(r.source_domain)!.push({
        target: r.target_domain,
        effectSize: r.effect_size || 0,
      });
    }

    cachedGraph = graph;
    cacheTimestamp = Date.now();
    log(`Loaded causal graph: ${(relationships || []).length} edges`);
    return graph;
  }

  // ── Load Strategic Priorities ──────────────────────────────────────

  async function loadPriorities(): Promise<StrategicPriority[]> {
    if (cachedPriorities && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return cachedPriorities;
    }

    const { data: priorities } = await supabase
      .from('strategic_priorities')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('active', true);

    if (priorities && priorities.length > 0) {
      cachedPriorities = priorities.map((p: any) => ({
        id: p.id,
        organizationId: p.organization_id,
        name: p.name,
        description: p.description || '',
        relevantDomains: p.relevant_domains || [],
        keywords: p.keywords || [],
        weight: p.weight || 0.5,
        active: p.active,
        createdAt: p.created_at,
        expiresAt: p.expires_at,
      }));
    } else {
      // No priorities configured — use default
      cachedPriorities = [{
        id: 'default-revenue',
        organizationId,
        name: 'Revenue Protection',
        description: 'Protect and grow revenue',
        relevantDomains: ['revenue', 'sales', 'churn', 'billing', 'payment', 'subscription'],
        keywords: ['revenue', 'arr', 'mrr', 'churn', 'cancel', 'downgrade', 'upsell', 'renewal'],
        weight: 0.8,
        active: true,
        createdAt: new Date().toISOString(),
      }, {
        id: 'default-satisfaction',
        organizationId,
        name: 'Customer Satisfaction',
        description: 'Maintain and improve customer satisfaction',
        relevantDomains: ['support', 'nps', 'csat', 'product', 'onboarding'],
        keywords: ['satisfaction', 'nps', 'csat', 'complaint', 'ticket', 'bug', 'issue', 'frustrat'],
        weight: 0.6,
        active: true,
        createdAt: new Date().toISOString(),
      }];
    }

    return cachedPriorities;
  }

  // ── Load Recent Events (for novelty scoring) ──────────────────────

  async function loadRecentEventSignatures(): Promise<Set<string>> {
    if (cachedRecentEvents && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return cachedRecentEvents;
    }

    const { data: recentMemories } = await supabase
      .from('ai_memory')
      .select('content')
      .eq('organization_id', organizationId)
      .in('memory_type', ['proactive_insight', 'anomaly_detection', 'pattern_discovery'])
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    const signatures = new Set<string>();
    for (const m of recentMemories || []) {
      // Create a rough signature from first 80 chars
      const sig = (m.content || '').substring(0, 80).toLowerCase().trim();
      if (sig) signatures.add(sig);
    }

    cachedRecentEvents = signatures;
    return signatures;
  }

  // ══════════════════════════════════════════════════════════════════
  // SCORING COMPONENTS
  // ══════════════════════════════════════════════════════════════════

  // ── 1. Cascade Reach ─────────────────────────────────────────────

  function computeCascadeReach(
    domains: string[],
    graph: Map<string, Array<{ target: string; effectSize: number }>>,
  ): { reach: number; depth: number; affectedDomains: string[] } {
    const visited = new Set<string>();
    const queue: Array<{ domain: string; depth: number }> = [];

    // Seed from event's domains
    for (const d of domains) {
      queue.push({ domain: d, depth: 0 });
      visited.add(d);
    }

    let maxDepth = 0;
    const affectedDomains: string[] = [];

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.depth > 5) continue; // Max cascade depth

      const edges = graph.get(item.domain);
      if (!edges) continue;

      for (const edge of edges) {
        if (visited.has(edge.target)) continue;
        if (Math.abs(edge.effectSize) < 0.1) continue; // Skip very weak edges

        visited.add(edge.target);
        affectedDomains.push(edge.target);
        maxDepth = Math.max(maxDepth, item.depth + 1);
        queue.push({ domain: edge.target, depth: item.depth + 1 });
      }
    }

    // Normalize: 0 affected = 0, 1 affected = 0.3, 3+ = 0.7, 5+ = 1.0
    const totalDomains = graph.size || 1;
    const reach = Math.min(1.0, affectedDomains.length / Math.max(totalDomains * 0.5, 1));

    return { reach, depth: maxDepth, affectedDomains };
  }

  // ── 2. Dollar Effect ─────────────────────────────────────────────

  function computeDollarEffect(
    event: ScorableEvent,
    graph: Map<string, Array<{ target: string; effectSize: number }>>,
  ): number {
    // Base effect from raw severity
    let dollarScore = event.rawSeverity;

    // Amplify if event touches revenue-related domains
    const revenueDomains = ['revenue', 'sales', 'billing', 'payment', 'subscription', 'churn', 'arr', 'mrr'];
    const touchesRevenue = event.domains.some(d => {
      const lower = d.toLowerCase();
      return revenueDomains.some(rd => lower.includes(rd));
    });

    if (touchesRevenue) {
      dollarScore *= 1.5;
    }

    // Compute compound cascade effect through graph
    for (const domain of event.domains) {
      const edges = graph.get(domain);
      if (!edges) continue;

      for (const edge of edges) {
        const absEffect = Math.abs(edge.effectSize);
        if (absEffect > 0.3) {
          dollarScore += absEffect * 0.2; // Each significant edge adds to dollar effect
        }
      }
    }

    // Anomalies and cascades inherently have higher dollar risk
    if (event.type === 'cascade') dollarScore *= 1.3;
    if (event.type === 'anomaly') dollarScore *= 1.2;

    return Math.min(1.0, dollarScore);
  }

  // ── 3. Strategic Alignment ───────────────────────────────────────

  function computeStrategicAlignment(
    event: ScorableEvent,
    priorities: StrategicPriority[],
  ): { alignment: number; matchedPriorities: string[] } {
    if (priorities.length === 0) return { alignment: 0.5, matchedPriorities: [] };

    let totalAlignment = 0;
    let maxWeight = 0;
    const matchedPriorities: string[] = [];

    const eventText = `${event.title} ${event.description} ${event.domains.join(' ')}`.toLowerCase();

    for (const priority of priorities) {
      let score = 0;

      // Domain overlap
      const domainOverlap = event.domains.filter(d => {
        const lower = d.toLowerCase();
        return priority.relevantDomains.some(rd => lower.includes(rd.toLowerCase()));
      });
      if (domainOverlap.length > 0) {
        score += 0.5 * (domainOverlap.length / Math.max(event.domains.length, 1));
      }

      // Keyword matching
      const keywordHits = priority.keywords.filter(kw => eventText.includes(kw.toLowerCase()));
      if (keywordHits.length > 0) {
        score += 0.5 * Math.min(1.0, keywordHits.length / Math.max(priority.keywords.length * 0.3, 1));
      }

      if (score > 0.2) {
        matchedPriorities.push(priority.name);
        totalAlignment += score * priority.weight;
        maxWeight += priority.weight;
      }
    }

    const alignment = maxWeight > 0 ? Math.min(1.0, totalAlignment / maxWeight) : 0;
    return { alignment, matchedPriorities };
  }

  // ── 4. Novelty ───────────────────────────────────────────────────

  function computeNovelty(
    event: ScorableEvent,
    recentSignatures: Set<string>,
  ): number {
    // Create signature for this event
    const sig = `${event.title} ${event.domains.join(' ')}`.substring(0, 80).toLowerCase().trim();

    // Check if a similar event was seen recently
    let bestSimilarity = 0;
    for (const existing of recentSignatures) {
      const similarity = computeJaccardSimilarity(sig, existing);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
    }

    // Novelty is inverse of similarity: very similar (0.9) → low novelty (0.1)
    const novelty = 1.0 - bestSimilarity;

    return Math.max(0.1, Math.min(1.0, novelty)); // Floor at 0.1 — even repeated events have some novelty
  }

  function computeJaccardSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  // ══════════════════════════════════════════════════════════════════
  // COMPOSITE SCORING
  // ══════════════════════════════════════════════════════════════════

  function computeComposite(
    cascadeReach: number,
    dollarEffect: number,
    strategicAlignment: number,
    novelty: number,
  ): number {
    const weighted =
      cascadeReach * weightCascadeReach +
      dollarEffect * weightDollarEffect +
      strategicAlignment * weightStrategicAlignment +
      novelty * weightNovelty;

    // Scale to 0-100
    return Math.round(Math.min(100, Math.max(0, weighted * 100)));
  }

  function getAlertTier(score: number): 'critical' | 'high' | 'medium' | 'low' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  function generateSummary(
    event: ScorableEvent,
    score: ImpactScore,
  ): string {
    const parts: string[] = [];

    if (score.compositeScore >= 80) {
      parts.push(`CRITICAL: ${event.title} has major business impact.`);
    } else if (score.compositeScore >= 60) {
      parts.push(`HIGH: ${event.title} has significant business impact.`);
    } else if (score.compositeScore >= 40) {
      parts.push(`MODERATE: ${event.title} has moderate business impact.`);
    } else {
      parts.push(`LOW: ${event.title} has minimal business impact.`);
    }

    if (score.affectedDomains.length > 0) {
      parts.push(`Could cascade through ${score.affectedDomains.length} downstream domain${score.affectedDomains.length !== 1 ? 's' : ''} (${score.affectedDomains.slice(0, 3).join(', ')}${score.affectedDomains.length > 3 ? '...' : ''}).`);
    }

    if (score.alignedPriorities.length > 0) {
      parts.push(`Aligns with: ${score.alignedPriorities.join(', ')}.`);
    }

    if (score.novelty > 0.8) {
      parts.push('This is a novel event not seen before.');
    }

    return parts.join(' ');
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Score a single event for business impact.
     */
    async scoreEvent(event: ScorableEvent): Promise<ImpactScore> {
      const [graph, priorities, recentSigs] = await Promise.all([
        loadCausalGraph(),
        loadPriorities(),
        loadRecentEventSignatures(),
      ]);

      // Compute components
      const cascadeResult = computeCascadeReach(event.domains, graph);
      const dollarEffect = computeDollarEffect(event, graph);
      const { alignment, matchedPriorities } = computeStrategicAlignment(event, priorities);
      const novelty = computeNovelty(event, recentSigs);

      // Compute composite
      const compositeScore = computeComposite(
        cascadeResult.reach,
        dollarEffect,
        alignment,
        novelty,
      );

      const shouldAlert = compositeScore >= alertThreshold;

      const score: ImpactScore = {
        eventId: event.id,
        compositeScore,
        cascadeReach: cascadeResult.reach,
        dollarEffect,
        strategicAlignment: alignment,
        novelty,
        summary: '', // Set below
        alignedPriorities: matchedPriorities,
        affectedDomains: cascadeResult.affectedDomains,
        cascadeDepth: cascadeResult.depth,
        shouldAlert,
        alertTier: shouldAlert ? getAlertTier(compositeScore) : undefined,
        scoredAt: new Date().toISOString(),
      };

      score.summary = generateSummary(event, score);

      // LLM enhancement: generate rich impact summary for high-impact events
      if (amplifier && compositeScore >= 40) {
        try {
          const enhanced = await amplifier.generateEnhancedImpactSummary(
            {
              type: event.type,
              title: event.title,
              description: event.description,
              domains: event.domains,
              rawSeverity: event.rawSeverity,
            },
            {
              compositeScore,
              cascadeReach: cascadeResult.reach,
              dollarEffect,
              strategicAlignment: alignment,
              novelty,
              alertTier: score.alertTier,
              affectedDomains: cascadeResult.affectedDomains,
              alignedPriorities: matchedPriorities,
              templateSummary: score.summary,
            },
          );

          if (enhanced.summary && enhanced.summary.length > 10) {
            score.summary = enhanced.summary;
            if (enhanced.businessContext) {
              score.summary += ' ' + enhanced.businessContext;
            }
          }
        } catch (err: any) {
          // Graceful degradation — template summary stands
          if (verbose) {
            console.warn('[AMYGDALA] LLM summary enhancement failed (using template):', err?.message);
          }
        }
      }

      log(`Scored ${event.id}: ${compositeScore}/100 (cascade=${(cascadeResult.reach * 100).toFixed(0)}%, dollar=${(dollarEffect * 100).toFixed(0)}%, strategic=${(alignment * 100).toFixed(0)}%, novelty=${(novelty * 100).toFixed(0)}%) → ${shouldAlert ? score.alertTier!.toUpperCase() : 'no alert'}`);

      return score;
    },

    /**
     * Score a batch of events and return sorted results.
     */
    async scoreBatch(events: ScorableEvent[]): Promise<BatchImpactResult> {
      const start = Date.now();

      // Pre-load all data once
      await Promise.all([
        loadCausalGraph(),
        loadPriorities(),
        loadRecentEventSignatures(),
      ]);

      const scores: ImpactScore[] = [];
      for (const event of events) {
        const graph = cachedGraph!;
        const priorities = cachedPriorities!;
        const recentSigs = cachedRecentEvents!;

        const cascadeResult = computeCascadeReach(event.domains, graph);
        const dollarEffect = computeDollarEffect(event, graph);
        const { alignment, matchedPriorities } = computeStrategicAlignment(event, priorities);
        const novelty = computeNovelty(event, recentSigs);

        const compositeScore = computeComposite(
          cascadeResult.reach,
          dollarEffect,
          alignment,
          novelty,
        );

        const shouldAlert = compositeScore >= alertThreshold;

        const score: ImpactScore = {
          eventId: event.id,
          compositeScore,
          cascadeReach: cascadeResult.reach,
          dollarEffect,
          strategicAlignment: alignment,
          novelty,
          summary: '',
          alignedPriorities: matchedPriorities,
          affectedDomains: cascadeResult.affectedDomains,
          cascadeDepth: cascadeResult.depth,
          shouldAlert,
          alertTier: shouldAlert ? getAlertTier(compositeScore) : undefined,
          scoredAt: new Date().toISOString(),
        };

        score.summary = generateSummary(event, score);
        scores.push(score);
      }

      // Sort by composite score descending
      scores.sort((a, b) => b.compositeScore - a.compositeScore);

      const alerts = scores.filter(s => s.shouldAlert);
      const averageScore = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s.compositeScore, 0) / scores.length)
        : 0;

      const result: BatchImpactResult = {
        scores,
        alerts,
        averageScore,
        topEvent: scores.length > 0 ? scores[0] : null,
        durationMs: Date.now() - start,
      };

      log(`Scored ${events.length} events in ${result.durationMs}ms — ${alerts.length} alerts, avg score ${averageScore}/100`);

      // Persist scoring results as activity log
      try {
        await repository.logActivity({
          agentType: 'impact_scorer',
          actionType: 'batch_scoring',
          inputSummary: `Scored ${events.length} events for ${organizationId.substring(0, 8)}`,
          outputSummary: `${alerts.length} alerts generated, top score: ${result.topEvent?.compositeScore || 0}/100`,
          metadata: {
            totalEvents: events.length,
            alerts: alerts.length,
            averageScore,
            topEventId: result.topEvent?.eventId,
            alertTierCounts: {
              critical: alerts.filter(a => a.alertTier === 'critical').length,
              high: alerts.filter(a => a.alertTier === 'high').length,
              medium: alerts.filter(a => a.alertTier === 'medium').length,
              low: alerts.filter(a => a.alertTier === 'low').length,
            },
          },
        });
      } catch (err) {
        // Non-critical: impact analysis activity log may fail without blocking scoring — err instanceof Error ? err.message : String(err) logged for debugging
      }

      return result;
    },

    /**
     * Get the current strategic priorities.
     */
    async getPriorities(): Promise<StrategicPriority[]> {
      return loadPriorities();
    },

    /**
     * Set/update a strategic priority.
     */
    async setPriority(priority: Omit<StrategicPriority, 'id' | 'organizationId' | 'createdAt'>): Promise<void> {
      const id = `priority-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;

      const { error } = await supabase
        .from('strategic_priorities')
        .upsert({
          id,
          organization_id: organizationId,
          name: priority.name,
          description: priority.description,
          relevant_domains: priority.relevantDomains,
          keywords: priority.keywords,
          weight: priority.weight,
          active: priority.active,
          expires_at: priority.expiresAt,
        });

      if (error) {
        log(`Failed to set priority: ${error.message}`);
        throw error;
      }

      // Invalidate cache
      cachedPriorities = null;
      cacheTimestamp = 0;

      log(`Set strategic priority: ${priority.name} (weight: ${priority.weight})`);
    },

    /**
     * Remove a strategic priority.
     */
    async removePriority(priorityId: string): Promise<void> {
      await supabase
        .from('strategic_priorities')
        .update({ active: false })
        .eq('id', priorityId)
        .eq('organization_id', organizationId);

      // Invalidate cache
      cachedPriorities = null;
      cacheTimestamp = 0;
    },

    /**
     * Invalidate all caches (force refresh on next scoring).
     */
    invalidateCache(): void {
      cachedGraph = null;
      cachedPriorities = null;
      cachedRecentEvents = null;
      cacheTimestamp = 0;
    },
  };
}
