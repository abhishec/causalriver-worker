/**
 * Federation Constants — Single Source of Truth
 * ================================================
 *
 * ALL federation-related constants live here.
 * Import from this file instead of hardcoding the UUID anywhere.
 *
 * WHY THIS MATTERS:
 *   The CORE brain UUID was previously defined in 14 different files
 *   under 3 different variable names (CORE_BRAIN_ORG_ID, CORE_ORGANIZATION_ID,
 *   CORE_ORG_ID). A single typo in any one of them creates a silent data
 *   black hole — promoted knowledge is written to the wrong org and never
 *   read back by the federation layer.
 *
 *   This file is the canonical reference. Changing it once changes everything.
 *
 * @packageDocumentation
 */

/**
 * The CORE Brain organization ID.
 *
 * This is the well-known UUID for the shared baseline knowledge graph.
 * It is the target for FedAvg promotions, the source for CORE-to-ORG
 * push-down of high-confidence priors, and the identifier used in all
 * federation audit logs.
 *
 * Format: version-4 UUID with deliberate structure for easy recognition:
 *   00000000-0000-4000-a000-000000000001
 *
 * NEVER hardcode this UUID elsewhere. Always import from here.
 */
export const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

/**
 * Alias exported for backwards compat with `federated-brain.ts` which
 * historically used `CORE_ORGANIZATION_ID`.
 * @deprecated Use CORE_BRAIN_ORG_ID
 */
export const CORE_ORGANIZATION_ID = CORE_BRAIN_ORG_ID;

/**
 * Helper: returns true if the given org ID is the CORE brain.
 * Use this instead of direct equality checks to keep the concept centralized.
 */
export function isCoreOrg(organizationId: string): boolean {
  return organizationId === CORE_BRAIN_ORG_ID;
}

/**
 * Minimum evidence weight (contributing orgs) before a CORE causal edge
 * is considered strong enough to push down to individual orgs as a prior.
 *
 * Below this threshold, the edge is in "observation" mode: we collect data
 * but don't impose it on orgs as a baseline.
 */
export const CORE_PUSH_MIN_EVIDENCE_WEIGHT = 10;

/**
 * Minimum effect size for a CORE causal edge to be pushed down to orgs.
 * Edges weaker than this are too noisy to use as a prior.
 */
export const CORE_PUSH_MIN_EFFECT_SIZE = 0.7;

/**
 * FedAvg learning rate — how much weight a single org's delta gets
 * when updating the CORE brain's causal graph.
 *
 * Lower = more stable CORE (harder for outlier orgs to skew the graph).
 * Higher = CORE adapts faster but is more volatile.
 *
 * McMahan et al. 2017 recommends 0.1–0.3 for federated settings.
 */
export const FED_AVG_LEARNING_RATE = 0.3;

/**
 * Maximum absolute delta any single org can contribute to CORE per cycle.
 * This is the differential-privacy analog of gradient clipping.
 */
export const FED_AVG_MAX_DELTA = 0.15;
