"use client";

/**
 * ServiceContextPane — Right pane idle state
 * ============================================
 * Shows service-specific artifact type cards, quick actions,
 * connected integrations, and recent artifacts when no artifacts
 * are actively being viewed.
 *
 * Matches Claude Cowork's right panel pattern:
 *   Progress / Working folder / Context
 *
 * For NexusBrain, this becomes:
 *   Quick Actions (artifact type cards)
 *   Connected Sources
 *   Recent Artifacts
 */

import { cn } from "@/lib/utils";

// ─── Service-specific artifact types ─────────────────────────────────────────

interface ArtifactTypeCard {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const SERVICE_ARTIFACT_TYPES: Record<string, ArtifactTypeCard[]> = {
  general: [
    { id: "causal-analysis", label: "Causal Analysis", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z", description: "Discover cause and effect" },
    { id: "anomaly-report", label: "Anomaly Report", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", description: "Detect unusual patterns" },
    { id: "intelligence-report", label: "Intelligence Report", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z", description: "Full org intelligence" },
    { id: "prediction", label: "Prediction", icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941", description: "Forecast outcomes" },
  ],
  aas: [
    { id: "pnl", label: "P&L Statement", icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z", description: "Revenue, expenses, net income" },
    { id: "balance-sheet", label: "Balance Sheet", icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6", description: "Assets, liabilities, equity" },
    { id: "gst-review", label: "GST F5 Review", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", description: "Tax compliance check" },
    { id: "trial-balance", label: "Trial Balance", icon: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5", description: "Debit-credit verification" },
    { id: "anomaly-detection", label: "Anomaly Detection", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", description: "Suspicious transactions" },
  ],
  seaas: [
    { id: "pr-review", label: "PR Review", icon: "M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z", description: "Code review with AI" },
    { id: "impact-analysis", label: "Impact Analysis", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z", description: "What breaks if you change..." },
    { id: "architecture", label: "Architecture Map", icon: "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z", description: "Codebase structure" },
    { id: "release-risk", label: "Release Risk", icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z", description: "Risk assessment for deploys" },
  ],
};

const SERVICE_CONNECTORS: Record<string, { name: string; icon: string; connected: boolean }[]> = {
  general: [
    { name: "Brain Core", icon: "brain", connected: true },
  ],
  aas: [
    { name: "Xero", icon: "xero", connected: true },
    { name: "QuickBooks", icon: "qb", connected: false },
  ],
  seaas: [
    { name: "GitHub", icon: "github", connected: true },
    { name: "Sentry", icon: "sentry", connected: false },
    { name: "Jira", icon: "jira", connected: false },
  ],
};

// ─── Component ───────────────────────────────────────────────────────────────

interface ServiceContextPaneProps {
  activeService: string;
  onOpenArtifact: (type: string) => void;
}

export function ServiceContextPane({ activeService, onOpenArtifact }: ServiceContextPaneProps) {
  const artifactTypes = SERVICE_ARTIFACT_TYPES[activeService] || SERVICE_ARTIFACT_TYPES.general;
  const connectors = SERVICE_CONNECTORS[activeService] || [];
  const serviceLabel = activeService === "aas" ? "Accounting" : activeService === "seaas" ? "Engineering" : "Copilot";

  return (
    <div className="w-80 shrink-0 h-full border-l border-border-subtle bg-background overflow-y-auto">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-[13px] font-medium text-foreground">{serviceLabel}</h3>
        <p className="text-[11px] text-muted mt-0.5">Quick actions and context</p>
      </div>

      {/* ── Artifact Type Cards ───────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="text-[11px] text-muted uppercase tracking-wider font-medium mb-2">
          Artifacts
        </div>
        <div className="grid grid-cols-2 gap-2">
          {artifactTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => onOpenArtifact(type.id)}
              className="flex flex-col items-start gap-1.5 p-3 rounded-lg border border-border-subtle hover:border-border hover:bg-surface-hover transition-all text-left group"
            >
              <svg
                className="w-4 h-4 text-muted group-hover:text-foreground transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={type.icon} />
              </svg>
              <div>
                <div className="text-[11px] font-medium text-foreground leading-tight">{type.label}</div>
                <div className="text-[10px] text-muted leading-tight mt-0.5">{type.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Connected Sources ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border-subtle">
        <div className="text-[11px] text-muted uppercase tracking-wider font-medium mb-2">
          Connectors
        </div>
        <div className="space-y-1.5">
          {connectors.map((connector) => (
            <div
              key={connector.name}
              className="flex items-center justify-between py-1.5"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-surface flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-muted-foreground">
                    {connector.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <span className="text-[12px] text-foreground">{connector.name}</span>
              </div>
              {connector.connected ? (
                <span className="text-[10px] text-accent font-medium">Connected</span>
              ) : (
                <button className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border-subtle hover:border-border transition-colors">
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Keyboard Shortcuts ────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border-subtle">
        <div className="text-[11px] text-muted uppercase tracking-wider font-medium mb-2">
          Shortcuts
        </div>
        <div className="space-y-1.5 text-[11px] text-muted">
          <div className="flex justify-between">
            <span>Toggle artifacts</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle">{"\u2318"}\</kbd>
          </div>
          <div className="flex justify-between">
            <span>Slash commands</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle">/</kbd>
          </div>
          <div className="flex justify-between">
            <span>Search</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle">{"\u2318"}K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
