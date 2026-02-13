import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export const dynamic = 'force-dynamic';

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

export const metadata = { title: "Connectors" };

const CONNECTORS = [
  { name: "Stripe", domain: "finance", icon: "\u{1F4B3}", description: "Payment events, subscription changes, invoices, disputes" },
  { name: "HubSpot", domain: "sales", icon: "\u{1F3AF}", description: "Deal stage changes, contact activity, pipeline metrics" },
  { name: "GitHub", domain: "engineering", icon: "\u{1F419}", description: "Commits, PRs, issues, deployments, CI/CD events" },
  { name: "Intercom", domain: "support", icon: "\u{1F4AC}", description: "Conversations, resolution times, customer satisfaction" },
  { name: "Zendesk", domain: "support", icon: "\u{1F3AB}", description: "Tickets, escalations, SLA compliance, agent performance" },
  { name: "Slack", domain: "communication", icon: "\u{1F4E1}", description: "Channel activity, reaction patterns, thread engagement" },
  { name: "Notion", domain: "knowledge", icon: "\u{1F4DD}", description: "Page updates, database changes, workspace activity" },
  { name: "Google Chat", domain: "operations", icon: "\u{1F4BC}", description: "Space messages, direct messages, bot interactions" },
  { name: "Google Calendar", domain: "operations", icon: "\u{1F4C5}", description: "Meeting patterns, scheduling conflicts, time allocation" },
  { name: "Voice", domain: "cs", icon: "\u{1F399}", description: "Call transcripts, sentiment analysis, topic extraction" },
  { name: "Mailchimp", domain: "marketing", icon: "\u{1F4E7}", description: "Campaign performance, open rates, click patterns" },
  { name: "Plaid", domain: "finance", icon: "\u{1F3E6}", description: "Transaction flows, account balances, financial patterns" },
  { name: "Generic API", domain: "any", icon: "\u{1F50C}", description: "Custom webhook endpoints for any data source" },
] as const;

export default async function ConnectorsPage() {
  const supabase = await createClient();

  const signalsResult = await supabase
    .from("cross_domain_signals")
    .select("source_domain")
    .eq("organization_id", CORE_ORG_ID);

  const signals = signalsResult.data || [];

  // Count signals by domain
  const domainCounts: Record<string, number> = {};
  signals.forEach((s: { source_domain: string }) => {
    const domain = (s.source_domain || "unknown").toLowerCase();
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });

  // Determine which connectors are "active" (have signals)
  const activeDomains = new Set(Object.keys(domainCounts));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connectors</h1>
        <p className="text-muted text-sm mt-1">
          13 built-in connectors pull signals from the tools your teams already use
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Total Connectors
          </div>
          <div className="text-2xl font-bold">13</div>
          <div className="text-xs text-muted mt-1">Available integrations</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Active Domains
          </div>
          <div className="text-2xl font-bold text-success">{activeDomains.size}</div>
          <div className="text-xs text-muted mt-1">Domains with signals</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Total Signals
          </div>
          <div className="text-2xl font-bold text-accent">{formatNumber(signals.length)}</div>
          <div className="text-xs text-muted mt-1">Across all connectors</div>
        </div>
      </div>

      {/* Connector grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CONNECTORS.map((connector) => {
          const signalCount = domainCounts[connector.domain] || 0;
          const isActive = activeDomains.has(connector.domain);

          return (
            <div
              key={connector.name}
              className={`rounded-xl bg-card border p-5 transition-all hover:bg-card-hover hover:border-accent/30 cursor-pointer ${
                isActive ? "border-border/50" : "border-border/30 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{connector.icon}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    isActive
                      ? "bg-success/10 text-success"
                      : "bg-muted/10 text-muted"
                  }`}
                >
                  {isActive && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
                  )}
                  {isActive ? "Active" : "Not Connected"}
                </span>
              </div>

              <h3 className="font-medium text-sm mb-1">{connector.name}</h3>
              <div className="text-[10px] text-accent uppercase tracking-wider font-medium mb-2">
                {connector.domain}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {connector.description}
              </p>

              {isActive ? (
                <div className="flex items-center justify-between pt-3 border-t border-border/30">
                  <span className="text-xs text-muted">Signals</span>
                  <span className="text-sm font-medium text-accent">
                    {formatNumber(signalCount)}
                  </span>
                </div>
              ) : (
                <div className="pt-3 border-t border-border/30">
                  <span className="text-xs text-muted">No signals yet</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
