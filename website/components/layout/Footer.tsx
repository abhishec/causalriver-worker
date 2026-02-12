import Link from "next/link";
import { SITE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2">
              <li><Link href="/docs" className="text-sm text-muted hover:text-foreground">Documentation</Link></li>
              <li><Link href="/docs/quickstart" className="text-sm text-muted hover:text-foreground">Quickstart</Link></li>
              <li><Link href="/use-cases" className="text-sm text-muted hover:text-foreground">Use Cases</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">SDK</h3>
            <ul className="space-y-2">
              <li><Link href="/docs/sdk" className="text-sm text-muted hover:text-foreground">SDK Reference</Link></li>
              <li><Link href="/docs/api" className="text-sm text-muted hover:text-foreground">API Reference</Link></li>
              <li><Link href="/docs/mcp" className="text-sm text-muted hover:text-foreground">MCP Server</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Architecture</h3>
            <ul className="space-y-2">
              <li><Link href="/docs/architecture" className="text-sm text-muted hover:text-foreground">7-Layer Stack</Link></li>
              <li><Link href="/docs/causal-engine" className="text-sm text-muted hover:text-foreground">Causal Engine</Link></li>
              <li><Link href="/docs/connectors" className="text-sm text-muted hover:text-foreground">Connectors</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Community</h3>
            <ul className="space-y-2">
              <li><a href={SITE.github} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-foreground">GitHub</a></li>
              <li><a href={`${SITE.github}/issues`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-foreground">Issues</a></li>
              <li><a href={`${SITE.github}/discussions`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-foreground">Discussions</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted">MIT License - Monetize Organisation</p>
          <p className="text-sm text-muted">Built with NexusBrain</p>
        </div>
      </div>
    </footer>
  );
}
