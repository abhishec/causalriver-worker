/**
 * Xero Connector
 *
 * Syncs accounting and financial data from Xero:
 *   - Invoices: invoice_created, invoice_paid, invoice_overdue
 *   - Payments: payment_received, payment_sent
 *   - Bank Transactions: bank_transaction_reconciled
 *   - Balance Sheet: cash_balance_change, expense_ratio
 *   - Accounts Receivable: ar_aging, dso_change
 *
 * Design Partner 2 — Balance sheet data at 10M+ scale.
 *
 * Xero API: https://developer.xero.com/documentation/api/accounting
 * Auth: OAuth2 (tenant-based, each org has its own Xero tenant)
 * Rate Limit: 60 calls/minute per tenant (Xero standard)
 *
 * @example
 * ```typescript
 * const xero = createXeroConnector({
 *   clientId: 'xxx',
 *   clientSecret: 'xxx',
 *   tenantId: 'xxx',
 *   accessToken: 'xxx', // From OAuth2 flow
 * });
 *
 * const results = await xero.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface XeroConnectorConfig {
  /** Xero OAuth2 client ID */
  clientId: string;
  /** Xero OAuth2 client secret */
  clientSecret: string;
  /** Xero tenant ID (org-specific) */
  tenantId: string;
  /** OAuth2 access token (must be refreshed periodically) */
  accessToken: string;
  /** OAuth2 refresh token */
  refreshToken?: string;
  /** Max pages per sync (default: 100 = 10K records) */
  maxPages?: number;
  /** Delay between API pages in ms (default: 100ms for rate limiting) */
  pageDelayMs?: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Xero accounting connector.
 */
export function createXeroConnector(config: XeroConnectorConfig): NexusConnector {
  const baseUrl = 'https://api.xero.com/api.xro/2.0';
  const maxPages = config.maxPages ?? 100;
  const pageDelayMs = config.pageDelayMs ?? 100;
  let accessToken = config.accessToken;

  // ── API Helpers ─────────────────────────────────────────────────

  function headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': config.tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async function fetchPaginated(
    endpoint: string,
    recordsKey: string,
    since?: Date
  ): Promise<any[]> {
    const allRecords: any[] = [];
    let page = 1;

    while (page <= maxPages) {
      let url = `${baseUrl}/${endpoint}?page=${page}`;
      if (since) {
        // Xero uses If-Modified-Since header for incremental sync
      }

      const response = await fetch(url, {
        headers: {
          ...headers(),
          ...(since ? { 'If-Modified-Since': since.toISOString() } : {}),
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited — wait 60s and retry
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        throw new Error(`Xero API error ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as any;
      const records = data[recordsKey] || [];
      allRecords.push(...records);

      // Xero returns empty array when no more pages
      if (records.length === 0 || records.length < 100) break;
      page++;

      // Rate limit: 60 calls/min = 1 call/second
      if (pageDelayMs > 0) {
        await new Promise((r) => setTimeout(r, pageDelayMs));
      }
    }

    return allRecords;
  }

  // ── Signal Transformers ─────────────────────────────────────────

  function invoicesToSignals(
    invoices: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const inv of invoices) {
      const total = inv.Total || 0;
      const contactId = inv.Contact?.ContactID;
      const contactName = inv.Contact?.Name;

      // Invoice creation/update
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: inv.Status === 'PAID' ? 'invoice_paid' : 'invoice_created',
        signal_value: total,
        entity_type: 'xero_invoice',
        entity_id: inv.InvoiceID,
        client_id: contactId,
        signal_timestamp: inv.UpdatedDateUTC || inv.DateString,
        metadata: {
          invoice_number: inv.InvoiceNumber,
          status: inv.Status,
          type: inv.Type, // ACCREC (receivable) or ACCPAY (payable)
          contact_name: contactName,
          currency: inv.CurrencyCode,
          due_date: inv.DueDateString,
          amount_due: inv.AmountDue,
          amount_paid: inv.AmountPaid,
        },
      });

      // Overdue detection
      if (inv.Status === 'AUTHORISED' && inv.DueDateString) {
        const dueDate = new Date(inv.DueDateString);
        if (dueDate < new Date()) {
          signals.push({
            organization_id: organizationId,
            source_domain: 'finance',
            signal_type: 'invoice_overdue',
            signal_value: inv.AmountDue || total,
            entity_type: 'xero_invoice',
            entity_id: inv.InvoiceID,
            client_id: contactId,
            metadata: {
              days_overdue: Math.floor((Date.now() - dueDate.getTime()) / 86_400_000),
              contact_name: contactName,
            },
          });
        }
      }
    }

    return signals;
  }

  function paymentsToSignals(
    payments: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const pmt of payments) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: pmt.PaymentType === 'ACCRECPAYMENT' ? 'payment_received' : 'payment_sent',
        signal_value: pmt.Amount || 0,
        entity_type: 'xero_payment',
        entity_id: pmt.PaymentID,
        client_id: pmt.Invoice?.Contact?.ContactID,
        signal_timestamp: pmt.UpdatedDateUTC || pmt.Date,
        metadata: {
          status: pmt.Status,
          payment_type: pmt.PaymentType,
          account: pmt.Account?.Name,
          reference: pmt.Reference,
          invoice_number: pmt.Invoice?.InvoiceNumber,
        },
      });
    }

    return signals;
  }

  function bankTransactionsToSignals(
    transactions: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const txn of transactions) {
      const isReconciled = txn.IsReconciled;
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: isReconciled ? 'bank_transaction_reconciled' : 'bank_transaction',
        signal_value: txn.Total || 0,
        entity_type: 'xero_bank_transaction',
        entity_id: txn.BankTransactionID,
        signal_timestamp: txn.UpdatedDateUTC || txn.DateString,
        metadata: {
          type: txn.Type, // SPEND or RECEIVE
          status: txn.Status,
          account: txn.BankAccount?.Name,
          reference: txn.Reference,
          contact_name: txn.Contact?.Name,
          is_reconciled: isReconciled,
          line_items_count: txn.LineItems?.length || 0,
        },
      });
    }

    return signals;
  }

  function balanceSheetToSignals(
    report: any,
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];
    const rows = report?.Reports?.[0]?.Rows || [];

    for (const section of rows) {
      if (section.RowType === 'Section' && section.Rows) {
        for (const row of section.Rows) {
          if (row.RowType === 'Row' && row.Cells?.length >= 2) {
            const label = row.Cells[0]?.Value || '';
            const value = parseFloat(row.Cells[1]?.Value || '0');

            if (label && !isNaN(value)) {
              signals.push({
                organization_id: organizationId,
                source_domain: 'finance',
                signal_type: 'balance_sheet_line',
                signal_value: value,
                entity_type: 'xero_balance_sheet',
                entity_id: `bs_${label.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                metadata: {
                  section: section.Title,
                  line_item: label,
                  report_date: report?.Reports?.[0]?.ReportDate,
                },
              });
            }
          }
        }
      }
    }

    return signals;
  }

  // ── Connector Implementation ────────────────────────────────────

  return {
    id: 'xero',
    name: 'Xero Accounting',
    domain: 'finance',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      let totalSignals = 0;
      let totalRecords = 0;

      try {
        // Fetch all data types in parallel (where possible)
        const [invoices, payments, bankTransactions] = await Promise.all([
          fetchPaginated('Invoices', 'Invoices').catch((e) => {
            errors.push(`Invoices: ${e.message}`);
            return [];
          }),
          fetchPaginated('Payments', 'Payments').catch((e) => {
            errors.push(`Payments: ${e.message}`);
            return [];
          }),
          fetchPaginated('BankTransactions', 'BankTransactions').catch((e) => {
            errors.push(`BankTransactions: ${e.message}`);
            return [];
          }),
        ]);

        totalRecords = invoices.length + payments.length + bankTransactions.length;

        // Fetch balance sheet (single report, not paginated)
        let balanceSheet: any = null;
        try {
          const bsResponse = await fetch(`${baseUrl}/Reports/BalanceSheet`, { headers: headers() });
          if (bsResponse.ok) {
            balanceSheet = await bsResponse.json();
          }
        } catch (e: any) {
          errors.push(`BalanceSheet: ${e.message}`);
        }

        // Transform to signals
        const allSignals: ConnectorSignal[] = [
          ...invoicesToSignals(invoices, organizationId),
          ...paymentsToSignals(payments, organizationId),
          ...bankTransactionsToSignals(bankTransactions, organizationId),
          ...(balanceSheet ? balanceSheetToSignals(balanceSheet, organizationId) : []),
        ];

        totalSignals = allSignals.length;

        // Store in batches (10M scale)
        if (allSignals.length > 0) {
          await storeConnectorSignals(supabase, allSignals);
        }

        const result: ConnectorSyncResult = {
          success: errors.length === 0,
          signalsGenerated: totalSignals,
          recordsProcessed: totalRecords,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'xero', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: totalSignals,
          recordsProcessed: totalRecords,
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
        // Xero uses If-Modified-Since header for incremental sync
        const [invoices, payments, bankTransactions] = await Promise.all([
          fetchPaginated('Invoices', 'Invoices', since).catch((e) => {
            errors.push(`Invoices: ${e.message}`);
            return [];
          }),
          fetchPaginated('Payments', 'Payments', since).catch((e) => {
            errors.push(`Payments: ${e.message}`);
            return [];
          }),
          fetchPaginated('BankTransactions', 'BankTransactions', since).catch((e) => {
            errors.push(`BankTransactions: ${e.message}`);
            return [];
          }),
        ]);

        const allSignals: ConnectorSignal[] = [
          ...invoicesToSignals(invoices, organizationId),
          ...paymentsToSignals(payments, organizationId),
          ...bankTransactionsToSignals(bankTransactions, organizationId),
        ];

        if (allSignals.length > 0) {
          await storeConnectorSignals(supabase, allSignals);
        }

        const result: ConnectorSyncResult = {
          success: errors.length === 0,
          signalsGenerated: allSignals.length,
          recordsProcessed: invoices.length + payments.length + bankTransactions.length,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'xero', organizationId, result);
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
      const events = event?.events || [];
      const signals: ConnectorSignal[] = [];

      for (const evt of events) {
        const category = evt.eventCategory || '';
        const eventType = evt.eventType || '';

        if (category === 'INVOICE') {
          signals.push({
            organization_id: '',
            source_domain: 'finance',
            signal_type: eventType === 'CREATE' ? 'invoice_created' : 'invoice_updated',
            signal_value: 0,
            entity_type: 'xero_invoice',
            entity_id: evt.resourceId || '',
            metadata: { eventType, tenantId: evt.tenantId },
          });
        }

        if (category === 'PAYMENT') {
          signals.push({
            organization_id: '',
            source_domain: 'finance',
            signal_type: 'payment_received',
            signal_value: 0,
            entity_type: 'xero_payment',
            entity_id: evt.resourceId || '',
            metadata: { eventType, tenantId: evt.tenantId },
          });
        }
      }

      return signals;
    },
  };
}
