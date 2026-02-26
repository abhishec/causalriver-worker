"use client";

/**
 * AgentsPageWrapper
 * =================
 * Top-level wrapper that toggles between:
 *   - "Definitions" tab → AgentManagementPanel (create, run, pause, delete agents)
 *   - "Run History" tab → AgentsClient (timeline of past runs, stats, errors)
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AgentsClient } from "./agents-client";
import { AgentManagementPanel } from "@/components/dashboard/AgentManagementPanel";

type TabId = "definitions" | "history";

const TABS: { id: TabId; label: string; icon: string }[] = [
  {
    id: "definitions",
    label: "Agent Definitions",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
  },
  {
    id: "history",
    label: "Run History",
    icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6",
  },
];

export function AgentsPageWrapper() {
  const [activeTab, setActiveTab] = useState<TabId>("definitions");

  return (
    <div className="space-y-5">
      {/* Header with tabs */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          <p className="text-xs text-muted mt-0.5">
            Define, run, and monitor SE-aaS automation agents
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-accent border-accent"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "definitions" && (
        <AgentManagementPanel title="Agent Definitions" />
      )}
      {activeTab === "history" && <AgentsClient />}
    </div>
  );
}
