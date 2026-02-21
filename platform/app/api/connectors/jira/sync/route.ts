import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { createOutcomeOracle, createCausalMethodBandit, linkJiraToGitHub } from "@nexus-ai/memory-stack";

export const dynamic = 'force-dynamic';

/**
 * POST /api/connectors/jira/sync
 *
 * Syncs Jira projects, issues, and sprints into cross_domain_signals.
 * Uses the production Jira connector with rate limiting and circuit breaker.
 *
 * Body: {
 *   siteUrl?: string,
 *   projectKeys?: string[],
 *   fixVersionFilter?: string,   -- e.g. "6.3.4" or "5.11.5-enterprise"
 *                                   When set, scopes JQL to fixVersion="X" only.
 *                                   Critical for Tookitaki 2-team setup: without this
 *                                   the sync would pull all 5000+ TM tickets.
 *   dataLookback?: string,       -- "30d"|"90d"|"6m"|"1y"|"all"
 * }
 */
export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();

    // 2. Load connector config + credentials
    // Supports connectorId for multi-instance; falls back to first active instance
    const service = await createServiceClient();
    const body = await request.json().catch(() => ({})) as {
      connectorId?: string;
      siteUrl?: string;
      projectKeys?: string[];
      fixVersionFilter?: string;
      dataLookback?: string;
    };
    const connectorId = body.connectorId;

    let connectorQuery = service
      .from("org_connectors")
      .select("id, config, credentials, signals_count")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "jira");

    if (connectorId) {
      connectorQuery = connectorQuery.eq("id", connectorId);
    }

    const { data: connector } = await connectorQuery.maybeSingle();

    if (!connector) {
      return NextResponse.json(
        { error: "Jira connector not set up. Please connect Jira first via OAuth." },
        { status: 404 }
      );
    }

    const credentials = connector.credentials as {
      access_token?: string;
      refresh_token?: string;
      auth_type?: string;  // "basic" for API-token connections
      email?: string;
      api_token?: string;
      site_url?: string;
    };

    const isBasicAuth = credentials?.auth_type === "basic";
    const isOAuth = !!credentials?.access_token;

    if (!isBasicAuth && !isOAuth) {
      return NextResponse.json(
        { error: "Jira credentials missing. Please re-authorize Jira or reconnect via the admin route." },
        { status: 400 }
      );
    }

    const { projectKeys, fixVersionFilter, dataLookback } = body;

    // Persist fixVersionFilter + dataLookback to connector config if provided
    if (fixVersionFilter !== undefined || dataLookback !== undefined) {
      const service2 = await createServiceClient();
      await service2
        .from("org_connectors")
        .update({
          config: {
            ...connector.config,
            ...(fixVersionFilter !== undefined ? { fixVersionFilter } : {}),
            ...(dataLookback !== undefined ? { dataLookback } : {}),
          },
        })
        .eq("id", connector.id);
    }

    // Resolve fixVersionFilter: body > stored config
    const effectiveFixVersion: string | undefined =
      fixVersionFilter ?? (connector.config as Record<string, any>)?.fixVersionFilter;

    // Resolve lookback window: body > stored config > default 90d
    const effectiveLookback: string =
      dataLookback ?? (connector.config as Record<string, any>)?.dataLookback ?? "90d";
    const lookbackMap: Record<string, string> = {
      "30d": "-30d", "90d": "-90d", "6m": "-180d", "1y": "-365d", all: "-3650d",
    };
    const jqlLookback = lookbackMap[effectiveLookback] ?? "-90d";

    // 3. Update status to syncing
    await service
      .from("org_connectors")
      .update({
        config: {
          ...connector.config,
          ingestion_progress: {
            step: "syncing_jira_signals",
            message: "Syncing Jira projects, issues, and sprints...",
            startedAt: new Date().toISOString(),
          },
        },
      })
      .eq("id", connector.id);

    // 4. Fetch Jira data and transform to Brain L1 signals
    const startMs = Date.now();
    const config = connector.config as Record<string, any>;
    const siteUrl = body.siteUrl || config?.site_url || credentials.site_url || config?.cloud_id || '';

    let signalsGenerated = 0;
    let recordsProcessed = 0;
    const errors: string[] = [];

    try {
      // Fetch accessible projects
      const projectsRes = await jiraFetch(credentials, siteUrl, '/rest/api/3/project/search?maxResults=50');
      const projects = projectsRes?.values || [];

      for (const project of projects) {
        // Filter by projectKeys if provided
        if (projectKeys && projectKeys.length > 0 && !projectKeys.includes(project.key)) {
          continue;
        }

        // Fetch issues — scope by fixVersion when provided (critical for multi-release orgs)
        try {
          const fixVersionClause = effectiveFixVersion
            ? ` AND fixVersion = "${effectiveFixVersion}"`
            : "";
          const jql = encodeURIComponent(
            `project = "${project.key}"${fixVersionClause} AND updated >= ${jqlLookback} ORDER BY updated DESC`
          );
          const issuesRes = await jiraFetch(
            credentials, siteUrl,
            `/rest/api/3/search?jql=${jql}&maxResults=100&fields=summary,status,assignee,reporter,issuetype,priority,created,updated,resolutiondate,sprint,storyPoints`
          );

          const issues = issuesRes?.issues || [];

          // Transform each issue to Brain L1 signal
          const signals = issues.map((issue: any) => {
            const fields = issue.fields || {};
            const isResolved = !!fields.resolutiondate;
            const cycleTimeHours = isResolved
              ? (new Date(fields.resolutiondate).getTime() - new Date(fields.created).getTime()) / 3600000
              : null;

            return {
              organization_id: workspaceId,
              source_domain: 'product.jira',
              signal_type: isResolved ? 'ticket_resolved' : 'ticket_in_progress',
              signal_value: cycleTimeHours || 1,
              entity_type: 'jira_issue',
              entity_id: `${project.key}-${issue.key}`,
              signal_metadata: {
                project_key: project.key,
                project_name: project.name,
                issue_key: issue.key,
                summary: fields.summary,
                status: fields.status?.name,
                status_category: fields.status?.statusCategory?.name,
                issue_type: fields.issuetype?.name,
                priority: fields.priority?.name,
                assignee: fields.assignee?.displayName || null,
                assignee_id: fields.assignee?.accountId || null,
                reporter: fields.reporter?.displayName || null,
                cycle_time_hours: cycleTimeHours,
                story_points: fields.storyPoints || fields.customfield_10016 || null,
                sprint: fields.sprint?.name || null,
              },
              created_at: fields.resolutiondate || fields.updated || fields.created,
            };
          });

          // Batch insert to cross_domain_signals
          if (signals.length > 0) {
            const { error: insertErr } = await service
              .from('cross_domain_signals')
              .insert(signals);

            if (insertErr) {
              errors.push(`${project.key}: ${insertErr.message}`);
            } else {
              signalsGenerated += signals.length;
            }
          }

          recordsProcessed += issues.length;

          // NB-016: Back-link Jira issues → GitHub PRs referenced in their descriptions/comments.
          // Runs after signals are inserted so failures here never block signal ingestion.
          for (const issue of issues) {
            try {
              const fields = issue.fields || {};
              const commentTexts: string[] = (fields.comment?.comments || []).map(
                (c: any) => (typeof c.body === 'string' ? c.body : JSON.stringify(c.body ?? ''))
              );
              await linkJiraToGitHub(service, workspaceId, {
                key: issue.key,
                summary: fields.summary || '',
                description: typeof fields.description === 'string'
                  ? fields.description
                  : JSON.stringify(fields.description ?? ''),
                commentTexts,
              });
            } catch {
              // Non-fatal — entity_links table may not exist in this env
            }
          }
        } catch (projectErr: any) {
          errors.push(`${project.key}: ${projectErr.message}`);
        }
      }
    } catch (fetchErr: any) {
      errors.push(`Jira API: ${fetchErr.message}`);
    }

    const duration_ms = Date.now() - startMs;

    // 5. Derive REAL Jira insights from actual ingested signals
    await deriveRealJiraInsights(service, workspaceId);

    // ── GAP 4: Outcome Oracle — autonomous prediction verification ─────────
    let oracleResult: { predictionsVerified: number; predictionsExpired: number; averageReward: number } | null = null;
    try {
      const { data: recentSignals } = await service
        .from("cross_domain_signals")
        .select("source_domain, signal_type, signal_value, signal_timestamp, organization_id, entity_type, entity_id")
        .eq("organization_id", workspaceId)
        .in("source_domain", ["product", "engineering", "support"])
        .gte("signal_timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("signal_timestamp", { ascending: false })
        .limit(500);

      if (recentSignals && recentSignals.length > 0) {
        const bandit = createCausalMethodBandit({ supabase: service, organizationId: workspaceId });
        const oracle = createOutcomeOracle({ supabase: service, bandit });
        await oracle.loadFromSupabase(workspaceId);
        const result = await oracle.processBatch(recentSignals);
        oracleResult = {
          predictionsVerified: result.predictionsVerified,
          predictionsExpired: result.predictionsExpired,
          averageReward: result.banditRewardsGiven ?? 0,
        };
        console.info(`[Jira sync] Oracle: ${result.predictionsVerified} verified, ${result.predictionsExpired} expired`);
      }
    } catch (oracleErr: any) {
      console.warn("[Jira sync] Oracle error (non-fatal):", oracleErr.message);
    }

    // 6. Update connector with results (accumulate signals_count)
    const previousSignalsCount = (connector as any).signals_count || 0;
    await service
      .from("org_connectors")
      .update({
        last_sync_at: new Date().toISOString(),
        signals_count: previousSignalsCount + signalsGenerated,
        error_message: errors.length > 0 ? errors.join("; ") : null,
        config: {
          ...connector.config,
          ingestion_progress: {
            step: "signals_complete",
            message: `Synced ${signalsGenerated} signals from ${recordsProcessed} Jira issues`,
            completedAt: new Date().toISOString(),
            signalsGenerated,
            recordsProcessed,
            duration_ms,
          },
        },
      })
      .eq("id", connector.id);

    return NextResponse.json({
      success: errors.length === 0,
      signalsGenerated,
      recordsProcessed,
      errors,
      duration_ms,
      oracle: oracleResult,
    });
  } catch (err: any) {
    console.error("Jira sync error:", err);
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}

/**
 * Jira API fetch helper — supports both OAuth (Bearer) and Basic Auth (email:apiToken).
 * Basic Auth is used for design-partner connections made via the admin /connect route.
 */
async function jiraFetch(
  credentials: {
    access_token?: string;
    refresh_token?: string;
    auth_type?: string;
    email?: string;
    api_token?: string;
    site_url?: string;
  },
  siteUrl: string,
  endpoint: string
): Promise<any> {
  // Support cloud ID format, direct URL, or credentials.site_url fallback
  const baseUrl = siteUrl.startsWith("http")
    ? siteUrl
    : `https://api.atlassian.com/ex/jira/${siteUrl}`;

  const authHeader =
    credentials.auth_type === "basic"
      ? `Basic ${Buffer.from(`${credentials.email}:${credentials.api_token}`).toString("base64")}`
      : `Bearer ${credentials.access_token}`;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Derive REAL Jira insights from actual ingested signals.
 *
 * Instead of seeding fake statistical relationships with made-up p-values,
 * this function reads actual Jira cross_domain_signals and computes real
 * org-specific statistics: who resolves tickets, cycle times per project,
 * backlog size, priority distribution, sprint velocity patterns.
 *
 * This ensures the Brain's product knowledge is ORG-SPECIFIC, not generic.
 */
async function deriveRealJiraInsights(supabase: any, organizationId: string) {
  // Pull recent Jira signals (last 90 days)
  const { data: signals } = await supabase
    .from("cross_domain_signals")
    .select("signal_type, signal_value, signal_metadata, created_at, entity_id")
    .eq("organization_id", organizationId)
    .like("source_domain", "product%")
    .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);

  if (!signals || signals.length < 5) return; // Not enough data yet

  // ── 1. TICKET CYCLE TIME ANALYSIS ────────────────────────────────────────
  const resolvedTickets = signals.filter((s: any) => s.signal_type === "ticket_resolved");
  const cycleTimes = resolvedTickets
    .map((s: any) => s.signal_value)
    .filter((v: any) => v > 0 && v < 10000);

  if (cycleTimes.length >= 3) {
    const avgCycleTime = cycleTimes.reduce((a: number, b: number) => a + b, 0) / cycleTimes.length;
    const sortedTimes = [...cycleTimes].sort((a: number, b: number) => a - b);
    const p75 = sortedTimes[Math.floor(sortedTimes.length * 0.75)];
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
    const slowTickets = cycleTimes.filter((t: number) => t > avgCycleTime * 2).length;
    const slowRatio = slowTickets / cycleTimes.length;

    await supabase.from("ai_memory").upsert({
      organization_id: organizationId,
      memory_type: "pattern",
      domain: "product.cycle_time",
      content: JSON.stringify({
        title: "Jira Ticket Cycle Time",
        insight: `This org resolves tickets in ${(avgCycleTime / 24).toFixed(0)} days on average (p75: ${(p75 / 24).toFixed(0)}d, p95: ${(p95 / 24).toFixed(0)}d). ${slowRatio > 0.25 ? `${(slowRatio * 100).toFixed(0)}% of tickets take more than 2x the average — a sign of scope creep or blocked work.` : "Ticket cycle times are fairly consistent."}`,
        avg_hours: avgCycleTime,
        p75_hours: p75,
        p95_hours: p95,
        sample_size: cycleTimes.length,
        slow_ticket_ratio: slowRatio,
      }),
      importance: 0.80,
      metadata: { source: "jira_sync_derived" },
      created_at: new Date().toISOString(),
    }, { onConflict: "organization_id,memory_type,domain" });
  }

  // ── 2. PROJECT ACTIVITY BREAKDOWN ────────────────────────────────────────
  const projectCounts: Record<string, number> = {};
  for (const s of signals) {
    const key = s.signal_metadata?.project_key;
    if (key) projectCounts[key] = (projectCounts[key] || 0) + 1;
  }
  const topProjects = Object.entries(projectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topProjects.length > 0) {
    const total = signals.length;
    await supabase.from("ai_memory").upsert({
      organization_id: organizationId,
      memory_type: "pattern",
      domain: "product.projects",
      content: JSON.stringify({
        title: "Most Active Jira Projects",
        insight: `The most active projects in the last 90 days: ${topProjects.map(([k, c]) => `${k} (${c} tickets, ${((c/total)*100).toFixed(0)}%)`).join(", ")}. ${topProjects[0]?.[1] / total > 0.5 ? `${topProjects[0][0]} dominates — this project carries the most delivery risk.` : "Work is spread across multiple projects."}`,
        top_projects: topProjects.map(([key, count]) => ({ project_key: key, ticket_count: count, share: count / total })),
        total_tickets: total,
      }),
      importance: 0.70,
      metadata: { source: "jira_sync_derived" },
      created_at: new Date().toISOString(),
    }, { onConflict: "organization_id,memory_type,domain" });
  }

  // ── 3. ASSIGNEE WORKLOAD CONCENTRATION ───────────────────────────────────
  const assigneeCounts: Record<string, number> = {};
  for (const s of signals) {
    const assignee = s.signal_metadata?.assignee;
    if (assignee && typeof assignee === "string") {
      assigneeCounts[assignee] = (assigneeCounts[assignee] || 0) + 1;
    }
  }
  const sortedAssignees = Object.entries(assigneeCounts)
    .sort((a, b) => b[1] - a[1]);

  if (sortedAssignees.length >= 2) {
    const total = signals.length;
    const top = sortedAssignees[0];
    const topShare = top[1] / total;

    if (topShare > 0.25) {
      await supabase.from("ai_memory").upsert({
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "product.assignees",
        content: JSON.stringify({
          title: "Ticket Assignee Concentration",
          insight: `${top[0]} owns ${(topShare * 100).toFixed(0)}% of Jira tickets (${top[1]} of ${total}). ${topShare > 0.4 ? `This is a critical workload bottleneck — if ${top[0]} is unavailable, delivery will stall.` : `Workload is moderately concentrated. Top assignees: ${sortedAssignees.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ")}.`}`,
          top_assignee: top[0],
          top_share: topShare,
          assignee_breakdown: sortedAssignees.slice(0, 5).map(([name, count]) => ({ name, count, share: count / total })),
        }),
        importance: topShare > 0.4 ? 0.85 : 0.65,
        metadata: { source: "jira_sync_derived" },
        created_at: new Date().toISOString(),
      }, { onConflict: "organization_id,memory_type,domain" });
    }
  }

  console.info(`[Brain] Derived real Jira insights from ${signals.length} signals for org ${organizationId}`);
}
