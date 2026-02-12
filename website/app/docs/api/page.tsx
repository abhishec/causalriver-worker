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
    </div>
  );
}
