import type { Metadata } from "next";
import { CodeBlock } from "@/components/shared/CodeBlock";

export const metadata: Metadata = {
  title: "MCP Server",
};

export default function MCPPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">MCP Server</h1>
      <p className="mb-8 text-lg text-muted">
        The NexusBrain MCP server gives Claude Desktop and Claude Code direct access to your organizational brain
        via the Model Context Protocol.
      </p>

      <h2 className="mb-4 mt-8 text-2xl font-semibold">Install</h2>
      <CodeBlock code="pnpm add @nexus-ai/mcp-server" language="bash" filename="terminal" />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Claude Desktop Configuration</h2>
      <p className="mb-4 text-muted">
        Add the following to your Claude Desktop configuration file:
      </p>
      <CodeBlock
        code={`{
  "mcpServers": {
    "nexus-brain": {
      "command": "npx",
      "args": ["@nexus-ai/mcp-server"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "NEXUS_ORG_ID": "org_123"
      }
    }
  }
}`}
        language="json"
        filename="claude_desktop_config.json"
      />

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Available Tools</h2>
      <p className="mb-6 text-muted">
        The MCP server exposes 5 tools that Claude can use during conversations:
      </p>

      <div className="space-y-4">
        {[
          {
            name: "nexus_query",
            description: "Ask questions with causal evidence. Claude sends a natural language question and receives an answer backed by the causal graph.",
            example: 'nexus_query({ query: "Why is churn rising?", domain: "cs" })',
          },
          {
            name: "nexus_ingest",
            description: "Send signals to the brain. Claude can ingest observations during a conversation.",
            example: 'nexus_ingest({ signals: [{ source_domain: "cs", signal_type: "escalation", signal_value: 1 }] })',
          },
          {
            name: "nexus_relationships",
            description: "Read causal edges. Returns the current causal graph for a domain or entity.",
            example: 'nexus_relationships({ domain: "finance", minConfidence: 0.7 })',
          },
          {
            name: "nexus_webhook",
            description: "Forward webhooks. Claude can relay external events to the brain for processing.",
            example: 'nexus_webhook({ source: "stripe", payload: { ... } })',
          },
          {
            name: "nexus_cron",
            description: "Trigger maintenance tasks. Run causal discovery, prediction verification, or evidence decay.",
            example: 'nexus_cron({ jobs: ["discover", "verify"] })',
          },
        ].map((tool) => (
          <div key={tool.name} className="rounded-xl border border-border bg-surface p-5">
            <code className="text-sm font-bold text-emerald-400">{tool.name}</code>
            <p className="mt-2 text-sm text-muted">{tool.description}</p>
            <div className="mt-3">
              <CodeBlock code={tool.example} language="typescript" />
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Knowledge Federation</h2>
      <p className="mb-4 text-muted">
        The MCP server automatically federates between the Core Brain (universal knowledge) and your Org Brain (proprietary knowledge).
        Your org brain always takes priority. When Claude asks a question, both brains contribute to the answer, with clear labeling of which insights come from universal vs. organizational data.
      </p>
    </div>
  );
}
