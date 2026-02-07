/**
 * Stripe Connector
 *
 * Syncs payment and subscription data from Stripe:
 *   - payment_success / payment_failed: Charge outcomes
 *   - subscription_change: MRR movements
 *   - payment_velocity: Payment frequency patterns
 *   - refund: Refund events
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal } from './connector-framework';
import type { NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

/**
 * Create a Stripe connector
 */
export function createStripeConnector(apiKey: string): NexusConnector {
  const baseUrl = 'https://api.stripe.com/v1';

  async function fetchCharges(since?: Date): Promise<any[]> {
    let url = `${baseUrl}/charges?limit=100`;
    if (since) {
      url += `&created[gte]=${Math.floor(since.getTime() / 1000)}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.data || [];
  }

  async function fetchSubscriptions(since?: Date): Promise<any[]> {
    let url = `${baseUrl}/subscriptions?limit=100&status=all`;
    if (since) {
      url += `&created[gte]=${Math.floor(since.getTime() / 1000)}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.data || [];
  }

  function chargesToSignals(
    charges: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const charge of charges) {
      const amount = (charge.amount || 0) / 100; // cents to dollars
      const customerId = charge.customer;

      // Payment outcome signal
      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: charge.status === 'succeeded' ? 'payment_success' : 'payment_failed',
        signal_value: amount,
        entity_type: 'charge',
        entity_id: charge.id,
        client_id: customerId,
        metadata: {
          currency: charge.currency,
          status: charge.status,
          failure_code: charge.failure_code,
          failure_message: charge.failure_message,
        },
      });

      // Refund signal
      if (charge.refunded && charge.amount_refunded > 0) {
        signals.push({
          organization_id: organizationId,
          source_domain: 'finance',
          signal_type: 'refund',
          signal_value: charge.amount_refunded / 100,
          entity_type: 'charge',
          entity_id: charge.id,
          client_id: customerId,
          metadata: {
            original_amount: amount,
            refund_reason: charge.refunds?.data?.[0]?.reason,
          },
        });
      }
    }

    return signals;
  }

  function subscriptionsToSignals(
    subscriptions: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const sub of subscriptions) {
      const mrr = (sub.items?.data?.[0]?.price?.unit_amount || 0) / 100;
      const customerId = sub.customer;

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: 'subscription_mrr',
        signal_value: mrr,
        entity_type: 'subscription',
        entity_id: sub.id,
        client_id: customerId,
        metadata: {
          status: sub.status,
          interval: sub.items?.data?.[0]?.price?.recurring?.interval,
          cancel_at_period_end: sub.cancel_at_period_end,
        },
      });

      // Churn risk signal
      if (sub.cancel_at_period_end || sub.status === 'past_due') {
        signals.push({
          organization_id: organizationId,
          source_domain: 'finance',
          signal_type: 'churn_risk',
          signal_value: sub.status === 'past_due' ? 0.8 : 0.6,
          entity_type: 'subscription',
          entity_id: sub.id,
          client_id: customerId,
          metadata: {
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            mrr,
          },
        });
      }
    }

    return signals;
  }

  return {
    id: 'stripe',
    name: 'Stripe Payments',
    domain: 'finance',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();

      try {
        const [charges, subscriptions] = await Promise.all([
          fetchCharges(),
          fetchSubscriptions(),
        ]);

        const chargeSignals = chargesToSignals(charges, organizationId);
        const subSignals = subscriptionsToSignals(subscriptions, organizationId);
        const allSignals = [...chargeSignals, ...subSignals];

        await storeConnectorSignals(supabase, allSignals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: allSignals.length,
          recordsProcessed: charges.length + subscriptions.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'stripe', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
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

      try {
        const [charges, subscriptions] = await Promise.all([
          fetchCharges(since),
          fetchSubscriptions(since),
        ]);

        const allSignals = [
          ...chargesToSignals(charges, organizationId),
          ...subscriptionsToSignals(subscriptions, organizationId),
        ];

        await storeConnectorSignals(supabase, allSignals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: allSignals.length,
          recordsProcessed: charges.length + subscriptions.length,
          errors: [],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'stripe', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      const event = payload as any;
      if (!event?.type || !event?.data?.object) return [];

      const obj = event.data.object;

      switch (event.type) {
        case 'charge.succeeded':
          return chargesToSignals([obj], obj.metadata?.organization_id || '');
        case 'charge.failed':
          return chargesToSignals([obj], obj.metadata?.organization_id || '');
        case 'customer.subscription.updated':
          return subscriptionsToSignals(
            [obj],
            obj.metadata?.organization_id || ''
          );
        default:
          return [];
      }
    },
  };
}
