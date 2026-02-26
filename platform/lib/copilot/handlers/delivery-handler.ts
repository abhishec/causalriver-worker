/**
 * Delivery Intelligence Handler
 *
 * Fetches the full engagement health dataset after a delivery domain execution
 * and merges it with the domain-specific result into a unified deliveryIntelligenceResult.
 *
 * Extracted from chat/route.ts (was lines 1260–1296).
 */

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After executeDomain() returns for a delivery domain (pod-match, early-warning,
 * scope-creep, delivery-intelligence), fetch the full engagement-health panel data
 * and merge with the domain-specific result.
 *
 * @param request - original Next.js request (needed to forward cookies for health fetch)
 * @param domainType - which delivery domain triggered (e.g. 'pod-match')
 * @param domainResult - raw result from executeDomain()
 * @returns merged deliveryIntelligenceResult
 */
export async function buildDeliveryIntelligenceResult(
  request: NextRequest,
  domainType: string,
  domainResult: { result: unknown; artifactId?: string | null }
): Promise<Record<string, unknown>> {
  const podRecommendation =
    (domainResult.result as any)?.data?.top_recommendation ??
    (domainResult.result as any)?.top_recommendation ??
    null;

  try {
    const healthAbort = new AbortController();
    const healthTimeout = setTimeout(() => healthAbort.abort(), 8_000);
    const healthRes = await fetch(
      `${request.nextUrl.origin}/api/se-aas/engagement-health`,
      {
        headers: { cookie: request.headers.get("cookie") || "" },
        signal: healthAbort.signal,
      }
    );
    clearTimeout(healthTimeout);

    if (healthRes.ok) {
      const healthData = await healthRes.json();
      return {
        _domainType: domainType,
        ...healthData,
        podRecommendation,
        domainResult: domainResult.result,
      };
    }
  } catch {
    // Non-fatal: health fetch failed — fall through to domain-only result
  }

  return {
    _domainType: domainType,
    podRecommendation,
    domainResult: domainResult.result,
  };
}

/** Delivery domain names that route to the SEaaSDeliveryPanel */
export const DELIVERY_DOMAINS = new Set([
  "pod-match",
  "delivery-intelligence",
  "early-warning",
  "scope-creep",
]);
