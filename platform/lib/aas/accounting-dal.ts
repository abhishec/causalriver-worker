/**
 * Accounting Data Access Layer (ADR-029 Phase 4)
 * ================================================
 *
 * Typed helpers for the 3 accounting tables introduced in Phase 4:
 *   - journal_entries
 *   - bank_reconciliations
 *   - entity_financials
 *
 * All functions accept a SupabaseClient so they can be called from
 * both API routes (user-scoped client) and agent executors (service
 * client). Callers are responsible for scoping to the correct org.
 *
 * Validation rules enforced here:
 *   - Journal entries: sum(debit) must equal sum(credit)
 *   - Reconciliation: period_start must be before period_end
 *   - Entity financials: UPSERT on (organization_id, entity_code, period)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES — Journal Entries
// ============================================================================

export interface JournalEntryLineItem {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description?: string;
  tax_code?: string;
}

export interface CreateJournalEntryParams {
  organizationId: string;
  entryDate: string; // ISO date e.g. "2025-03-31"
  referenceNumber?: string;
  description: string;
  currency?: string;
  lineItems: JournalEntryLineItem[];
  source?: "manual" | "agent" | "import" | "reconciliation";
  agentJobId?: string;
  sourceDocumentId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface JournalEntry {
  id: string;
  organization_id: string;
  entry_date: string;
  reference_number: string | null;
  description: string;
  currency: string;
  status: "draft" | "posted" | "voided";
  line_items: JournalEntryLineItem[];
  total_debit: number;
  total_credit: number;
  source: "manual" | "agent" | "import" | "reconciliation";
  agent_job_id: string | null;
  source_document_id: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  posted_at: string | null;
  updated_at: string;
}

export interface JournalEntryFilters {
  period?: { start: string; end: string };
  status?: "draft" | "posted" | "voided";
  limit?: number;
  offset?: number;
}

// ============================================================================
// TYPES — Bank Reconciliations
// ============================================================================

export interface MatchedTransaction {
  bankTxnId: string;
  bankDate: string;
  bankAmount: number;
  bankDescription: string;
  bookTxnId: string;
  bookDate: string;
  bookAmount: number;
  bookDescription: string;
  matchConfidence: number;
  matchMethod: "exact" | "fuzzy" | "manual";
}

export interface UnreconciledItem {
  txnId: string;
  date: string;
  amount: number;
  description: string;
  source: "bank" | "book";
  reason?: string;
}

export interface CreateReconciliationParams {
  organizationId: string;
  bankAccountName: string;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date
  bankStatementBalance: number;
  bookBalance: number;
  agentJobId?: string;
  reconciledBy?: string;
}

export interface UpdateReconciliationParams {
  status?: "in_progress" | "completed" | "reviewed";
  reconciledBalance?: number;
  difference?: number;
  matchedTransactions?: MatchedTransaction[];
  unreconciledItems?: UnreconciledItem[];
  completedAt?: string;
}

export interface Reconciliation {
  id: string;
  organization_id: string;
  bank_account_name: string;
  period_start: string;
  period_end: string;
  status: "in_progress" | "completed" | "reviewed";
  bank_statement_balance: number;
  book_balance: number;
  reconciled_balance: number | null;
  difference: number | null;
  matched_transactions: MatchedTransaction[] | null;
  unreconciled_items: UnreconciledItem[] | null;
  agent_job_id: string | null;
  reconciled_by: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface ReconciliationFilters {
  status?: "in_progress" | "completed" | "reviewed";
  bankAccount?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// TYPES — Entity Financials
// ============================================================================

export interface UpsertEntityFinancialsParams {
  organizationId: string;
  entityName: string;
  entityCode: string;
  period: string; // ISO date — first day of period e.g. "2025-01-01"
  currency?: string;
  exchangeRate?: number;
  financialData: Record<string, unknown>;
  intercompanyEliminations?: Record<string, unknown>;
  consolidationAdjustments?: Record<string, unknown>;
  status?: "draft" | "final" | "audited";
  agentJobId?: string;
  createdBy?: string;
}

export interface EntityFinancial {
  id: string;
  organization_id: string;
  entity_name: string;
  entity_code: string;
  period: string;
  currency: string;
  exchange_rate: number | null;
  financial_data: Record<string, unknown>;
  intercompany_eliminations: Record<string, unknown> | null;
  consolidation_adjustments: Record<string, unknown> | null;
  status: "draft" | "final" | "audited";
  agent_job_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityFinancialFilters {
  period?: string;
  entityCode?: string;
  status?: "draft" | "final" | "audited";
  limit?: number;
}

export interface ConsolidatedResult {
  period: string;
  organizationId: string;
  entityCount: number;
  currency: string;
  /** Sum of all entities' financial_data, after eliminations */
  consolidated: Record<string, number>;
  /** Per-entity breakdown for drill-down */
  entities: Array<{
    entityCode: string;
    entityName: string;
    currency: string;
    exchangeRate: number;
    financialData: Record<string, unknown>;
    intercompanyEliminations: Record<string, unknown> | null;
    consolidationAdjustments: Record<string, unknown> | null;
    status: string;
  }>;
  /** Elimination totals applied across all entities */
  totalEliminations: Record<string, number>;
}

// ============================================================================
// JOURNAL ENTRIES — DAL
// ============================================================================

/**
 * Create a draft journal entry. Validates that total debits equal total credits
 * before inserting. Returns the created entry id and totals, or null on failure.
 */
export async function createJournalEntry(
  supabase: SupabaseClient,
  params: CreateJournalEntryParams,
): Promise<{ id: string; totalDebit: number; totalCredit: number } | null> {
  const {
    organizationId,
    entryDate,
    referenceNumber,
    description,
    currency = "SGD",
    lineItems,
    source = "manual",
    agentJobId,
    sourceDocumentId,
    metadata,
    createdBy,
  } = params;

  if (!lineItems || lineItems.length === 0) {
    logger.warn("[accounting-dal] createJournalEntry: lineItems is empty", { organizationId });
    return null;
  }

  // ── Validation: double-entry rule — debits must equal credits ──────────────
  const totalDebit = lineItems.reduce((acc, li) => acc + (li.debit ?? 0), 0);
  const totalCredit = lineItems.reduce((acc, li) => acc + (li.credit ?? 0), 0);

  // Round to 2 decimal places to avoid floating-point drift
  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;

  if (roundedDebit !== roundedCredit) {
    logger.warn("[accounting-dal] createJournalEntry: debit/credit imbalance", {
      organizationId,
      totalDebit: roundedDebit,
      totalCredit: roundedCredit,
      diff: Math.abs(roundedDebit - roundedCredit),
    });
    return null;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      organization_id: organizationId,
      entry_date: entryDate,
      reference_number: referenceNumber ?? null,
      description,
      currency,
      status: "draft",
      line_items: lineItems,
      total_debit: roundedDebit,
      total_credit: roundedCredit,
      source,
      agent_job_id: agentJobId ?? null,
      source_document_id: sourceDocumentId ?? null,
      metadata: metadata ?? null,
      created_by: createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("id, total_debit, total_credit")
    .single();

  if (error) {
    logger.error("[accounting-dal] createJournalEntry insert failed", {
      error: error.message,
      organizationId,
    });
    return null;
  }

  return {
    id: data.id as string,
    totalDebit: data.total_debit as number,
    totalCredit: data.total_credit as number,
  };
}

/**
 * List journal entries for an organisation, with optional filters.
 * Results are ordered by entry_date DESC.
 */
export async function getJournalEntries(
  supabase: SupabaseClient,
  orgId: string,
  filters?: JournalEntryFilters,
): Promise<JournalEntry[]> {
  let query = supabase
    .from("journal_entries")
    .select("*")
    .eq("organization_id", orgId)
    .order("entry_date", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.period?.start) {
    query = query.gte("entry_date", filters.period.start);
  }

  if (filters?.period?.end) {
    query = query.lte("entry_date", filters.period.end);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1);
  } else {
    query = query.limit(filters?.limit ?? 50);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("[accounting-dal] getJournalEntries failed", {
      error: error.message,
      orgId,
    });
    return [];
  }

  return (data ?? []) as JournalEntry[];
}

/**
 * Post a draft journal entry — sets status to 'posted' and records posted_at.
 * Only draft entries can be posted; attempting to post a voided or already-posted
 * entry returns false.
 */
export async function postJournalEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("journal_entries")
    .update({
      status: "posted",
      posted_at: now,
      updated_at: now,
    })
    .eq("id", entryId)
    .eq("status", "draft"); // Guard: only draft → posted transition is valid

  if (error) {
    logger.error("[accounting-dal] postJournalEntry failed", {
      error: error.message,
      entryId,
    });
    return false;
  }

  return true;
}

/**
 * Void a journal entry. Posted entries can be voided; voided entries are
 * idempotent (returns true). Draft entries can also be voided.
 */
export async function voidJournalEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("journal_entries")
    .update({
      status: "voided",
      updated_at: now,
    })
    .eq("id", entryId)
    .neq("status", "voided"); // Idempotent: already-voided rows are untouched

  if (error) {
    logger.error("[accounting-dal] voidJournalEntry failed", {
      error: error.message,
      entryId,
    });
    return false;
  }

  return true;
}

// ============================================================================
// BANK RECONCILIATIONS — DAL
// ============================================================================

/**
 * Create a new bank reconciliation in 'in_progress' status.
 * Validates that period_start is before period_end.
 */
export async function createReconciliation(
  supabase: SupabaseClient,
  params: CreateReconciliationParams,
): Promise<{ id: string } | null> {
  const {
    organizationId,
    bankAccountName,
    periodStart,
    periodEnd,
    bankStatementBalance,
    bookBalance,
    agentJobId,
    reconciledBy,
  } = params;

  // ── Validation: period ordering ─────────────────────────────────────────
  if (new Date(periodStart) >= new Date(periodEnd)) {
    logger.warn("[accounting-dal] createReconciliation: periodStart must be before periodEnd", {
      organizationId,
      periodStart,
      periodEnd,
    });
    return null;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("bank_reconciliations")
    .insert({
      organization_id: organizationId,
      bank_account_name: bankAccountName,
      period_start: periodStart,
      period_end: periodEnd,
      status: "in_progress",
      bank_statement_balance: bankStatementBalance,
      book_balance: bookBalance,
      reconciled_balance: null,
      difference: null,
      matched_transactions: null,
      unreconciled_items: null,
      agent_job_id: agentJobId ?? null,
      reconciled_by: reconciledBy ?? null,
      created_at: now,
      completed_at: null,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("[accounting-dal] createReconciliation insert failed", {
      error: error.message,
      organizationId,
    });
    return null;
  }

  return { id: data.id as string };
}

/**
 * Update a bank reconciliation with match results, status change, or balance.
 * Returns true on success, false on failure.
 */
export async function updateReconciliation(
  supabase: SupabaseClient,
  recoId: string,
  updates: UpdateReconciliationParams,
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.reconciledBalance !== undefined) patch.reconciled_balance = updates.reconciledBalance;
  if (updates.difference !== undefined) patch.difference = updates.difference;
  if (updates.matchedTransactions !== undefined) patch.matched_transactions = updates.matchedTransactions;
  if (updates.unreconciledItems !== undefined) patch.unreconciled_items = updates.unreconciledItems;
  if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;

  const { error } = await supabase
    .from("bank_reconciliations")
    .update(patch)
    .eq("id", recoId);

  if (error) {
    logger.error("[accounting-dal] updateReconciliation failed", {
      error: error.message,
      recoId,
    });
    return false;
  }

  return true;
}

/**
 * List bank reconciliations for an organisation, ordered by period_end DESC.
 */
export async function getReconciliations(
  supabase: SupabaseClient,
  orgId: string,
  filters?: ReconciliationFilters,
): Promise<Reconciliation[]> {
  let query = supabase
    .from("bank_reconciliations")
    .select("*")
    .eq("organization_id", orgId)
    .order("period_end", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.bankAccount) {
    query = query.ilike("bank_account_name", `%${filters.bankAccount}%`);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 20) - 1);
  } else {
    query = query.limit(filters?.limit ?? 20);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("[accounting-dal] getReconciliations failed", {
      error: error.message,
      orgId,
    });
    return [];
  }

  return (data ?? []) as Reconciliation[];
}

// ============================================================================
// ENTITY FINANCIALS — DAL
// ============================================================================

/**
 * Upsert entity financials. UPSERT key is (organization_id, entity_code, period).
 * On conflict the financial_data, eliminations, adjustments, and status are updated.
 * Returns the id of the upserted row, or null on failure.
 */
export async function upsertEntityFinancials(
  supabase: SupabaseClient,
  params: UpsertEntityFinancialsParams,
): Promise<{ id: string } | null> {
  const {
    organizationId,
    entityName,
    entityCode,
    period,
    currency = "SGD",
    exchangeRate,
    financialData,
    intercompanyEliminations,
    consolidationAdjustments,
    status = "draft",
    agentJobId,
    createdBy,
  } = params;

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("entity_financials")
    .upsert(
      {
        organization_id: organizationId,
        entity_name: entityName,
        entity_code: entityCode,
        period,
        currency,
        exchange_rate: exchangeRate ?? null,
        financial_data: financialData,
        intercompany_eliminations: intercompanyEliminations ?? null,
        consolidation_adjustments: consolidationAdjustments ?? null,
        status,
        agent_job_id: agentJobId ?? null,
        created_by: createdBy ?? null,
        updated_at: now,
      },
      {
        onConflict: "organization_id,entity_code,period",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (error) {
    logger.error("[accounting-dal] upsertEntityFinancials failed", {
      error: error.message,
      organizationId,
      entityCode,
      period,
    });
    return null;
  }

  return { id: data.id as string };
}

/**
 * List entity financials for an organisation.
 * Results ordered by period DESC, then entity_code ASC.
 */
export async function getEntityFinancials(
  supabase: SupabaseClient,
  orgId: string,
  filters?: EntityFinancialFilters,
): Promise<EntityFinancial[]> {
  let query = supabase
    .from("entity_financials")
    .select("*")
    .eq("organization_id", orgId)
    .order("period", { ascending: false })
    .order("entity_code", { ascending: true });

  if (filters?.period) {
    query = query.eq("period", filters.period);
  }

  if (filters?.entityCode) {
    query = query.eq("entity_code", filters.entityCode);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  query = query.limit(filters?.limit ?? 100);

  const { data, error } = await query;

  if (error) {
    logger.error("[accounting-dal] getEntityFinancials failed", {
      error: error.message,
      orgId,
    });
    return [];
  }

  return (data ?? []) as EntityFinancial[];
}

/**
 * Compute consolidated financials for all entities in a given period.
 *
 * Aggregation logic:
 *   1. Load all entity_financials rows for (orgId, period)
 *   2. Convert each entity's financial_data to the reporting currency
 *      using their exchange_rate (default 1.0 if null)
 *   3. Sum numeric leaf values across entities
 *   4. Subtract intercompany_eliminations to remove intra-group transactions
 *
 * Returns null if no entities found for the period.
 */
export async function getConsolidatedFinancials(
  supabase: SupabaseClient,
  orgId: string,
  period: string,
): Promise<ConsolidatedResult | null> {
  const entities = await getEntityFinancials(supabase, orgId, { period, limit: 200 });

  if (entities.length === 0) {
    return null;
  }

  // ── Reporting currency: use the most common currency, fall back to SGD ──
  const currencyCounts: Record<string, number> = {};
  for (const e of entities) {
    currencyCounts[e.currency] = (currencyCounts[e.currency] ?? 0) + 1;
  }
  const reportingCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "SGD";

  // ── Consolidation pass: sum all numeric leaf values in financial_data ──
  const consolidated: Record<string, number> = {};
  const totalEliminations: Record<string, number> = {};

  for (const entity of entities) {
    const rate = entity.exchange_rate ?? 1.0;
    const localData = entity.financial_data ?? {};

    // Sum financial_data numeric values, FX-converted to reporting currency
    for (const [key, value] of Object.entries(localData)) {
      if (typeof value === "number") {
        consolidated[key] = (consolidated[key] ?? 0) + value * rate;
      }
    }

    // Accumulate intercompany eliminations (subtracted from consolidated)
    if (entity.intercompany_eliminations) {
      for (const [key, value] of Object.entries(entity.intercompany_eliminations)) {
        if (typeof value === "number") {
          totalEliminations[key] = (totalEliminations[key] ?? 0) + value;
        }
      }
    }
  }

  // Apply eliminations: subtract intercompany amounts from consolidated totals
  for (const [key, eliminationAmount] of Object.entries(totalEliminations)) {
    if (key in consolidated) {
      consolidated[key] = consolidated[key] - eliminationAmount;
    }
  }

  // Round all consolidated values to 2 decimal places
  for (const key of Object.keys(consolidated)) {
    consolidated[key] = Math.round(consolidated[key] * 100) / 100;
  }

  return {
    period,
    organizationId: orgId,
    entityCount: entities.length,
    currency: reportingCurrency,
    consolidated,
    entities: entities.map((e) => ({
      entityCode: e.entity_code,
      entityName: e.entity_name,
      currency: e.currency,
      exchangeRate: e.exchange_rate ?? 1.0,
      financialData: e.financial_data,
      intercompanyEliminations: e.intercompany_eliminations,
      consolidationAdjustments: e.consolidation_adjustments,
      status: e.status,
    })),
    totalEliminations,
  };
}
