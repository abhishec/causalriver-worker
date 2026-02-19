"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/* ── Route labels for breadcrumb ──────────────────────────────────────────── */

const ROUTE_LABELS: Record<string, string> = {
  "/overview": "Command Center",
  "/copilot": "Intelligence",
  "/connectors": "Connectors",
  "/settings": "Settings",
  "/artifacts": "Artifacts",
  "/brain": "Brain Explorer",
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
  "/aaas": "Accounting",
};

export function TopBar() {
  const pathname = usePathname();

  // Hide topbar on copilot page — it has its own header with service tabs
  if (pathname === "/copilot") return null;

  const pageLabel = ROUTE_LABELS[pathname] || pathname.split("/").pop() || "";

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border-subtle bg-background px-6">
      {/* ── Left: Page title ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">{pageLabel}</span>
      </div>

      {/* ── Right: Theme toggle ──────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
