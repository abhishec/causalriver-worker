/**
 * Platform Constants
 * ══════════════════════════════════════════════════════════════════════
 * Shared constants used across both server and client components.
 * Keep this file free of server-only imports (next/headers, etc.)
 */

/* ── Organization UUIDs ──────────────────────────────────────────────────────
 * Single source of truth for all organization IDs.
 * Seed scripts and API routes should import from here.
 */

/** Core Brain organization — the platform's own brain */
export const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

/** Company Jarvis — AML compliance SaaS (synthetic data) */
export const COMPANY_JARVIS_ORG_ID = "22222222-2222-4000-a000-222222222222";

/** Finance Jarvis — SEC EDGAR + startup financial intelligence */
export const FINANCE_JARVIS_ORG_ID = "11111111-1111-4000-a000-111111111111";

/** Demo org — competition & demo environment */
export const DEMO_ORG_ID = "00000000-0000-4000-b000-000000000001";
