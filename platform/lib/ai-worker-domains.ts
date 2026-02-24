/**
 * AI Worker Domain Mapping
 *
 * Maps service modes (seaas, aas, general) to their source_domain prefixes
 * used throughout the brain pipeline (cross_domain_signals, prediction_records,
 * causal_relationships_statistical, ai_memory).
 *
 * This enables per-AI-Worker brain intelligence by filtering brain stats
 * to only the domains relevant to that worker's service type.
 */

export const SERVICE_DOMAIN_MAP: Record<string, string[]> = {
  seaas: ["engineering", "engineering.github", "engineering.jira", "engineering.code", "engineering.linear"],
  aas: ["finance", "finance.accounting", "finance.audit", "finance.gst", "finance.pnl"],
  general: [], // empty = all domains (no filter applied)
};

/**
 * Get the domain prefixes for a given service mode.
 * Returns empty array for "general" (meaning: show all domains).
 */
export function getDomainsForService(serviceMode: string): string[] {
  return SERVICE_DOMAIN_MAP[serviceMode] || [];
}

/**
 * Check if a domain string matches any of the prefixes for a service mode.
 */
export function isDomainForService(domain: string, serviceMode: string): boolean {
  const prefixes = getDomainsForService(serviceMode);
  if (prefixes.length === 0) return true; // general = all domains
  return prefixes.some((prefix) => domain.startsWith(prefix));
}
