import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation",
};

const sections = [
  {
    title: "Getting Started",
    items: [
      { label: "Quickstart Guide", href: "/docs/quickstart", description: "Get up and running in 5 minutes with zero dependencies." },
    ],
  },
  {
    title: "SDK & API",
    items: [
      { label: "SDK Packages", href: "/docs/sdk", description: "Reference for @nexus-ai/memory-stack, @nexus-ai/domain-agents, @nexus-ai/client." },
      { label: "API Reference", href: "/docs/api", description: "REST API endpoints via Supabase Edge Functions." },
      { label: "MCP Server", href: "/docs/mcp", description: "Claude Desktop/Code integration via Model Context Protocol." },
    ],
  },
  {
    title: "Architecture",
    items: [
      { label: "7-Layer Stack", href: "/docs/architecture", description: "Deep dive into the intelligence stack, event bus, and bridges." },
      { label: "Causal Engine", href: "/docs/causal-engine", description: "9 discovery methods, PC algorithm, do-calculus, benchmarks." },
      { label: "Connectors", href: "/docs/connectors", description: "16 built-in connectors: configuration and custom connectors." },
    ],
  },
];

export default function DocsPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Documentation</h1>
      <p className="mb-12 text-lg text-muted">
        Everything you need to integrate NexusBrain&apos;s causal memory into your application. Start with zero dependencies and scale to a full production stack.
      </p>

      <div className="space-y-12">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-4 text-xl font-semibold">{section.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/30 hover:bg-surface-light"
                >
                  <h3 className="mb-1 text-base font-semibold text-foreground">{item.label}</h3>
                  <p className="text-sm text-muted">{item.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
