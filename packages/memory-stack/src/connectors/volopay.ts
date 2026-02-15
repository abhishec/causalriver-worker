/**
 * Volopay Connector
 *
 * Syncs corporate card and expense management data from Volopay:
 *   - Card Transactions: card_transaction, card_declined
 *   - Expense Reports: expense_submitted, expense_approved, expense_rejected
 *   - Reimbursements: reimbursement_processed, reimbursement_pending
 *   - Budget Utilization: budget_utilized, budget_exceeded
 *   - Virtual Cards: virtual_card_created, virtual_card_frozen
 *
 * Design Partner 2 — Payment/expense data at 10M+ scale.
 *
 * Volopay API: https://docs.volopay.com
 * Auth: API Key + Bearer Token
 * Rate Limit: Varies by endpoint (typically 100 req/min)
 *
 * @example
 * ```typescript
 * const volopay = createVolopayConnector({
 *   apiKey: 'xxx',
 *   baseUrl: 'https://api.volopay.com/v1',
 * });
 *
 * const results = await volopay.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface VolopayConnectorConfig {
  /** Volopay API key */
  apiKey: string;
  /** Base URL (default: https://api.volopay.com/v1) */
  baseUrl?: string;
  /** Bearer token (if using OAuth2) */
  bearerToken?: string;
  /** Max pages per sync (default: 200) */
  maxPages?: number;
  /** Rate limit delay between pages in ms (default: 100ms) */
  pageDelayMs?: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Volopay expense management connector.
 */
export function createVolopayConnector(config: VolopayConnectorConfig): NexusConnector {
  const baseUrl = config.baseUrl || 'https://api.volopay.com/v1';
  const maxPages = config.maxPages ?? 200;
  const pageDelayMs = config.pageDelayMs ?? 100;

  // ── API Helpers ─────────────────────────────────────────────────

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (config.bearerToken) {
      h.Authorization = `Bearer ${config.bearerToken}`;
    } else {
      h['X-API-Key'] = config.apiKey;
    }
    return h;
  }

  async function fetchPaginated(
    endpoint: string,
    recordsKey: string,
    since?: Date
  ): Promise<any[]> {
    const allRecords: any[] = [];
    let page = 1;
    const PAGE_SIZE = 100;

    while (page <= maxPages) {
      let url = `${baseUrl}/${endpoint}?page=${page}&per_page=${PAGE_SIZE}`;
      if (since) {
        url += `&updated_after=${since.toISOString()}`;
      }

      const response = await fetch(url, { headers: headers() });

      if (!response.ok) {
        if (response.status === 429) {
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        throw new Error(`Volopay API error ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as any;
      const records = data[recordsKey] || data.data || [];
      allRecords.push(...records);

      if (records.length < PAGE_SIZE) break;
      page++;

      if (pageDelayMs > 0) {
        await new Promise((r) => setTimeout(r, pageDelayMs));
      }
    }

    return allRecords;
  }

  // ── Signal Transformers ─────────────────────────────────────────

  function transactionsToSignals(
    transactions: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const txn of transactions) {
      const amount = txn.amount || txn.billing_amount || 0;
      const isDeclined = txn.status === 'declined' || txn.status === 'failed';

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: isDeclined ? 'card_declined' : 'card_transaction',
        signal_value: isDeclined ? -amount : amount,
        entity_type: 'volopay_transaction',
        entity_id: txn.id || txn.transaction_id,
        client_id: txn.cardholder_id || txn.user_id,
        signal_timestamp: txn.created_at || txn.transaction_date,
        metadata: {
          merchant: txn.merchant_name || txn.merchant,
          category: txn.category || txn.merchant_category,
          card_last_four: txn.card_last_four,
          currency: txn.currency,
          status: txn.status,
          department: txn.department,
          cost_center: txn.cost_center,
          receipt_attached: txn.receipt_url ? true : false,
        },
      });
    }

    return signals;
  }

  function expensesToSignals(
    expenses: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const exp of expenses) {
      const amount = exp.amount || 0;
      const statusMap: Record<string, string> = {
        submitted: 'expense_submitted',
        approved: 'expense_approved',
        rejected: 'expense_rejected',
        reimbursed: 'reimbursement_processed',
        pending: 'expense_submitted',
      };

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: statusMap[exp.status] || 'expense_submitted',
        signal_value: amount,
        entity_type: 'volopay_expense',
        entity_id: exp.id || exp.expense_id,
        client_id: exp.employee_id || exp.user_id,
        signal_timestamp: exp.updated_at || exp.created_at,
        metadata: {
          category: exp.category,
          description: (exp.description || '').substring(0, 200),
          status: exp.status,
          department: exp.department,
          policy_name: exp.policy_name,
          approver: exp.approver_name,
          receipt_count: exp.receipts?.length || 0,
        },
      });
    }

    return signals;
  }

  function budgetsToSignals(
    budgets: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const budget of budgets) {
      const limit = budget.limit || budget.budget_limit || 0;
      const spent = budget.spent || budget.total_spent || 0;
      const utilization = limit > 0 ? spent / limit : 0;
      const isExceeded = utilization > 1.0;

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: isExceeded ? 'budget_exceeded' : 'budget_utilized',
        signal_value: utilization,
        entity_type: 'volopay_budget',
        entity_id: budget.id || budget.budget_id,
        metadata: {
          name: budget.name || budget.budget_name,
          department: budget.department,
          limit_amount: limit,
          spent_amount: spent,
          remaining: Math.max(0, limit - spent),
          utilization_pct: Math.round(utilization * 100),
          period: budget.period || 'monthly',
          currency: budget.currency,
        },
      });
    }

    return signals;
  }

  function cardsToSignals(
    cards: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const card of cards) {
      const isFrozen = card.status === 'frozen' || card.status === 'blocked';

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: isFrozen ? 'virtual_card_frozen' : 'virtual_card_created',
        signal_value: card.limit || card.card_limit || 0,
        entity_type: 'volopay_card',
        entity_id: card.id || card.card_id,
        client_id: card.cardholder_id || card.user_id,
        metadata: {
          card_type: card.type || card.card_type, // virtual, physical
          last_four: card.last_four,
          status: card.status,
          cardholder: card.cardholder_name,
          department: card.department,
          spent_amount: card.spent || card.total_spent || 0,
        },
      });
    }

    return signals;
  }

  // ── Connector Implementation ────────────────────────────────────

  return {
    id: 'volopay',
    name: 'Volopay Expense Management',
    domain: 'finance',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];

      try {
        const [transactions, expenses, budgets, cards] = await Promise.all([
          fetchPaginated('transactions', 'transactions').catch((e) => {
            errors.push(`Transactions: ${e.message}`);
            return [];
          }),
          fetchPaginated('expenses', 'expenses').catch((e) => {
            errors.push(`Expenses: ${e.message}`);
            return [];
          }),
          fetchPaginated('budgets', 'budgets').catch((e) => {
            errors.push(`Budgets: ${e.message}`);
            return [];
          }),
          fetchPaginated('cards', 'cards').catch((e) => {
            errors.push(`Cards: ${e.message}`);
            return [];
          }),
        ]);

        const totalRecords = transactions.length + expenses.length + budgets.length + cards.length;

        const allSignals: ConnectorSignal[] = [
          ...transactionsToSignals(transactions, organizationId),
          ...expensesToSignals(expenses, organizationId),
          ...budgetsToSignals(budgets, organizationId),
          ...cardsToSignals(cards, organizationId),
        ];

        if (allSignals.length > 0) {
          await storeConnectorSignals(supabase, allSignals);
        }

        const result: ConnectorSyncResult = {
          success: errors.length === 0,
          signalsGenerated: allSignals.length,
          recordsProcessed: totalRecords,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'volopay', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [...errors, err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];

      try {
        const [transactions, expenses] = await Promise.all([
          fetchPaginated('transactions', 'transactions', since).catch((e) => {
            errors.push(`Transactions: ${e.message}`);
            return [];
          }),
          fetchPaginated('expenses', 'expenses', since).catch((e) => {
            errors.push(`Expenses: ${e.message}`);
            return [];
          }),
        ]);

        const allSignals: ConnectorSignal[] = [
          ...transactionsToSignals(transactions, organizationId),
          ...expensesToSignals(expenses, organizationId),
        ];

        if (allSignals.length > 0) {
          await storeConnectorSignals(supabase, allSignals);
        }

        const result: ConnectorSyncResult = {
          success: errors.length === 0,
          signalsGenerated: allSignals.length,
          recordsProcessed: transactions.length + expenses.length,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'volopay', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [...errors, err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      const event = payload as any;
      if (!event?.type) return [];

      const signals: ConnectorSignal[] = [];
      const data = event.data || {};

      switch (event.type) {
        case 'transaction.created':
        case 'transaction.updated':
          return transactionsToSignals([data], '');

        case 'expense.submitted':
        case 'expense.approved':
        case 'expense.rejected':
          return expensesToSignals([{ ...data, status: event.type.split('.')[1] }], '');

        default:
          return signals;
      }
    },
  };
}
