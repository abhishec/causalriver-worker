"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    title: "Getting Started",
    links: [
      { label: "Overview", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Troubleshooting", href: "/docs/troubleshooting" },
    ],
  },
  {
    title: "SDK Reference",
    links: [
      { label: "SDK Packages", href: "/docs/sdk" },
      { label: "API Reference", href: "/docs/api" },
      { label: "MCP Server", href: "/docs/mcp" },
    ],
  },
  {
    title: "Architecture",
    links: [
      { label: "7-Layer Stack", href: "/docs/architecture" },
      { label: "Causal Engine", href: "/docs/causal-engine" },
      { label: "Connectors", href: "/docs/connectors" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 flex-shrink-0 overflow-y-auto border-r border-border pr-6 lg:block">
      <nav className="space-y-6 py-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {section.title}
            </h4>
            <ul className="space-y-1">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      pathname === link.href
                        ? "bg-accent/10 text-accent-light font-medium"
                        : "text-muted hover:text-foreground hover:bg-surface-light"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
