import type { Metadata } from "next";
import { CodeBlock } from "@/components/shared/CodeBlock";

export const metadata: Metadata = {
  title: "API Reference",
};

const endpoints = [
  {
    name: "nexus-query",
    method: "POST",
    path: "/functions/v1/nexus-query",
    description: "Copilot queries with causal evidence. Takes a natural language question and returns an AI-powered answer with statistical backing from the causal graph.",
    body: `{
  "query": "Why is churn increasing?",
  "organizationId": "org_123",
  "domain": "cs"       // optional: filter by domain
}`,
    response: `{
  "answer": "Churn is increasing due to payment delays...",
  "causalEvidence": [...],
  "confidence": 0.85,
  "sources": [...]
}`,
  },
  {
    name: "nexus-ingest",
    method: "POST",
    path: "/functions/v1/nexus-ingest",
    description: "Signal ingestion from any source. Batch up to 500 signals per request. Signals are entity-resolved, embedded, and published to the event bus.",
    body: `{
  "organizationId": "org_123",
  "signals": [
    {
      "source_domain": "finance",
      "signal_type": "payment_delay",
      "signal_value": 0.8,
      "entity_id": "client_1",
      "signal_timestamp": "2026-01-15T00:00:00Z"
    }
  ]
}`,
    response: `{
  "ingested": 1,
  "entities_resolved": 1
}`,
  },
  {
    name: "nexus-webhook",
    method: "POST",
    path: "/functions/v1/nexus-webhook",
    description: "Webhook receiver for real-time ingestion from Stripe, HubSpot, Intercom, and Slack. Supports query parameters for source routing.",
    body: `// Query params: ?source=stripe&org=org_123
// Body: raw webhook payload from the source system`,
    response: `{
  "processed": 3,
  "source": "stripe"
}`,
  },
  {
    name: "nexus-copilot",
    method: "POST",
    path: "/functions/v1/nexus-copilot",
    description: "Agentic copilot with complexity routing. Simple questions get fast answers. Complex questions trigger a multi-step investigation with tool use and self-correction. Supports SSE streaming.",
    body: `{
  "query": "Why did revenue drop and how will it cascade?",
  "organizationId": "org_123",
  "stream": true       // optional: SSE streaming
}`,
    response: `// SSE stream with tool use events:
data: {"type": "tool_use", "tool": "query_causal_graph", ...}
data: {"type": "tool_use", "tool": "trace_cascade", ...}
data: {"type": "answer", "content": "Revenue dropped because...", ...}`,
  },
  {
    name: "nexus-cron",
    method: "POST",
    path: "/functions/v1/nexus-cron",
    description: "Scheduled jobs: causal discovery, prediction verification, threshold optimization, evidence decay, brain consolidation. Run daily via pg_cron or manual trigger.",
    body: `{
  "organizationId": "org_123",
  "jobs": ["discover", "verify", "optimize", "decay"]
}`,
    response: `{
  "completed": ["discover", "verify", "optimize", "decay"],
  "edges_discovered": 12,
  "predictions_verified": 8
}`,
  },
  {
    name: "nexus-seed-core",
    method: "POST",
    path: "/functions/v1/nexus-seed-core",
    description: "Core brain initialization. Pre-loads universal knowledge: macro-economic patterns, tech industry signals, business case studies. Run once during setup.",
    body: `{
  "packs": ["macro-economic", "tech-industry", "business-cases"]
}`,
    response: `{
  "seeded": true,
  "packs_loaded": 3,
  "signals_created": 450
}`,
  },
];

export default function APIPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">API Reference</h1>
      <p className="mb-8 text-lg text-muted">
        6 Supabase Edge Functions provide the REST API. All endpoints require a Supabase anon key in the Authorization header.
      </p>

      <CodeBlock
        code={`// All requests require this header:
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json

// Base URL:
https://your-project.supabase.co/functions/v1/`}
        language="bash"
        filename="authentication"
      />

      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-xl font-bold">Rate Limits & Performance SLAs</h2>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-4 border-b border-border pb-2 font-semibold">
            <div>Endpoint</div>
            <div>Rate Limit</div>
            <div>Typical Latency</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono text-xs">nexus-query</div>
            <div className="text-muted">100 req/min</div>
            <div className="text-muted">800-1200ms (w/ causal search)</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono text-xs">nexus-ingest</div>
            <div className="text-muted">500 req/min (max 500 signals/batch)</div>
            <div className="text-muted">150-300ms per batch</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono text-xs">nexus-webhook</div>
            <div className="text-muted">1000 req/min</div>
            <div className="text-muted">50-150ms</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono text-xs">nexus-copilot</div>
            <div className="text-muted">50 req/min (complex queries)</div>
            <div className="text-muted">2-5s (streaming)</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono text-xs">nexus-cron</div>
            <div className="text-muted">10 req/hour</div>
            <div className="text-muted">5-30s (depends on data volume)</div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-mono text-xs">nexus-seed-core</div>
            <div className="text-muted">1 req/day</div>
            <div className="text-muted">1-3s</div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          Rate limits are per organization ID. Contact support for enterprise limits.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-xl font-bold">HTTP Status Codes & Error Handling</h2>
        <div className="space-y-3 text-sm">
          <div className="flex gap-4">
            <code className="rounded bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-400">200</code>
            <div>
              <div className="font-semibold">Success</div>
              <div className="text-muted">Request completed successfully</div>
            </div>
          </div>
          <div className="flex gap-4">
            <code className="rounded bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-400">400</code>
            <div>
              <div className="font-semibold">Bad Request</div>
              <div className="text-muted">Invalid request body, missing required fields, or malformed JSON</div>
            </div>
          </div>
          <div className="flex gap-4">
            <code className="rounded bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-400">401</code>
            <div>
              <div className="font-semibold">Unauthorized</div>
              <div className="text-muted">Missing or invalid Authorization header (check SUPABASE_ANON_KEY)</div>
            </div>
          </div>
          <div className="flex gap-4">
            <code className="rounded bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-400">403</code>
            <div>
              <div className="font-semibold">Forbidden</div>
              <div className="text-muted">Valid auth but insufficient permissions for the organization</div>
            </div>
          </div>
          <div className="flex gap-4">
            <code className="rounded bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-400">429</code>
            <div>
              <div className="font-semibold">Rate Limited</div>
              <div className="text-muted">Too many requests. Retry after delay (see Retry-After header)</div>
            </div>
          </div>
          <div className="flex gap-4">
            <code className="rounded bg-red-400/10 px-2 py-1 text-xs font-bold text-red-400">500</code>
            <div>
              <div className="font-semibold">Internal Server Error</div>
              <div className="text-muted">Unexpected error. Check logs and contact support if persistent</div>
            </div>
          </div>
          <div className="flex gap-4">
            <code className="rounded bg-red-400/10 px-2 py-1 text-xs font-bold text-red-400">503</code>
            <div>
              <div className="font-semibold">Service Unavailable</div>
              <div className="text-muted">Temporary outage or maintenance. Retry with exponential backoff</div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold">Error Response Format</h3>
          <CodeBlock
            code={`{
  "error": {
    "code": "INVALID_ORGANIZATION_ID",
    "message": "Organization ID 'org_123' not found",
    "details": {
      "field": "organizationId",
      "received": "org_123"
    }
  }
}`}
            language="json"
          />
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold">Retry Strategy (Recommended)</h3>
          <CodeBlock
            code={`// Exponential backoff with jitter
async function callWithRetry(endpoint, body, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${SUPABASE_ANON_KEY}\`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) return await res.json();

      // Don't retry client errors (4xx except 429)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(\`Client error: \${res.status}\`);
      }

      // Exponential backoff: 1s, 2s, 4s with jitter
      const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (err) {
      if (i === maxRetries - 1) throw err;
    }
  }
}`}
            language="typescript"
            filename="retry-strategy.ts"
          />
        </div>
      </div>

      <div className="mt-12 space-y-12">
        {endpoints.map((ep) => (
          <div key={ep.name} id={ep.name} className="rounded-xl border border-border bg-surface p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-400">
                {ep.method}
              </span>
              <code className="text-sm font-mono text-zinc-300">{ep.path}</code>
            </div>
            <p className="mb-6 text-sm text-muted">{ep.description}</p>

            <h4 className="mb-2 text-sm font-semibold text-foreground">Request Body</h4>
            <CodeBlock code={ep.body} language="json" />

            <h4 className="mb-2 mt-4 text-sm font-semibold text-foreground">Response</h4>
            <CodeBlock code={ep.response} language="json" />
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-xl font-bold">Webhook Reliability & Idempotency</h2>

        <div className="mb-6 space-y-4 text-sm">
          <div>
            <h3 className="mb-2 font-semibold">Idempotency Guarantees</h3>
            <p className="text-muted">
              The <code className="rounded bg-muted px-1 text-xs">nexus-webhook</code> endpoint is <strong>idempotent</strong> — duplicate webhook deliveries are automatically deduplicated using event IDs. Safe to retry without creating duplicate signals.
            </p>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Event Deduplication</h3>
            <ul className="ml-4 list-disc space-y-1 text-muted">
              <li>Stripe: Uses <code className="text-xs">event.id</code> for deduplication (24-hour window)</li>
              <li>HubSpot: Uses <code className="text-xs">objectId + timestamp</code> combination</li>
              <li>Intercom: Uses <code className="text-xs">conversation.id + updated_at</code></li>
              <li>Slack: Uses <code className="text-xs">event_ts + channel</code> combination</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Webhook Verification</h3>
            <p className="text-muted mb-2">
              All webhook sources are cryptographically verified before processing:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-muted">
              <li>Stripe: HMAC-SHA256 signature verification using webhook secret</li>
              <li>HubSpot: X-HubSpot-Signature v3 validation</li>
              <li>Intercom: X-Hub-Signature HMAC verification</li>
              <li>Slack: Request signature validation with timestamp check</li>
            </ul>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold">Webhook Retry Configuration (Source Systems)</h3>
          <CodeBlock
            code={`// Stripe automatic retry schedule:
// - Immediately
// - 1 hour later
// - 3 hours later (if still failing)
// - Stops after 3 days

// HubSpot retry behavior:
// - Up to 10 retry attempts
// - Exponential backoff (1min → 10min → 1hr)

// Best Practice: Always return 200 OK quickly
// Process webhook asynchronously to avoid timeouts`}
            language="javascript"
          />
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">Implementing Webhook Receiver (Self-Hosted)</h3>
          <CodeBlock
            code={`import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  // 1. Verify webhook signature
  const isValid = crypto
    .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex') === signature;

  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);

  // 2. Check for duplicate using event ID (idempotency)
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('external_event_id', event.id)
    .single();

  if (existing) {
    console.log('Duplicate webhook ignored:', event.id);
    return new Response('OK', { status: 200 }); // Return 200 to prevent retry
  }

  // 3. Store event to prevent future duplicates
  await supabase.from('webhook_events').insert({
    external_event_id: event.id,
    source: 'stripe',
    event_type: event.type,
    received_at: new Date().toISOString()
  });

  // 4. Process webhook asynchronously (queue recommended)
  await fetch(\`\${process.env.SUPABASE_URL}/functions/v1/nexus-webhook\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.SUPABASE_ANON_KEY}\`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source: 'stripe',
      organizationId: 'org_123',
      event: event
    })
  });

  // 5. Always return 200 OK quickly (< 5 seconds)
  return new Response('OK', { status: 200 });
}`}
            language="typescript"
            filename="webhook-receiver.ts"
          />
        </div>

        <div className="mt-6 rounded-lg bg-amber-400/5 p-4 text-sm">
          <div className="mb-1 font-semibold text-amber-400">⚠️ Important: Webhook Timeout Requirements</div>
          <ul className="ml-4 list-disc space-y-1 text-muted">
            <li>Stripe requires response within <strong>5 seconds</strong></li>
            <li>HubSpot requires response within <strong>30 seconds</strong></li>
            <li>Always return 200 OK immediately, process asynchronously</li>
            <li>Use job queues (BullMQ, Inngest) for heavy processing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
