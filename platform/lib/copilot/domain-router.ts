/**
 * Domain Router
 *
 * Determines which service domain to execute based on:
 *   1. LLM interpretation (primary — semantic routing)
 *   2. Regex fallback (safety net when LLM interpretation unavailable or regex-fallback)
 *
 * Extracted from chat/route.ts (was lines 1072–1106).
 *
 * MEMORY: detectSEaaSRoute/detectAccountingRoute are regex fallbacks only.
 * VALID_SEAAS_DOMAINS is THE GATE — if a domain isn't here, LLM routing is ignored.
 */

import {
  detectSEaaSRoute,
  detectAccountingRoute,
  detectPmAasRoute,
} from "@/lib/copilot/handlers/seaas-handler";
import {
  VALID_SEAAS_DOMAIN_IDS,
  VALID_PM_AAS_DOMAIN_IDS,
} from "@/lib/copilot/action-domain-registry";

interface QueryInterpretation {
  source?: string;
  serviceRoute?: {
    type: string;
    seaasDomain?: string;
    seaasInput?: Record<string, unknown>;
    aasDomain?: string;
    aasInput?: Record<string, unknown>;
    pmaasDomain?: string;
    pmaasInput?: Record<string, unknown>;
    agentSpec?: {
      name: string;
      description?: string;
      domain?: string;
      trigger?: string;
      schedule?: string;
      requiredInputs?: string[];
    };
  };
  [k: string]: unknown;
}

export interface DomainRoute {
  domainType: string;
  extractedInput: Record<string, unknown>;
}

/**
 * All valid SE-aaS domain types. Any LLM-interpreted domain not in this set
 * will fall back to regex detection.
 *
 * SOURCE OF TRUTH: action-domain-registry.ts — do NOT add entries here.
 * Add a new DomainRegistryEntry to DOMAIN_REGISTRY and this set updates automatically.
 */
export const VALID_SEAAS_DOMAINS = VALID_SEAAS_DOMAIN_IDS;

/**
 * All valid PM-aaS domain types.
 *
 * SOURCE OF TRUTH: action-domain-registry.ts — do NOT add entries here.
 * Add a new DomainRegistryEntry to DOMAIN_REGISTRY and this set updates automatically.
 */
export const VALID_PM_AAS_DOMAINS = VALID_PM_AAS_DOMAIN_IDS;

/**
 * Resolve the SE-aaS route from LLM interpretation or regex fallback.
 * Returns null if neither found a matching domain.
 */
export function resolveSeaasRoute(
  message: string,
  interpretation: QueryInterpretation | undefined
): DomainRoute | null {
  const serviceRoute = interpretation?.serviceRoute;
  const llmSeaasDomain = serviceRoute?.type === "se-aas" ? serviceRoute.seaasDomain : null;

  // LLM interpretation wins if the domain is valid
  if (llmSeaasDomain && VALID_SEAAS_DOMAINS.has(llmSeaasDomain)) {
    return {
      domainType: llmSeaasDomain,
      extractedInput: serviceRoute?.seaasInput || {},
    };
  }

  // Regex fallback — only when LLM wasn't used or returned regex-fallback source
  if (!interpretation || interpretation.source === "regex-fallback") {
    return detectSEaaSRoute(message);
  }

  return null;
}

/**
 * Resolve the PM-aaS route from LLM interpretation or regex fallback.
 * Returns null if neither found a matching domain.
 */
export function resolvePmAasRoute(
  message: string,
  interpretation: QueryInterpretation | undefined
): DomainRoute | null {
  const serviceRoute = interpretation?.serviceRoute;
  const llmPmDomain =
    serviceRoute?.type === "pm-aas" ? serviceRoute.pmaasDomain : null;

  // LLM interpretation wins if the domain is valid
  if (llmPmDomain && VALID_PM_AAS_DOMAINS.has(llmPmDomain)) {
    return {
      domainType: llmPmDomain,
      extractedInput: serviceRoute?.pmaasInput || {},
    };
  }

  // Regex fallback — only when LLM wasn't used or returned regex-fallback source
  if (!interpretation || interpretation.source === "regex-fallback") {
    return detectPmAasRoute(message);
  }

  return null;
}

/**
 * Resolve the AaaS (Accounting) route from LLM interpretation or regex fallback.
 * Returns null if neither found a matching domain.
 */
export function resolveAccountingRoute(
  message: string,
  interpretation: QueryInterpretation | undefined
): DomainRoute | null {
  const serviceRoute = interpretation?.serviceRoute;

  // LLM interpretation wins
  if (serviceRoute?.type === "aas" && serviceRoute.aasDomain) {
    return {
      domainType: serviceRoute.aasDomain,
      extractedInput: serviceRoute.aasInput || {},
    };
  }

  // Regex fallback
  if (!interpretation || interpretation.source === "regex-fallback") {
    return detectAccountingRoute(message);
  }

  return null;
}
