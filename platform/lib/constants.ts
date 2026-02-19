/**
 * Platform Constants
 * ══════════════════════════════════════════════════════════════════════
 * Shared constants used across both server and client components.
 * Keep this file free of server-only imports (next/headers, etc.)
 */

/* ── Customer UUIDs ──────────────────────────────────────────────────────────
 * A Customer is the top-level identity unit (e.g. "Tookitaki", "PH Accounting").
 * Users belong to CUSTOMERS (via customer_members table).
 * Workspaces (orgs) are isolated brain tracks under a customer — brain scoping only.
 *
 * Hierarchy:  Customer → Workspace (Org) → Brain
 *
 * Seed scripts and API routes should import customer IDs from here.
 */

/** NexusBrain Platform — internal customer, owns the Core Brain workspace */
export const NEXUSBRAIN_CUSTOMER_ID = '00000000-0000-4000-c000-000000000001';

/** Demo — competition and demo environment */
export const DEMO_CUSTOMER_ID = '00000000-0000-4000-c000-000000000002';

/** PH Accounting — design partner for Accounting-as-a-Service (AaaS) */
export const PH_ACCOUNTING_CUSTOMER_ID = '00000000-0000-4000-c000-000000000003';

/** Company Jarvis — AML compliance SaaS (synthetic data) */
export const COMPANY_JARVIS_CUSTOMER_ID = '00000000-0000-4000-c000-000000000004';

/** Finance Jarvis — SEC EDGAR + startup financial intelligence (synthetic) */
export const FINANCE_JARVIS_CUSTOMER_ID = '00000000-0000-4000-c000-000000000005';

/** Tookitaki — first design partner customer (FinTech / AML compliance) */
export const TOOKITAKI_CUSTOMER_ID = 'a1000000-0000-4000-a000-000000000001';

/* ── Organization / Workspace UUIDs ─────────────────────────────────────────
 * An organization IS a workspace — one isolated brain track under a customer.
 * All brain tables (signals, causal graph, ai_memory, etc.) scope by organization_id.
 * customer_id on the org row is for billing/UI grouping only — never crosses brain boundaries.
 *
 * NOTE: prefer customer IDs above for user identity/auth logic.
 *       Use org IDs only for brain/signal/causal graph operations.
 */

/**
 * Core Brain workspace — the platform's own brain.
 * Belongs to: NEXUSBRAIN_CUSTOMER_ID
 * Canonical source: packages/memory-stack/src/federation/constants.ts
 * Inlined here to avoid pulling memory-stack (tree-sitter native modules) into client bundles.
 */
export const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';

/** Company Jarvis workspace — AML compliance SaaS (synthetic data). Belongs to: COMPANY_JARVIS_CUSTOMER_ID */
export const COMPANY_JARVIS_ORG_ID = '22222222-2222-4000-a000-222222222222';

/** Finance Jarvis workspace — SEC EDGAR + startup financial intelligence. Belongs to: FINANCE_JARVIS_CUSTOMER_ID */
export const FINANCE_JARVIS_ORG_ID = '11111111-1111-4000-a000-111111111111';

/** Demo workspace — competition & demo environment. Belongs to: DEMO_CUSTOMER_ID */
export const DEMO_ORG_ID = '00000000-0000-4000-b000-000000000001';
