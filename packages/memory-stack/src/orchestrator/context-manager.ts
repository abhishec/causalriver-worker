/**
 * Context Manager — Working Memory (Prefrontal Cortex)
 * =====================================================
 *
 * Brain Analog: The Prefrontal Cortex maintains "working memory" — what
 * you're actively thinking about. Context determines how you interpret
 * new information. If you've been thinking about churn all morning, then
 * someone says "the numbers are down", your brain AUTOMATICALLY interprets
 * it as churn-related, not revenue or NPS.
 *
 * This module tracks:
 * - Per-user recent queries (what each person is focused on)
 * - Per-department attention state (what topics are hot across the org)
 * - Org strategic priorities (what the org cares about)
 * - Recent proactive insights (DMN discoveries)
 * - Active cascade alerts (ongoing incidents)
 *
 * The context is injected into queries before LLM calls, so the copilot
 * understands WHAT the user is thinking about, not just WHAT they typed.
 *
 * Usage:
 *   const ctx = createContextManager({ supabase, organizationId });
 *   ctx.recordQuery('user-1', 'Why is churn increasing?', 'churn');
 *   const enriched = ctx.enrichQuery('the numbers are down', 'user-1');
 *   // enriched.contextHint = "User has been asking about churn (3 recent queries)"
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ContextManagerConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** Maximum recent queries per user to track (default: 10) */
  maxRecentQueries?: number;
  /** Context decay time in minutes (default: 120 — 2 hours) */
  contextDecayMinutes?: number;
  verbose?: boolean;
}

export interface QueryRecord {
  userId: string;
  query: string;
  domain: string;
  timestamp: Date;
}

export interface UserContext {
  userId: string;
  recentQueries: QueryRecord[];
  focusDomains: string[];
  dominantDomain?: string;
  queryCount: number;
  lastActiveAt: Date;
}

export interface DomainContext {
  domain: string;
  recentQueryCount: number;
  activeUsers: string[];
  isHotTopic: boolean;
  lastQueriedAt: Date;
}

export interface OrgContext {
  organizationId: string;
  hotDomains: string[];
  activeUserCount: number;
  recentInsights: string[];
  activeCascades: string[];
}

export interface EnrichedQuery {
  originalQuery: string;
  contextHint: string;
  suggestedDomains: string[];
  userFocus?: string;
  orgFocus?: string;
  enrichedAt: string;
}

// ============================================================================
// CONTEXT MANAGER FACTORY
// ============================================================================

export function createContextManager(config: ContextManagerConfig) {
  const {
    organizationId,
    maxRecentQueries = 10,
    contextDecayMinutes = 120,
    verbose = false,
  } = config;

  const log = verbose
    ? (...args: unknown[]) => console.log('[ContextManager]', ...args)
    : () => {};

  // In-memory state (Working Memory is fast, not persistent)
  const userQueries = new Map<string, QueryRecord[]>();
  const recentInsights: string[] = [];
  const activeCascades: string[] = [];

  // ========================================================================
  // QUERY RECORDING
  // ========================================================================

  function recordQuery(userId: string, query: string, domain: string): void {
    if (!userQueries.has(userId)) {
      userQueries.set(userId, []);
    }

    const records = userQueries.get(userId)!;
    records.push({
      userId,
      query,
      domain,
      timestamp: new Date(),
    });

    // Trim to max size
    while (records.length > maxRecentQueries) {
      records.shift();
    }

    log(`Recorded query for ${userId}: "${query.slice(0, 40)}..." (domain: ${domain})`);
  }

  function recordInsight(title: string): void {
    recentInsights.push(title);
    if (recentInsights.length > 20) recentInsights.shift();
  }

  function recordCascade(description: string): void {
    activeCascades.push(description);
    if (activeCascades.length > 10) activeCascades.shift();
  }

  function clearCascade(description: string): void {
    const idx = activeCascades.indexOf(description);
    if (idx >= 0) activeCascades.splice(idx, 1);
  }

  // ========================================================================
  // CONTEXT RETRIEVAL
  // ========================================================================

  function getContextForUser(userId: string): UserContext {
    const records = getRecentRecords(userId);
    const domainCounts = new Map<string, number>();

    for (const record of records) {
      domainCounts.set(record.domain, (domainCounts.get(record.domain) || 0) + 1);
    }

    const focusDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain);

    return {
      userId,
      recentQueries: records,
      focusDomains,
      dominantDomain: focusDomains[0],
      queryCount: records.length,
      lastActiveAt: records.length > 0 ? records[records.length - 1].timestamp : new Date(),
    };
  }

  function getContextForDomain(domain: string): DomainContext {
    const now = new Date();
    const cutoff = new Date(now.getTime() - contextDecayMinutes * 60 * 1000);

    let queryCount = 0;
    const users = new Set<string>();
    let lastQueriedAt = new Date(0);

    for (const [userId, records] of userQueries) {
      for (const record of records) {
        if (record.domain === domain && record.timestamp > cutoff) {
          queryCount++;
          users.add(userId);
          if (record.timestamp > lastQueriedAt) {
            lastQueriedAt = record.timestamp;
          }
        }
      }
    }

    return {
      domain,
      recentQueryCount: queryCount,
      activeUsers: Array.from(users),
      isHotTopic: queryCount >= 3 || users.size >= 2,
      lastQueriedAt,
    };
  }

  function getOrgContext(): OrgContext {
    const now = new Date();
    const cutoff = new Date(now.getTime() - contextDecayMinutes * 60 * 1000);

    const domainCounts = new Map<string, number>();
    const activeUsers = new Set<string>();

    for (const [userId, records] of userQueries) {
      for (const record of records) {
        if (record.timestamp > cutoff) {
          activeUsers.add(userId);
          domainCounts.set(record.domain, (domainCounts.get(record.domain) || 0) + 1);
        }
      }
    }

    const hotDomains = Array.from(domainCounts.entries())
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain);

    return {
      organizationId,
      hotDomains,
      activeUserCount: activeUsers.size,
      recentInsights: [...recentInsights],
      activeCascades: [...activeCascades],
    };
  }

  // ========================================================================
  // QUERY ENRICHMENT
  // ========================================================================

  /**
   * Enrich a query with context — inject working memory into the query.
   *
   * Brain Analog: When you hear "the numbers are down" and you've been
   * thinking about churn all morning, your brain automatically interprets
   * it as "churn numbers are down". This function does the same.
   */
  function enrichQuery(query: string, userId?: string): EnrichedQuery {
    const hints: string[] = [];
    const suggestedDomains: string[] = [];
    let userFocus: string | undefined;
    let orgFocus: string | undefined;

    // User context
    if (userId) {
      const userCtx = getContextForUser(userId);
      if (userCtx.dominantDomain) {
        userFocus = userCtx.dominantDomain;
        suggestedDomains.push(userCtx.dominantDomain);
        hints.push(
          `User has been asking about ${userCtx.dominantDomain} ` +
          `(${userCtx.queryCount} recent queries)`
        );
      }
    }

    // Org context
    const orgCtx = getOrgContext();
    if (orgCtx.hotDomains.length > 0) {
      orgFocus = orgCtx.hotDomains[0];
      suggestedDomains.push(...orgCtx.hotDomains);
      hints.push(
        `Org is focused on: ${orgCtx.hotDomains.join(', ')}`
      );
    }

    if (orgCtx.activeCascades.length > 0) {
      hints.push(
        `Active cascades: ${orgCtx.activeCascades.join('; ')}`
      );
    }

    if (orgCtx.recentInsights.length > 0) {
      hints.push(
        `Recent insights: ${orgCtx.recentInsights.slice(0, 3).join('; ')}`
      );
    }

    return {
      originalQuery: query,
      contextHint: hints.length > 0
        ? `Working Memory context: ${hints.join('. ')}.`
        : '',
      suggestedDomains: [...new Set(suggestedDomains)],
      userFocus,
      orgFocus,
      enrichedAt: new Date().toISOString(),
    };
  }

  // ========================================================================
  // INTERNALS
  // ========================================================================

  function getRecentRecords(userId: string): QueryRecord[] {
    const records = userQueries.get(userId) || [];
    const now = new Date();
    const cutoff = new Date(now.getTime() - contextDecayMinutes * 60 * 1000);
    return records.filter(r => r.timestamp > cutoff);
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  return {
    recordQuery,
    recordInsight,
    recordCascade,
    clearCascade,
    getContextForUser,
    getContextForDomain,
    getOrgContext,
    enrichQuery,
  };
}
