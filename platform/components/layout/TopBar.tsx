"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/* ── Route labels for breadcrumb ──────────────────────────────────────────── */

const ROUTE_LABELS: Record<string, string> = {
  "/workspace": "Mission Control",
  "/processes": "Processes",
  "/overview": "Command Center",
  "/copilot": "Intelligence",
  "/connectors": "Connectors",
  "/settings": "Settings",
  "/artifacts": "Artifacts",
  "/brain": "Brain",
  "/predictions": "Predictions",
  "/agents": "Agents",
  "/early-warning": "Early Warning",
  "/releases": "Releases",
  "/code-intelligence": "Code Intel",
  "/capabilities": "Services",
  "/observability": "Observability",
  "/costs": "Costs",
  "/training": "Training",
  "/simulator": "Simulator",
  "/aaas": "AAAS",
  "/dashboard": "Dashboard",
};

function openCopilot() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
  );
}

export function TopBar() {
  const pathname = usePathname() ?? "";
  // Derive label directly from pathname — same value on SSR and client, no hydration mismatch.
  const pageLabel = ROUTE_LABELS[pathname] || pathname.split("/").pop() || "";

  // Hide topbar on copilot page — it has its own header with service tabs
  if (pathname === "/copilot") return null;

  // Show breadcrumb for non-root pages: "Mission Control > [page]"
  const showBreadcrumb = pathname !== "/workspace" && pageLabel;

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border-subtle bg-background px-6 pl-14 md:pl-6">
      {/* ── Left: Page title / breadcrumb ────────────────────────── */}
      <div className="flex items-center gap-2">
        {showBreadcrumb ? (
          <>
            <Link
              href="/workspace"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Mission Control
            </Link>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <span className="text-sm font-medium text-foreground">{pageLabel}</span>
          </>
        ) : (
          <span className="text-sm font-medium text-foreground">{pageLabel}</span>
        )}
      </div>

      {/* ── Right: Ask AI + Theme toggle ────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openCopilot}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface/50 hover:bg-surface hover:border-accent/30 transition-all text-xs text-muted-foreground hover:text-foreground"
          aria-label="Open Copilot (Cmd+K)"
        >
          {/* Chat bubble icon */}
          <svg
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span>Ask AI</span>
          <kbd className="ml-1 hidden sm:inline-flex items-center px-1 py-0.5 rounded bg-surface text-[9px] font-mono border border-border text-muted/60">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
