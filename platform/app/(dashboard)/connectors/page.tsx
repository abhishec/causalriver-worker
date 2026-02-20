import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { ConnectorsClient } from "./connectors-client";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Connectors" };

const CONNECTORS = [
  { name: "AWS S3", type: "s3-storage", domain: "operations", icon: "📦", description: "Org-level file storage — CSV, JSON, reports, GL data", oauth: false },
  { name: "GitHub", type: "github", domain: "engineering", icon: "🐙", description: "Commits, PRs, issues, deployments, CI/CD events", oauth: true },
  { name: "Slack", type: "slack", domain: "communication", icon: "💬", description: "Channel activity, reaction patterns, thread engagement", oauth: true },
  { name: "Jira", type: "jira", domain: "engineering", icon: "📋", description: "Issues, comments, and project workflows", oauth: true },
  { name: "Stripe", type: "stripe", domain: "finance", icon: "💳", description: "Payment events, subscription changes, invoices, disputes", oauth: false },
  { name: "HubSpot", type: "hubspot", domain: "sales", icon: "🎯", description: "Deal stage changes, contact activity, pipeline metrics", oauth: false },
  // Freshworks suite (NB-020)
  { name: "Freshdesk", type: "freshdesk", domain: "support", icon: "🎧", description: "Support tickets, conversations, SLA tracking, agent performance", oauth: false },
  { name: "Freshsales", type: "freshsales", domain: "sales", icon: "💼", description: "CRM contacts, deals, activities, pipeline and revenue metrics", oauth: false },
  { name: "Freshchat", type: "freshchat", domain: "support", icon: "💬", description: "Live-chat conversations, message threads, agent response times", oauth: false },
  { name: "Intercom", type: "intercom", domain: "support", icon: "💬", description: "Conversations, resolution times, customer satisfaction", oauth: false },
  { name: "Zendesk", type: "zendesk", domain: "support", icon: "🎫", description: "Tickets, escalations, SLA compliance, agent performance", oauth: false },
  { name: "Notion", type: "notion", domain: "knowledge", icon: "📝", description: "Page updates, database changes, workspace activity", oauth: false },
  { name: "Google Chat", type: "google_chat", domain: "operations", icon: "💼", description: "Space messages, direct messages, bot interactions", oauth: false },
  { name: "Google Calendar", type: "google_calendar", domain: "operations", icon: "📅", description: "Meeting patterns, scheduling conflicts, time allocation", oauth: false },
  { name: "Voice", type: "voice", domain: "cs", icon: "🎙️", description: "Call transcripts, sentiment analysis, topic extraction", oauth: false },
  { name: "Mailchimp", type: "mailchimp", domain: "marketing", icon: "📧", description: "Campaign performance, open rates, click patterns", oauth: false },
  // Log ingestion (NB-019)
  { name: "CloudWatch Logs", type: "cloudwatch", domain: "engineering", icon: "☁️", description: "AWS CloudWatch log groups — errors, latency, Lambda/ECS traces", oauth: false },
  { name: "Datadog Logs", type: "datadog", domain: "engineering", icon: "🐶", description: "Datadog log indexes — service logs, APM traces, error clusters", oauth: false },
  { name: "ELK / OpenSearch", type: "elk", domain: "engineering", icon: "🔍", description: "Elasticsearch or OpenSearch log indexes — any structured log data", oauth: false },
  { name: "Generic Log Endpoint", type: "logs", domain: "engineering", icon: "📄", description: "Any HTTP endpoint returning JSON-lines or JSON array of log events", oauth: false },
  { name: "Generic API", type: "generic_api", domain: "any", icon: "🔌", description: "Custom webhook endpoints for any data source", oauth: false },
  // AAAS — Accounting connectors
  { name: "Xero", type: "xero", domain: "accounting", icon: "📘", description: "General ledger, invoices, bank feeds, GST — full accounting data sync", oauth: true },
  { name: "QuickBooks", type: "quickbooks", domain: "accounting", icon: "📗", description: "Chart of accounts, transactions, reports, payroll data", oauth: true },
] as const;

export default async function ConnectorsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      console.warn("[Connectors] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  // Fetch signal counts, all connectors, sync progress, and last brain training run in parallel
  const [signalsResult, connectorsResult, checkpointsResult, lastBrainRunResult] = await Promise.all([
    safe(supabase
      .from("cross_domain_signals")
      .select("source_domain")
      .eq("organization_id", orgId)),
    safe(supabase
      .from("org_connectors")
      .select("id, connector_type, instance_name, display_name, status, config, metadata, last_sync_at, signals_count, error_message, created_at")
      .eq("organization_id", orgId)),
    safe(supabase
      .from("connector_checkpoints")
      .select("connector_type, progress_pct, signals_ingested, status, state")
      .eq("organization_id", orgId)
      .eq("status", "in_progress")),
    // Last successful full brain cycle — used to show "Brain last trained X ago" on connector cards
    safe(supabase
      .from("scheduled_job_runs")
      .select("completed_at, job_type")
      .eq("organization_id", orgId)
      .eq("status", "success")
      .in("job_type", ["brain_cycle_full", "brain_cycle_sleep"])
      .order("completed_at", { ascending: false })
      .limit(1)),
  ]);

  const signals = signalsResult.data || [];
  const orgConnectors = connectorsResult.data || [];
  const checkpoints = checkpointsResult.data || [];
  const lastBrainRuns = lastBrainRunResult.data || [];
  const lastBrainTrainedAt: string | null =
    lastBrainRuns.length > 0 ? (lastBrainRuns[0] as { completed_at: string }).completed_at : null;

  // Count signals by domain
  const domainCounts: Record<string, number> = {};
  signals.forEach((s: { source_domain: string }) => {
    const domain = (s.source_domain || "unknown").toLowerCase();
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });

  // Build connector status map — keyed by connector_type for backward compat
  // When multiple instances of same type exist, last one wins in this map.
  // The connectors-client will also get the raw list for detailed display.
  const connectorStatusMap: Record<string, {
    id: string;
    status: string;
    config: Record<string, any>;
    metadata: Record<string, any>;
    lastSyncAt: string | null;
    signalsCount: number;
    errorMessage: string | null;
    createdAt: string;
    instanceName?: string;
    displayName?: string;
  }> = {};

  orgConnectors.forEach((c) => {
    connectorStatusMap[c.connector_type] = {
      id: c.id,
      status: c.status as string,
      config: c.config as Record<string, any>,
      metadata: c.metadata as Record<string, any>,
      lastSyncAt: c.last_sync_at,
      signalsCount: c.signals_count,
      errorMessage: c.error_message,
      createdAt: c.created_at,
      instanceName: (c as any).instance_name,
      displayName: (c as any).display_name,
    };
  });

  // Build sync progress map
  const syncProgressMap: Record<string, { progressPct: number; signalsIngested: number }> = {};
  checkpoints.forEach((cp) => {
    syncProgressMap[cp.connector_type] = {
      progressPct: cp.progress_pct,
      signalsIngested: cp.signals_ingested,
    };
  });

  // Active domains (have signals)
  const activeDomains = Object.keys(domainCounts);

  return (
    <ConnectorsClient
      connectors={CONNECTORS.map((c) => ({
        name: c.name,
        type: c.type,
        domain: c.domain,
        icon: c.icon,
        description: c.description,
        oauth: c.oauth,
      }))}
      domainCounts={domainCounts}
      activeDomains={activeDomains}
      connectorStatusMap={connectorStatusMap}
      syncProgressMap={syncProgressMap}
      totalSignals={signals.length}
      lastBrainTrainedAt={lastBrainTrainedAt}
    />
  );
}
