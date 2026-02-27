/**
 * API versioning constants for BrainOS enterprise integrations.
 *
 * All /api/v1/ routes are covered by a 6-month deprecation policy:
 * enterprise customers will receive at least 6 months notice before
 * any breaking change is introduced on a stable versioned route.
 *
 * Unversioned /api/ routes have no backward-compat guarantee and
 * may change at any time without notice.
 */

export const API_VERSION = "1.0.0";

export const API_DEPRECATION_POLICY = "6-months-notice"; // v1 routes get 6mo notice before breaking changes

export const STABLE_ROUTES = [
  "/api/v1/copilot/chat",
  "/api/v1/mcp",
  "/api/v1/agents/chain",
  "/api/v1/webhooks",
] as const;

export type StableRoute = (typeof STABLE_ROUTES)[number];
