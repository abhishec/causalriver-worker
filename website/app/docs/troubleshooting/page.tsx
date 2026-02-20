import type { Metadata } from "next";
import { CodeBlock } from "@/components/shared/CodeBlock";

export const metadata: Metadata = {
  title: "Troubleshooting FAQ",
};

const faqs = [
  {
    category: "Setup & Installation",
    questions: [
      {
        q: "Installation fails with 'Cannot find module @nexus-ai/memory-stack'",
        a: "Ensure you've installed the package and your package.json includes it in dependencies. If using pnpm/yarn workspaces, run the install command from the workspace root.",
        code: `# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Or with pnpm
pnpm install --force`,
      },
      {
        q: "Supabase migrations fail with 'permission denied for schema public'",
        a: "Your Supabase user needs schema creation privileges. Run migrations with the service role key (not anon key). Check your Supabase dashboard → Settings → API for the service_role key.",
        code: `# Use service role key for migrations
SUPABASE_SERVICE_ROLE_KEY=<your-service-key> \\
npx supabase db push`,
      },
      {
        q: "TypeScript errors about missing types after installation",
        a: "Brain OS packages export types. Ensure your tsconfig.json has 'moduleResolution': 'bundler' or 'node16' and includes the packages in your type roots.",
        code: `// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "types": ["@nexus-ai/memory-stack"]
  }
}`,
      },
    ],
  },
  {
    category: "MCP Server",
    questions: [
      {
        q: "Claude Desktop doesn't show Brain OS MCP server",
        a: "Check your claude_desktop_config.json location and formatting. On macOS it's at ~/Library/Application Support/Claude/claude_desktop_config.json. Restart Claude Desktop after editing.",
        code: `{
  "mcpServers": {
    "brainos": {
      "command": "npx",
      "args": ["-y", "@nexus-ai/mcp-server"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "NEXUS_ORG_ID": "org_123"
      }
    }
  }
}`,
      },
      {
        q: "MCP server starts but tools aren't working",
        a: "Verify environment variables are set correctly. Check Claude Desktop logs for connection errors. Ensure your organization ID exists in the database.",
        code: `# Check Claude Desktop logs (macOS)
tail -f ~/Library/Logs/Claude/mcp*.log

# Verify organization exists in Supabase
SELECT * FROM organizations WHERE id = 'org_123';`,
      },
      {
        q: "nexus_query returns empty results despite having data",
        a: "Causal relationships may not be discovered yet. Run the consolidation engine manually to discover patterns. Check that you have sufficient signals (min 30 observations per domain).",
        code: `import { createConsolidationEngine } from '@nexus-ai/memory-stack/orchestrator';

const engine = createConsolidationEngine({
  supabase,
  organizationId: 'org_123',
  lookbackHours: 720, // 30 days
  verbose: true
});

await engine.run(); // This discovers causal patterns`,
      },
    ],
  },
  {
    category: "Causal Discovery",
    questions: [
      {
        q: "Consolidation runs but discovers 0 causal relationships",
        a: "Common causes: (1) Insufficient data (need min 30 observations per domain), (2) No temporal correlation in signals, (3) minObservations threshold too high. Lower discovery thresholds or generate more signals.",
        code: `// Lower thresholds for initial testing
const engine = createConsolidationEngine({
  supabase,
  organizationId: 'org_123',
  minObservations: 10,        // Default: 30
  minEdgeWeight: 0.10,        // Default: 0.20
  autoPromoteConfidence: 0.55, // Default: 0.75
});`,
      },
      {
        q: "Causal edges discovered but they seem spurious/incorrect",
        a: "Check for confounding variables and ensure temporal ordering. The cascade-aware method helps detect indirect paths. Increase minEdgeWeight and autoPromoteConfidence for higher precision.",
        code: `// Higher precision settings
const engine = createConsolidationEngine({
  supabase,
  organizationId: 'org_123',
  minEdgeWeight: 0.30,         // Stricter threshold
  autoPromoteConfidence: 0.85,  // Higher confidence required
  causalMethod: 'conditional',  // Confounder rejection
});`,
      },
      {
        q: "Error: 'Insufficient observations: X < 30'",
        a: "Not enough data points for statistical significance. Either ingest more signals or lower the minObservations threshold. For demo/testing, use minObservations: 5-10.",
        code: `// Generate more test data
import { generateRealisticData } from './realistic-data-generator';

for (let day = 0; day < 90; day++) {
  const signals = generateRealisticData(day);
  await repository.insertSignals(signals);
}`,
      },
      {
        q: "Causal discovery is too slow (>30 seconds)",
        a: "Large datasets require longer processing. Reduce discoveryLookbackDays or filter to specific domains. Consider running consolidation as a background job.",
        code: `// Run consolidation in background
import { scheduleConsolidation } from '@nexus-ai/memory-stack/orchestrator';

// Run every 6 hours
await scheduleConsolidation({
  supabase,
  organizationId: 'org_123',
  interval: '6 hours', // pg_cron syntax
});`,
      },
    ],
  },
  {
    category: "Persistence & Database",
    questions: [
      {
        q: "Error: 'relation cross_domain_signals does not exist'",
        a: "Database migrations haven't run. Apply migrations using Supabase CLI or run the migration SQL files manually from supabase/migrations/.",
        code: `# Apply migrations
cd packages/memory-stack
npx supabase db push

# Or manually in Supabase SQL Editor
-- Run each migration file in order from supabase/migrations/`,
      },
      {
        q: "Signals inserted but not appearing in queries",
        a: "Check Row Level Security (RLS) policies. Ensure your organization_id matches the query filter. Use service role key (not anon key) for admin queries.",
        code: `// Use service role for debugging
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Not anon key
);

// Check if signals exist (bypasses RLS)
const { data, count } = await supabase
  .from('cross_domain_signals')
  .select('*', { count: 'exact' })
  .eq('organization_id', 'org_123');

console.log('Total signals:', count);`,
      },
      {
        q: "Database connection timeout errors",
        a: "Supabase free tier has connection limits. Use connection pooling or reduce concurrent queries. Upgrade to Pro for higher limits.",
        code: `// Use Supabase pooler connection
const supabase = createClient(
  'https://your-project.supabase.co', // Transaction pooler
  process.env.SUPABASE_ANON_KEY!,
  {
    db: { schema: 'public' },
    global: { fetch: fetch.bind(globalThis) }
  }
);`,
      },
    ],
  },
  {
    category: "Connectors",
    questions: [
      {
        q: "Stripe connector fails with 'Invalid API key'",
        a: "Check that STRIPE_API_KEY is set correctly. Use test mode keys (sk_test_) for development. Ensure the key has read permissions for all required resources.",
        code: `# Verify Stripe key
echo $STRIPE_API_KEY

# Test connection
curl https://api.stripe.com/v1/charges?limit=1 \\
  -u $STRIPE_API_KEY:`,
      },
      {
        q: "HubSpot connector returns 'Authentication failed'",
        a: "HubSpot requires OAuth or Private App tokens. Ensure your token has scopes: crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read.",
        code: `# Test HubSpot token
curl -X GET \\
  'https://api.hubapi.com/crm/v3/objects/contacts?limit=1' \\
  -H 'Authorization: Bearer YOUR_HUBSPOT_TOKEN'`,
      },
      {
        q: "Webhook receiver gets duplicate events",
        a: "Ensure you're storing event IDs for deduplication. The nexus-webhook endpoint handles this automatically, but custom receivers need to implement it.",
        code: `// Deduplicate webhooks
const { data: existing } = await supabase
  .from('webhook_events')
  .select('id')
  .eq('external_event_id', event.id)
  .single();

if (existing) {
  return new Response('Duplicate', { status: 200 });
}`,
      },
    ],
  },
  {
    category: "LLM Copilot",
    questions: [
      {
        q: "Copilot returns generic answers without causal evidence",
        a: "Ensure causal relationships have been discovered first (run consolidation). Check that the query domain matches your data. Verify ANTHROPIC_API_KEY is set.",
        code: `// Test causal graph exists
const { data: edges } = await supabase
  .from('causal_relationships_statistical')
  .select('*')
  .eq('organization_id', 'org_123');

console.log('Causal edges discovered:', edges?.length || 0);

// If 0, run consolidation first
await engine.run();`,
      },
      {
        q: "Error: 'Anthropic API key not found'",
        a: "Set ANTHROPIC_API_KEY in your environment. Get API key from console.anthropic.com. Use Claude 3.5 Sonnet or later for best results.",
        code: `# Set API key
export ANTHROPIC_API_KEY=sk-ant-api03-...

# Verify it works
curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'`,
      },
    ],
  },
  {
    category: "Performance & Scaling",
    questions: [
      {
        q: "Signal ingestion is slow for large batches",
        a: "Use batch inserts (max 500 signals/batch). Enable connection pooling. Consider async processing with job queues for large volumes.",
        code: `// Batch insert signals
const BATCH_SIZE = 500;
for (let i = 0; i < signals.length; i += BATCH_SIZE) {
  const batch = signals.slice(i, i + BATCH_SIZE);
  await repository.insertSignals(batch);
}`,
      },
      {
        q: "Embeddings generation taking too long",
        a: "Brain OS uses CPU-based N-gram embeddings (no GPU required). For large text volumes, increase batch size or use streaming ingestion.",
        code: `// Faster embedding config
import { createEmbeddings } from '@nexus-ai/memory-stack/embeddings';

const embeddings = createEmbeddings({
  ngramSize: 2,        // Lower = faster (default: 3)
  maxFeatures: 1000,   // Lower = faster (default: 5000)
});`,
      },
    ],
  },
];

export default function TroubleshootingPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Troubleshooting FAQ</h1>
      <p className="mb-8 text-lg text-muted">
        Common issues and solutions for Brain OS setup, causal discovery, connectors, and production deployment.
      </p>

      <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl">🔍</span>
          <h2 className="text-lg font-semibold text-amber-400">Quick Debugging Checklist</h2>
        </div>
        <ul className="ml-8 list-disc space-y-2 text-sm text-muted">
          <li>Check environment variables are set correctly (SUPABASE_URL, SUPABASE_ANON_KEY, etc.)</li>
          <li>Verify database migrations have been applied (check Supabase dashboard → Table Editor)</li>
          <li>Ensure organization ID exists in the database and matches your queries</li>
          <li>Run consolidation engine manually to discover causal patterns (need min 30 observations)</li>
          <li>Check Claude Desktop logs for MCP connection errors (~/Library/Logs/Claude/mcp*.log)</li>
          <li>Verify API keys have correct permissions (Stripe read access, HubSpot CRM scopes, etc.)</li>
          <li>Use service role key (not anon key) for debugging RLS issues</li>
        </ul>
      </div>

      <div className="space-y-12">
        {faqs.map((category, idx) => (
          <div key={idx}>
            <h2 className="mb-6 text-2xl font-bold">{category.category}</h2>
            <div className="space-y-8">
              {category.questions.map((faq, qIdx) => (
                <div key={qIdx} className="rounded-xl border border-border bg-surface p-6">
                  <h3 className="mb-3 text-lg font-semibold text-foreground">{faq.q}</h3>
                  <p className="mb-4 text-sm text-muted">{faq.a}</p>
                  {faq.code && (
                    <CodeBlock
                      code={faq.code}
                      language={faq.code.includes('SELECT') || faq.code.includes('INSERT') ? 'sql' : faq.code.includes('{') ? 'typescript' : 'bash'}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-xl font-bold">Still Stuck? Get Help</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl">💬</span>
            <div>
              <div className="font-semibold">Discord Community</div>
              <div className="text-muted">Join our Discord for real-time help and community support</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">🐙</span>
            <div>
              <div className="font-semibold">GitHub Issues</div>
              <div className="text-muted">Report bugs or request features at github.com/abhishec/nexus-intelligence/issues</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">📧</span>
            <div>
              <div className="font-semibold">Email Support</div>
              <div className="text-muted">Contact support@usebrainos.com for enterprise assistance</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">📖</span>
            <div>
              <div className="font-semibold">Documentation</div>
              <div className="text-muted">Check INTEGRATION.md for comprehensive setup guides and examples</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
