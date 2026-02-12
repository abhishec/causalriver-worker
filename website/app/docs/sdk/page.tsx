import type { Metadata } from "next";
import { CodeBlock } from "@/components/shared/CodeBlock";

export const metadata: Metadata = {
  title: "SDK Reference",
};

const packages = [
  {
    name: "@nexus-ai/memory-stack",
    description: "Core intelligence engine: 8 causal methods, learning, embeddings, connectors",
    install: "pnpm add @nexus-ai/memory-stack",
    subpaths: [
      { path: "@nexus-ai/memory-stack", desc: "Full library" },
      { path: "@nexus-ai/memory-stack/causality", desc: "8 causal methods + PC + do-calculus" },
      { path: "@nexus-ai/memory-stack/learning", desc: "Pattern learning + brain trainer" },
      { path: "@nexus-ai/memory-stack/embeddings", desc: "N-gram + neural embeddings" },
      { path: "@nexus-ai/memory-stack/intelligence", desc: "Domain personas, reasoning" },
      { path: "@nexus-ai/memory-stack/hooks", desc: "React hooks" },
      { path: "@nexus-ai/memory-stack/persistence", desc: "Supabase repository" },
    ],
  },
  {
    name: "@nexus-ai/domain-agents",
    description: "Agent framework: intent routing, 12+ personas, access control",
    install: "pnpm add @nexus-ai/domain-agents",
    subpaths: [
      { path: "@nexus-ai/domain-agents", desc: "Full library" },
      { path: "@nexus-ai/domain-agents/registry", desc: "Module registry" },
      { path: "@nexus-ai/domain-agents/intent", desc: "Intent classification" },
      { path: "@nexus-ai/domain-agents/personas", desc: "14 personas + prompt builders" },
      { path: "@nexus-ai/domain-agents/routing", desc: "Cross-domain routing" },
      { path: "@nexus-ai/domain-agents/access", desc: "Access control + degradation" },
      { path: "@nexus-ai/domain-agents/hooks", desc: "React hooks" },
    ],
  },
  {
    name: "@nexus-ai/client",
    description: "Lightweight HTTP client for NexusBrain API. Works in Node.js, Deno, Bun, browsers.",
    install: "pnpm add @nexus-ai/client",
    subpaths: [],
  },
  {
    name: "@nexus-ai/mcp-server",
    description: "Model Context Protocol server for Claude Desktop/Code integration.",
    install: "pnpm add @nexus-ai/mcp-server",
    subpaths: [],
  },
  {
    name: "@nexus-ai/slack-connector",
    description: "Slack workspace intelligence connector.",
    install: "pnpm add @nexus-ai/slack-connector",
    subpaths: [
      { path: "@nexus-ai/slack-connector/client", desc: "Slack API client" },
      { path: "@nexus-ai/slack-connector/fetcher", desc: "Data fetching" },
      { path: "@nexus-ai/slack-connector/transform", desc: "Signal transformation" },
      { path: "@nexus-ai/slack-connector/analyzer", desc: "Causal analysis" },
      { path: "@nexus-ai/slack-connector/webhook", desc: "Event handling" },
    ],
  },
];

export default function SDKPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">SDK Reference</h1>
      <p className="mb-8 text-lg text-muted">
        NexusBrain is distributed as 5 npm packages. All support tree-shaking via subpath imports.
      </p>

      <div className="space-y-12">
        {packages.map((pkg) => (
          <div key={pkg.name} className="rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-2 text-xl font-semibold text-foreground">{pkg.name}</h2>
            <p className="mb-4 text-sm text-muted">{pkg.description}</p>
            <CodeBlock code={pkg.install} language="bash" filename="terminal" />

            {pkg.subpaths.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-base font-semibold">Subpath Imports</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Import</th>
                        <th className="py-2 text-left text-xs font-medium uppercase text-muted">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pkg.subpaths.map((sp) => (
                        <tr key={sp.path} className="border-b border-border/30">
                          <td className="py-2 pr-4 font-mono text-sm text-emerald-400">{sp.path}</td>
                          <td className="py-2 text-sm text-muted">{sp.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="mb-4 mt-12 text-2xl font-semibold">Integration Tiers</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">Tier</th>
              <th className="py-2 pr-4 text-left text-xs font-medium uppercase text-muted">What You Get</th>
              <th className="py-2 text-left text-xs font-medium uppercase text-muted">Dependencies</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/30">
              <td className="py-2 pr-4 font-semibold text-emerald-400">1. Core Intelligence</td>
              <td className="py-2 pr-4 text-muted">Causal discovery, anomaly detection, pattern learning, embeddings, event bus</td>
              <td className="py-2 font-semibold text-emerald-400">None</td>
            </tr>
            <tr className="border-b border-border/30">
              <td className="py-2 pr-4 font-semibold text-blue-400">2. Persistence</td>
              <td className="py-2 pr-4 text-muted">Store signals, search embeddings, entity resolution</td>
              <td className="py-2 text-muted">Supabase</td>
            </tr>
            <tr className="border-b border-border/30">
              <td className="py-2 pr-4 font-semibold text-amber-400">3. Connectors</td>
              <td className="py-2 pr-4 text-muted">Auto-ingest from 13 SaaS tools</td>
              <td className="py-2 text-muted">Supabase + API keys</td>
            </tr>
            <tr className="border-b border-border/30">
              <td className="py-2 pr-4 font-semibold text-violet-400">4. LLM Copilot</td>
              <td className="py-2 pr-4 text-muted">Natural language with causal context</td>
              <td className="py-2 text-muted">Supabase + Anthropic/OpenAI</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
