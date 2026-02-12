import type { Metadata } from "next";
import { CONNECTORS } from "@/lib/constants";
import { CodeBlock } from "@/components/shared/CodeBlock";

export const metadata: Metadata = {
  title: "Connectors",
};

export default function ConnectorsPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Connectors</h1>
      <p className="mb-8 text-lg text-muted">
        13 built-in connectors pull signals from your business tools. Each connector supports full sync, incremental sync, and real-time webhooks.
      </p>

      <h2 className="mb-4 mt-8 text-2xl font-semibold">Available Connectors</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {CONNECTORS.map((c) => (
          <div key={c.name} className="rounded-xl border border-border bg-surface p-4 text-center">
            <span className="text-2xl">{c.icon}</span>
            <p className="mt-1 text-sm font-medium">{c.name}</p>
            <p className="text-xs text-muted">{c.domain}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Stripe Connector</h2>
      <CodeBlock
        code={`import { createStripeConnector } from '@nexus-ai/memory-stack';

const stripe = createStripeConnector(process.env.STRIPE_API_KEY!);

// Full sync — pulls all historical data
await stripe.fullSync(supabase, 'org_123');

// Incremental sync — only new data since last sync
await stripe.incrementalSync(supabase, 'org_123', lastSyncDate);

// Real-time — handle Stripe webhooks
const signals = stripe.handleWebhook(stripeWebhookPayload);
// Generates: payment_success, payment_failed, subscription_mrr, churn_risk`}
        language="typescript"
        filename="stripe-connector.ts"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">HubSpot Connector</h2>
      <CodeBlock
        code={`import { createHubSpotConnector } from '@nexus-ai/memory-stack';

const hubspot = createHubSpotConnector(process.env.HUBSPOT_API_KEY!);
await hubspot.fullSync(supabase, 'org_123');
// Generates: deal_stage, deal_amount, deal_probability`}
        language="typescript"
        filename="hubspot-connector.ts"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Build Custom Connectors</h2>
      <CodeBlock
        code={`import type { NexusConnector } from '@nexus-ai/memory-stack';

const myConnector: NexusConnector = {
  name: 'my-crm',
  domain: 'sales',

  async fullSync(supabase, orgId) {
    const data = await fetchFromMyCRM();
    const signals = data.map(item => ({
      source_domain: 'sales',
      signal_type: 'deal_closed',
      signal_value: item.amount,
      entity_id: item.customerId,
      signal_timestamp: item.closedAt,
    }));
    await storeConnectorSignals(supabase, orgId, signals);
    return { signalCount: signals.length };
  },

  async incrementalSync(supabase, orgId, since) {
    // Same as fullSync but filtered by date
  },

  handleWebhook(payload) {
    return [/* signals */];
  },
};`}
        language="typescript"
        filename="custom-connector.ts"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Webhook Receiver</h2>
      <p className="mb-4 text-muted">
        Deploy the <code className="rounded bg-surface px-1.5 py-0.5 text-sm font-mono text-emerald-400">nexus-webhook</code> edge function for real-time ingestion:
      </p>
      <CodeBlock
        code={`POST https://your-project.supabase.co/functions/v1/nexus-webhook?source=stripe&org=org_123

# Stripe sends webhooks here automatically.
# Supported sources: stripe, hubspot, intercom, slack`}
        language="bash"
        filename="webhook-endpoint"
      />
    </div>
  );
}
