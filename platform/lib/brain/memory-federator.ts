/**
 * Memory Federator (ADR-026)
 * ==========================
 * Promotes high-quality structured-outcome entries from ai_memory into
 * federated_knowledge so per-worker learnings can benefit other workers
 * across the same workspace.
 *
 * Only promotes entries with importance >= 0.7 that have appeared 2+ times
 * across the org (same domain) — consensus from multiple executions signals
 * reliable knowledge worth sharing.
 *
 * The structured-outcome content shape (from agent-rl.ts extractStructuredMemory):
 *   { worked: string, failed: string, pattern: string }
 *
 * Called by: cognitive-cycle cron (lib/brain/se-aas-federation.ts promotePatternsToCore
 *            AND /api/cron/cognitive-cycle route.ts per-org loop)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

type StructuredOutcomeContent = {
  worked: string;
  failed: string;
  pattern: string;
};

function parseStructuredOutcome(content: string): StructuredOutcomeContent | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (
      typeof parsed.worked === 'string' &&
      typeof parsed.failed === 'string' &&
      typeof parsed.pattern === 'string'
    ) {
      return { worked: parsed.worked, failed: parsed.failed, pattern: parsed.pattern };
    }
    return null;
  } catch {
    return null;
  }
}

export async function promoteMemoryToFederatedKnowledge(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Read high-quality structured-outcome entries for this org
    const { data: memoryRows } = await supabase
      .from('ai_memory')
      .select('id, domain, content, importance, created_at')
      .eq('organization_id', orgId)
      .eq('memory_type', 'structured-outcome')
      .gte('importance', 0.7)
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!memoryRows?.length) return 0;

    // Group by domain — collect all "worked" insights and patterns per domain
    const domainMap = new Map<string, { worked: string[]; patterns: string[]; count: number }>();
    for (const row of memoryRows) {
      const domain = row.domain as string;
      const parsed = parseStructuredOutcome(row.content as string);
      if (!parsed) continue;

      const entry = domainMap.get(domain) ?? { worked: [], patterns: [], count: 0 };
      entry.count++;
      if (parsed.worked) entry.worked.push(parsed.worked.slice(0, 150));
      if (parsed.pattern) entry.patterns.push(parsed.pattern.slice(0, 150));
      domainMap.set(domain, entry);
    }

    let promoted = 0;

    for (const [domain, { worked, patterns, count }] of domainMap) {
      // Require at least 2 high-quality entries to establish consensus
      if (count < 2) continue;

      // Deduplicate insights (naive: take unique first 100 chars as key)
      const uniqueWorked = [...new Set(worked.map(w => w.slice(0, 100)))].slice(0, 3);
      const uniquePatterns = [...new Set(patterns.map(p => p.slice(0, 100)))].slice(0, 2);

      const workedSummary = uniqueWorked.join(' | ');
      const patternSummary = uniquePatterns.join(' | ');

      const content =
        `✅ PROVEN APPROACH (${count} executions, domain="${domain}"): ` +
        (workedSummary ? `What worked: ${workedSummary}.` : '') +
        (patternSummary ? ` Patterns: ${patternSummary}.` : '');

      // SELECT-first — avoids constraint dependency
      const { data: existing } = await supabase
        .from('federated_knowledge')
        .select('id')
        .eq('organization_id', orgId)
        .eq('domain', domain)
        .eq('source', 'memory_promotion')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('federated_knowledge')
          .update({
            content,
            confidence: Math.min(0.90, 0.70 + count * 0.02), // grows with consensus, capped at 0.90
            created_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('federated_knowledge').insert({
          organization_id: orgId,
          domain,
          content,
          confidence: Math.min(0.90, 0.70 + count * 0.02),
          source: 'memory_promotion',
        });
      }

      promoted++;
    }

    if (promoted > 0) {
      logger.warn('[MemoryFederator] promoteMemoryToFederatedKnowledge: promoted entries', {
        orgId,
        promoted,
      });
    }

    return promoted;
  } catch (err) {
    logger.warn('[MemoryFederator] promoteMemoryToFederatedKnowledge failed', { err, orgId });
    return 0;
  }
}
