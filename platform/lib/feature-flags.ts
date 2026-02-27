/**
 * Enterprise Feature Flags
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centralised feature gating for enterprise capabilities.
 * Flags default to safe values (off) and are enabled via environment variables.
 *
 * Usage:
 *   import { isEnabled } from '@/lib/feature-flags';
 *   if (!isEnabled('WEBHOOK_DELIVERY')) return NextResponse.json({ error: 'Not enabled' }, { status: 404 });
 */

export const FEATURE_FLAGS = {
  /** Webhook delivery to org-registered endpoints (requires webhook_configs table) */
  WEBHOOK_DELIVERY: process.env.ENABLE_WEBHOOKS === 'true',

  /** Enterprise data export endpoint — always on */
  DATA_EXPORT: true,

  /** SOC2 audit log — always on */
  AUDIT_LOG: true,

  /** Overnight autonomous agent — opt-in via env var */
  OVERNIGHT_AGENT: process.env.ENABLE_OVERNIGHT_AGENT === 'true',

  /** Onboarding checklist API — always on */
  ONBOARDING_CHECKLIST: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check if a feature flag is enabled.
 * Returns false for any unrecognised flag key.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}
