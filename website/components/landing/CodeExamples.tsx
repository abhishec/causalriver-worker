"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CodeBlock } from "@/components/shared/CodeBlock";

const examples = [
  {
    label: "Causal Discovery",
    code: `import { runCausalDiscovery, summarizeDiscovery } from '@nexus-ai/memory-stack';

const signals = [
  { source_domain: 'finance', signal_type: 'payment_delay', signal_value: 0.8, signal_timestamp: '2026-01-01' },
  { source_domain: 'cs', signal_type: 'ticket_volume', signal_value: 45, signal_timestamp: '2026-01-10' },
  // ... more signals over time
];

const result = runCausalDiscovery(signals, 'my-org');
console.log(summarizeDiscovery(result));
// "finance -> cs: Payment delays predict support escalations (F=4.2, p=0.003, lag=7 days)"`,
    filename: "causal-discovery.ts",
  },
  {
    label: "Anomaly Detection",
    code: `import { detectAnomalies } from '@nexus-ai/memory-stack';

const metrics = [100, 102, 98, 105, 101, 250, 99, 103];
const anomalies = detectAnomalies(metrics, { method: 'zscore', threshold: 2.0 });

console.log(anomalies);
// [{ index: 5, value: 250, zscore: 3.2, isAnomaly: true }]

// Three methods: 'zscore', 'iqr' (interquartile range), 'mad' (median absolute deviation)`,
    filename: "anomaly-detection.ts",
  },
  {
    label: "React Hooks",
    code: `import {
  useAIMemory,
  useSemanticSearch,
  useRAGContext,
  useCascadeDetection,
} from '@nexus-ai/memory-stack/hooks';

function InsightsDashboard() {
  const { memories, loading } = useAIMemory(supabase, 'org_123', 'finance');
  const { results } = useSemanticSearch(supabase, 'org_123', 'churn risk factors');
  const { context } = useRAGContext(supabase, 'org_123', 'Why is churn spiking?');
  const { cascades } = useCascadeDetection(supabase, 'org_123', 'finance');
}`,
    filename: "react-hooks.tsx",
  },
  {
    label: "Full Pipeline",
    code: `import { createEventBus, wireNexusBridges } from '@nexus-ai/memory-stack';

// Create event bus (the spine)
const eventBus = createEventBus({ debounceMs: 100, batchSize: 50 });

// Wire all 5 bridges: signal->causal, causal->pattern, pattern->agent, outcome->feedback
const bridges = wireNexusBridges(eventBus);

// Signals automatically flow through the entire pipeline:
// Signal In -> Event Bus -> Causal Discovery -> Pattern Learning -> Agent Context -> Feedback
bridges.signalBridge.onSignalsCollected([{
  source_domain: 'finance',
  signal_type: 'payment_delay',
  signal_value: 0.8,
  entity_id: 'client_1',
}]);`,
    filename: "full-pipeline.ts",
  },
  {
    label: "Agent Toolkit",
    code: `import { createNexusOrchestrator } from '@nexus-ai/memory-stack';
import { createDomainRouter, buildCompletePrompt, getPersona } from '@nexus-ai/domain-agents';

const nexus = createNexusOrchestrator({ organizationId: 'org_123', supabase });
const router = createDomainRouter();

async function handleQuery(userQuery: string) {
  const route = router.route(userQuery);           // Route to right domain
  const persona = getPersona(route.persona);       // Get executive persona
  const context = await nexus.query(userQuery);    // Get causal evidence

  const prompt = buildCompletePrompt(persona, {
    query: userQuery,
    organizationName: 'Acme Corp',
    moduleName: route.primaryModule,
    additionalContext: context.formattedPrompt,     // Inject causal context
  });

  return await callLLM(prompt);
}`,
    filename: "agent-toolkit.ts",
  },
];

export function CodeExamples() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section className="py-24" id="examples">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-3xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Developer Experience
          </h2>
          <p className="text-lg text-muted">
            Clean TypeScript APIs. Tree-shakeable imports. Works in Node.js, Deno, Bun, browsers, and edge runtimes.
          </p>
        </motion.div>

        <div className="mx-auto max-w-4xl">
          {/* Tabs */}
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
            {examples.map((ex, i) => (
              <button
                key={ex.label}
                onClick={() => setActiveTab(i)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === i
                    ? "bg-accent text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <CodeBlock
            code={examples[activeTab].code}
            language="typescript"
            filename={examples[activeTab].filename}
          />
        </div>
      </div>
    </section>
  );
}
