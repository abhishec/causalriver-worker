import type { Metadata } from "next";
import { CodeBlock } from "@/components/shared/CodeBlock";

export const metadata: Metadata = {
  title: "Quickstart",
};

export default function QuickstartPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Quickstart</h1>
      <p className="mb-8 text-lg text-muted">
        Get up and running with NexusBrain in 5 minutes. Start with zero dependencies &mdash; no database, no API keys, no network calls.
      </p>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Install</h2>
      <CodeBlock code="pnpm add @nexus-ai/memory-stack" language="bash" filename="terminal" />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">1. Discover Causation</h2>
      <p className="mb-4 text-muted">
        Find what causes what in your data. Uses the calibrated ensemble (8 methods) by default. No API keys needed.
      </p>
      <CodeBlock
        code={`import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

// Your signals — from any source (CSV, API, database, etc.)
const signals = [
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.8, signal_timestamp: '2026-01-01' },
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.9, signal_timestamp: '2026-01-08' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 45, signal_timestamp: '2026-01-10' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 78, signal_timestamp: '2026-01-17' },
  // ... more signals over time
];

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays predict support escalations (F=4.2, p=0.003, lag=7 days)"`}
        language="typescript"
        filename="causal-discovery.ts"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">2. Detect Anomalies</h2>
      <p className="mb-4 text-muted">
        Spot outliers using Z-score, IQR, or MAD methods. Zero dependencies.
      </p>
      <CodeBlock
        code={`import { detectAnomalies } from '@nexus-ai/memory-stack';

const metrics = [100, 102, 98, 105, 101, 250, 99, 103];
const anomalies = detectAnomalies(metrics, { method: 'zscore', threshold: 2.0 });

console.log(anomalies);
// [{ index: 5, value: 250, zscore: 3.2, isAnomaly: true }]`}
        language="typescript"
        filename="anomaly-detection.ts"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">3. Wire the Full Pipeline</h2>
      <p className="mb-4 text-muted">
        Connect all 7 layers through the event bus. Signals automatically flow through causal discovery, pattern learning, agent context, and feedback.
      </p>
      <CodeBlock
        code={`import { createEventBus, wireNexusBridges } from '@nexus-ai/memory-stack';

const eventBus = createEventBus({ debounceMs: 100, batchSize: 50 });
const bridges = wireNexusBridges(eventBus);

// Signals automatically flow through the entire pipeline
bridges.signalBridge.onSignalsCollected([{
  source_domain: 'finance',
  signal_type: 'payment_delay',
  signal_value: 0.8,
  entity_id: 'client_1',
}]);`}
        language="typescript"
        filename="full-pipeline.ts"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Next Steps</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <a href="/docs/sdk" className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/30">
          <h3 className="mb-1 font-semibold text-foreground">SDK Reference</h3>
          <p className="text-sm text-muted">Full reference for all packages and subpath imports.</p>
        </a>
        <a href="/docs/architecture" className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/30">
          <h3 className="mb-1 font-semibold text-foreground">Architecture</h3>
          <p className="text-sm text-muted">Deep dive into the 7-layer intelligence stack.</p>
        </a>
      </div>
    </div>
  );
}
