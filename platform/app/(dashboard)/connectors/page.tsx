import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { formatNumber } from "@/lib/utils";
import { ConnectorsClient } from "./connectors-client";

export const dynamic = 'force-dynamic';

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
  const orgId = await getCurrentOrgId();

  // Fetch signal counts and GitHub connector status in parallel
  const [signalsResult, githubConnectorResult] = await Promise.all([
    supabase
      .from("cross_domain_signals")
      .select("source_domain")
      .eq("organization_id", orgId),
    supabase
      .from("org_connectors")
      .select("id, status, config, last_sync_at, signals_count")
      .eq("organization_id", orgId)
      .eq("connector_type", "github")
      .maybeSingle(),
  ]);

  const signals = signalsResult.data || [];
  const githubConnector = githubConnectorResult.data;

  // Count signals by domain
  const domainCounts: Record<string, number> = {};
  signals.forEach((s: { source_domain: string }) => {
    const domain = (s.source_domain || "unknown").toLowerCase();
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });

  // Determine which connectors are "active" (have signals)
  const activeDomains = new Set(Object.keys(domainCounts));

  // Serialize GitHub connector for client component
  const githubStatus = githubConnector
    ? {
        status: githubConnector.status as string,
        config: githubConnector.config as Record<string, any>,
        lastSyncAt: githubConnector.last_sync_at,
        signalsCount: githubConnector.signals_count,
      }
    : null;

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
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Total Connectors
          </div>
          <div className="text-2xl font-bold">13</div>
          <div className="text-xs text-muted mt-1">Available integrations</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Active Domains
          </div>
          <div className="text-2xl font-bold text-success">{activeDomains.size}</div>
          <div className="text-xs text-muted mt-1">Domains with signals</div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Total Signals
          </div>
          <div className="text-2xl font-bold text-accent">{formatNumber(signals.length)}</div>
          <div className="text-xs text-muted mt-1">Across all connectors</div>
        </div>
      </div>

      {/* Connector grid — client component handles GitHub setup modal */}
      <ConnectorsClient
        connectors={CONNECTORS.map((c) => ({
          name: c.name,
          domain: c.domain,
          icon: c.icon,
          description: c.description,
        }))}
        domainCounts={domainCounts}
        activeDomains={Array.from(activeDomains)}
        githubStatus={githubStatus}
      />
    </div>
  );
}
