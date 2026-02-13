export const metadata = { title: "Integrate" };

const QUICK_STEPS = [
  {
    step: 1,
    title: "Install the SDK",
    code: `npm install @nexusbrain/sdk`,
  },
  {
    step: 2,
    title: "Connect your brain",
    code: `import { NexusBrain } from '@nexusbrain/sdk';

const brain = new NexusBrain({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  organizationId: 'your-org-id',
});`,
  },
  {
    step: 3,
    title: "Feed signals and query",
    code: `// Feed a signal
await brain.signal({
  type: 'customer.churned',
  domain: 'finance',
  entityId: 'cust_123',
  value: 1,
  metadata: { reason: 'pricing', mrr: 299 },
});

// Ask the brain
const answer = await brain.ask(
  'Why are enterprise customers churning?'
);`,
  },
];

const PATTERNS = [
  {
    icon: "\u{1F4E5}",
    title: "Signal Ingestion",
    description: "Push signals from any source. Each signal becomes a node in the causal graph with automatic entity resolution and embedding generation.",
    code: `await brain.signal({
  type: 'deploy.completed',
  domain: 'engineering',
  entityId: 'deploy_456',
  value: 1,
  metadata: {
    service: 'api-gateway',
    duration_ms: 4200,
    commit: 'abc123f',
  },
});`,
  },
  {
    icon: "\u{1F9E0}",
    title: "Query the Brain",
    description: "Ask questions in natural language. The brain provides answers with causal evidence, confidence scores, and multi-hop reasoning chains.",
    code: `const result = await brain.ask(
  'What caused the spike in support tickets last week?',
  { maxHops: 3, minConfidence: 0.7 }
);

// result.answer - Natural language answer
// result.evidence - Causal chain with p-values
// result.confidence - Overall confidence score`,
  },
  {
    icon: "\u{269B}\u{FE0F}",
    title: "React Hooks",
    description: "Use the brain directly in your React components with built-in hooks for real-time updates and streaming responses.",
    code: `import { useBrain, useSignals } from '@nexusbrain/react';

function Dashboard() {
  const { ask, isLoading } = useBrain();
  const signals = useSignals({ domain: 'finance' });

  const handleQuery = async () => {
    const answer = await ask('Revenue forecast?');
  };
}`,
  },
  {
    icon: "\u{1F916}",
    title: "Agent Memory",
    description: "Give AI agents persistent memory with causal reasoning. Agents inherit the brain's knowledge graph and can contribute new signals.",
    code: `import { AgentBrain } from '@nexusbrain/sdk';

const agent = new AgentBrain({
  brain,
  persona: 'engineering',
  memoryWindow: '30d',
});

// Agent gets causal context automatically
const context = await agent.getContext(
  'Why is CI failing more often?'
);`,
  },
  {
    icon: "\u{1F50C}",
    title: "MCP Server",
    description: "Expose the brain as a Model Context Protocol server. Any MCP-compatible AI assistant can query causal intelligence directly.",
    code: `// Start as MCP server
import { startMCPServer } from '@nexusbrain/mcp';

startMCPServer({
  brain,
  tools: ['ask', 'signal', 'graph', 'predict'],
  port: 3100,
});`,
  },
  {
    icon: "\u{1F517}",
    title: "Webhook",
    description: "Receive real-time notifications when the brain discovers new causal edges, detects anomalies, or completes training cycles.",
    code: `// Register webhook
await brain.webhook.register({
  url: 'https://your-app.com/api/brain-events',
  events: [
    'edge.discovered',
    'anomaly.detected',
    'training.completed',
    'cascade.alert',
  ],
});`,
  },
  {
    icon: "\u{1F310}",
    title: "REST API",
    description: "Full REST API for language-agnostic integration. Every SDK method has a corresponding HTTP endpoint with OpenAPI documentation.",
    code: `# Feed a signal
curl -X POST https://api.usebrainos.com/v1/signals \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "type": "customer.churned",
    "domain": "finance",
    "value": 1
  }'

# Query the brain
curl https://api.usebrainos.com/v1/ask \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{ "query": "Why is churn increasing?" }'`,
  },
];

export default function IntegratePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Integrate</h1>
        <p className="text-muted text-sm mt-1">
          Connect your apps to the brain in minutes with the SDK, REST API, or MCP server
        </p>
      </div>

      {/* Quick Start */}
      <div className="rounded-xl bg-card border border-border/50 p-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-medium">Quick Start</h2>
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent-light font-medium">
            3 steps
          </span>
        </div>
        <p className="text-xs text-muted mb-6">Get the brain running in your app in under 5 minutes</p>

        <div className="space-y-6">
          {QUICK_STEPS.map((step) => (
            <div key={step.step}>
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                  {step.step}
                </span>
                <h3 className="text-sm font-medium">{step.title}</h3>
              </div>
              <pre className="rounded-lg bg-surface border border-border/30 p-4 overflow-x-auto">
                <code className="text-xs font-mono text-muted-foreground">{step.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Patterns */}
      <div>
        <h2 className="text-sm font-medium mb-1">Integration Patterns</h2>
        <p className="text-xs text-muted mb-4">Choose the pattern that fits your architecture</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PATTERNS.map((pattern) => (
            <div
              key={pattern.title}
              className="rounded-xl bg-card border border-border/50 p-5 flex flex-col"
            >
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl shrink-0">{pattern.icon}</span>
                <div>
                  <h3 className="font-medium text-sm">{pattern.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {pattern.description}
                  </p>
                </div>
              </div>
              <pre className="flex-1 rounded-lg bg-surface border border-border/30 p-3 overflow-x-auto mt-auto">
                <code className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  {pattern.code}
                </code>
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* SDK Reference */}
      <div className="rounded-xl bg-card border border-accent/20 p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-sm mb-1">Full SDK Documentation</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Complete API reference, TypeScript types, advanced configuration, training pack authoring,
              and deployment guides. Every method documented with examples.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://usebrainos.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:bg-accent-dark transition-colors"
              >
                Read the Docs
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
              <a
                href="https://github.com/abhishec/nexus-intelligence"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-surface-hover transition-colors"
              >
                View on GitHub
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
