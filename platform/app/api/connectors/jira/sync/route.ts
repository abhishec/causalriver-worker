import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { createOutcomeOracle, createCausalMethodBandit, linkJiraToGitHub } from "@nexus-ai/memory-stack";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials, getConnectorCredentials } from "@/lib/connectors/get-credentials";

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
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }

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

    let connector: { id: string; connector_type: string; config: Record<string, unknown>; status: string; signals_count: number | null; credentials: Record<string, unknown> | null } | null = null;

    if (connectorId) {
      const { data: row } = await service
        .from("org_connectors")
        .select("id, connector_type, config, status, signals_count")
        .eq("organization_id", workspaceId)
        .eq("connector_type", "jira")
        .eq("id", connectorId)
        .maybeSingle();
      if (row) {
        const rawCreds = await getConnectorCredentials(service, workspaceId, "jira");
        connector = { ...row, config: (row.config as Record<string, unknown>) ?? {}, credentials: rawCreds };
      }
    } else {
      connector = await getConnectorWithCredentials(service, workspaceId, "jira");
    }

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
    } | null;

    const isBasicAuth = credentials?.auth_type === "basic";
    const isOAuth = !!credentials?.access_token;

    if (!isBasicAuth && !isOAuth) {
      return NextResponse.json(
        { error: "Jira credentials missing. Please re-authorize Jira or reconnect via the admin route." },
        { status: 400 }
      );
    }
    // credentials is guaranteed non-null at this point (either isBasicAuth or isOAuth is true)
    const nonNullCreds = credentials!;

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
    const siteUrl = body.siteUrl || config?.site_url || credentials?.site_url || config?.cloud_id || '';

    let signalsGenerated = 0;
    let recordsProcessed = 0;
    const errors: string[] = [];

    // ── SOURCE-AWARE SYNC ────────────────────────────────────────────────────
    // If connector has `sources` config (dashboard/board/plan), use source-type-
    // specific APIs. This is critical for Tookitaki where dashboards and boards
    // scope to specific releases, not all org-wide tickets.
    const sources = config?.sources as Array<{
      type: string; externalId: string; name?: string; url?: string; projectKey?: string;
    }> | undefined;

    // Auto-resolve projectKeys from stored connector config if not in request body
    const effectiveProjectKeys: string[] | undefined =
      projectKeys ??
      (config?.projectKeys as string[] | undefined);

    // Track which issue keys were already synced (dedup across board + project sources)
    const syncedIssueKeys = new Set<string>();
    const boardSources = (sources || []).filter((s) => s.type === 'board' && s.externalId);
    const dashboardSources = (sources || []).filter((s) => s.type === 'dashboard' && s.externalId);
    const planSources = (sources || []).filter((s) => s.type === 'plan' && s.externalId);

    try {
      // ── Phase A: Board-specific sync (Agile API) ────────────────────────────
      // Boards give us the EXACT issues the team is working on — most precise source.
      // Uses /rest/agile/1.0/board/{boardId}/issue which returns the board's backlog + active sprint.
      for (const board of boardSources) {
        try {
          logger.info(`[Jira sync] Fetching board ${board.externalId} issues via Agile API...`);

          // Fetch board issues — paginate to get all (Agile API max 50 per page)
          let startAt = 0;
          let boardIssues: any[] = [];
          let hasMore = true;
          while (hasMore) {
            const boardRes = await jiraFetch(
              nonNullCreds, siteUrl,
              `/rest/agile/1.0/board/${board.externalId}/issue?startAt=${startAt}&maxResults=50&fields=summary,description,comment,status,assignee,reporter,issuetype,priority,created,updated,resolutiondate,sprint,storyPoints,labels,components,fixVersions`
            );
            const issues = boardRes?.issues || [];
            boardIssues = boardIssues.concat(issues);
            startAt += issues.length;
            hasMore = issues.length === 50 && startAt < (boardRes?.total || 0);
            // Safety cap: 500 issues max per board
            if (startAt >= 500) break;
          }

          // Optional: filter by fixVersion even within board issues
          if (effectiveFixVersion) {
            boardIssues = boardIssues.filter((issue: any) => {
              const fv = issue.fields?.fixVersions || [];
              return fv.length === 0 || fv.some((v: any) => v.name?.includes(effectiveFixVersion));
            });
          }

          logger.info(`[Jira sync] Board ${board.externalId}: ${boardIssues.length} issues`);

          const signals = boardIssues.map((issue: any) => transformIssueToSignal(issue, workspaceId, board.projectKey));
          for (const i of boardIssues) syncedIssueKeys.add(i.key);

          if (signals.length > 0) {
            const { error: insertErr } = await service.from('cross_domain_signals').insert(signals);
            if (insertErr) errors.push(`board-${board.externalId}: ${insertErr.message}`);
            else signalsGenerated += signals.length;
          }
          recordsProcessed += boardIssues.length;

          // Cross-link board issues to GitHub PRs
          await linkIssuesToGitHub(service, workspaceId, boardIssues);
        } catch (boardErr: any) {
          logger.warn(`[Jira sync] Board ${board.externalId} Agile API failed, will fall back to project sync: ${boardErr.message}`);
          errors.push(`board-${board.externalId}: ${boardErr.message}`);
        }
      }

      // ── Phase B: Dashboard validation ────────────────────────────────────────
      // Dashboards don't have a direct "get issues" API, but we validate access
      // and extract any project keys from dashboard gadgets for scoping.
      for (const dash of dashboardSources) {
        try {
          const dashRes = await jiraFetch(nonNullCreds, siteUrl, `/rest/api/3/dashboard/${dash.externalId}`);
          logger.info(`[Jira sync] Dashboard "${dashRes?.name || dash.externalId}" validated ✓`);
        } catch (dashErr: any) {
          logger.warn(`[Jira sync] Dashboard ${dash.externalId} validation failed: ${dashErr.message}`);
          // Non-fatal — dashboard access isn't required for project-level sync
        }
      }

      // ── Phase C: Plan-based sync (Advanced Roadmaps) ─────────────────────────
      // Jira Advanced Roadmaps Plans are NOT boards — Plan ID ≠ Board ID.
      // The Plans REST API doesn't expose a direct "get issues in plan" endpoint.
      // Plans are a UI layer that groups issues from multiple projects by teams/releases.
      //
      // Strategy: Extract the plan's version context from the source name/URL,
      // then use JQL to fetch cross-project issues for that version.
      // The project-level sync (Phase D) handles this via fixVersion + projectKeys.
      for (const plan of planSources) {
        try {
          // Extract version from plan name (e.g. "Fincense 5.11.5 Plan/Timeline" → "5.11.5")
          const planVersion = plan.name?.match(/\d+\.\d+\.\d+/)?.[0] || effectiveFixVersion;
          const planProjectKeys = effectiveProjectKeys || [];

          if (planVersion && planProjectKeys.length > 0) {
            // Query plan-scoped issues via JQL — cross-project with fixVersion filter
            const projectClause = planProjectKeys.map((k) => `"${k}"`).join(', ');
            const jql = encodeURIComponent(
              `project IN (${projectClause}) AND fixVersion = "${planVersion}" AND updated >= ${jqlLookback} ORDER BY updated DESC`
            );
            const planRes = await jiraFetch(
              nonNullCreds, siteUrl,
              `/rest/api/3/search?jql=${jql}&maxResults=200&fields=summary,description,comment,status,assignee,reporter,issuetype,priority,created,updated,resolutiondate,sprint,storyPoints,labels,components,fixVersions`
            );
            const planIssues = (planRes?.issues || []).filter(
              (i: any) => !syncedIssueKeys.has(i.key)
            );

            if (planIssues.length > 0) {
              logger.info(`[Jira sync] Plan ${plan.externalId} (v${planVersion}): ${planIssues.length} new issues via JQL`);
              const signals = planIssues.map((issue: any) => transformIssueToSignal(issue, workspaceId));
              for (const i of planIssues) syncedIssueKeys.add(i.key);

              const { error: insertErr } = await service.from('cross_domain_signals').insert(signals);
              if (insertErr) errors.push(`plan-${plan.externalId}: ${insertErr.message}`);
              else signalsGenerated += signals.length;
              recordsProcessed += planIssues.length;

              await linkIssuesToGitHub(service, workspaceId, planIssues);
            } else {
              logger.info(`[Jira sync] Plan ${plan.externalId}: 0 new issues (all covered by board/project sync)`);
            }
          } else {
            logger.info(`[Jira sync] Plan ${plan.externalId}: No version/project context — will be covered by project-level sync`);
          }
        } catch (planErr: any) {
          logger.warn(`[Jira sync] Plan ${plan.externalId} sync failed: ${planErr.message} — falling back to project-level sync`);
        }
      }

      // ── Phase D: Project-level sync (standard REST API — catch-all) ─────────
      // Fetches all accessible projects, filtered by projectKeys + fixVersion.
      // Deduplicates against issues already synced from boards/plans above.
      const projectsRes = await jiraFetch(nonNullCreds, siteUrl, '/rest/api/3/project/search?maxResults=50');
      const projects = projectsRes?.values || [];

      for (const project of projects) {
        // Filter by projectKeys if provided (from request body OR stored config)
        if (effectiveProjectKeys && effectiveProjectKeys.length > 0 && !effectiveProjectKeys.includes(project.key)) {
          continue;
        }

        try {
          const fixVersionClause = effectiveFixVersion
            ? ` AND fixVersion = "${effectiveFixVersion}"`
            : "";
          const jql = encodeURIComponent(
            `project = "${project.key}"${fixVersionClause} AND updated >= ${jqlLookback} ORDER BY updated DESC`
          );
          const issuesRes = await jiraFetch(
            nonNullCreds, siteUrl,
            `/rest/api/3/search?jql=${jql}&maxResults=100&fields=summary,description,comment,status,assignee,reporter,issuetype,priority,created,updated,resolutiondate,sprint,storyPoints,labels,components,fixVersions`
          );

          // Dedup: skip issues already synced from board/plan sources
          const issues = (issuesRes?.issues || []).filter(
            (i: any) => !syncedIssueKeys.has(i.key)
          );

          const signals = issues.map((issue: any) =>
            transformIssueToSignal(issue, workspaceId, project.key, project.name)
          );
          for (const i of issues) syncedIssueKeys.add(i.key);

          if (signals.length > 0) {
            const { error: insertErr } = await service.from('cross_domain_signals').insert(signals);
            if (insertErr) errors.push(`${project.key}: ${insertErr.message}`);
            else signalsGenerated += signals.length;
          }

          recordsProcessed += issues.length;

          // Cross-link to GitHub
          await linkIssuesToGitHub(service, workspaceId, issues);
        } catch (projectErr: any) {
          errors.push(`${project.key}: ${projectErr.message}`);
        }
      }
    } catch (fetchErr: any) {
      errors.push(`Jira API: ${fetchErr.message}`);
    }

    logger.info(`[Jira sync] Total: ${signalsGenerated} signals from ${recordsProcessed} issues (${syncedIssueKeys.size} unique). Sources: ${boardSources.length} boards, ${dashboardSources.length} dashboards, ${planSources.length} plans + project catch-all.`);

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
        .or("source_domain.like.product%,source_domain.like.engineering%,source_domain.like.support%")
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
        logger.info(`[Jira sync] Oracle: ${result.predictionsVerified} verified, ${result.predictionsExpired} expired`);
      }
    } catch (oracleErr: any) {
      logger.warn("[Jira sync] Oracle error (non-fatal):", oracleErr.message);
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
    logger.error("Jira sync error:", err);
    return NextResponse.json(
      { error: "Internal error" },
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
 * Extract first 3 comment texts (truncated to 300 chars each).
 * Persisted in signal_metadata so cross-linking can work even if entity_links fails.
 */
function extractCommentExcerpts(commentField: any): string[] | null {
  const comments = commentField?.comments;
  if (!Array.isArray(comments) || comments.length === 0) return null;
  return comments.slice(0, 3).map((c: any) => {
    const text = typeof c.body === 'string' ? c.body : JSON.stringify(c.body ?? '');
    return text.slice(0, 300);
  });
}

/**
 * Transform a raw Jira issue into a Brain L1 signal.
 */
function transformIssueToSignal(
  issue: any,
  organizationId: string,
  projectKey?: string,
  projectName?: string,
): Record<string, any> {
  const fields = issue.fields || {};
  const pKey = projectKey || fields.project?.key || issue.key?.split('-')[0] || 'UNKNOWN';
  const pName = projectName || fields.project?.name || pKey;
  const isResolved = !!fields.resolutiondate;
  const cycleTimeHours = isResolved
    ? (new Date(fields.resolutiondate).getTime() - new Date(fields.created).getTime()) / 3600000
    : null;

  return {
    organization_id: organizationId,
    source_domain: 'product.jira',
    signal_type: isResolved ? 'ticket_resolved' : 'ticket_in_progress',
    signal_value: cycleTimeHours || 1,
    signal_timestamp: fields.updated || fields.created || new Date().toISOString(),
    entity_type: 'jira_issue',
    entity_id: issue.key,
    signal_metadata: {
      project_key: pKey,
      project_name: pName,
      issue_key: issue.key,
      summary: fields.summary,
      description: typeof fields.description === 'string'
        ? fields.description.slice(0, 800)
        : typeof fields.description === 'object' && fields.description
          ? JSON.stringify(fields.description).slice(0, 800)
          : null,
      status: fields.status?.name,
      status_category: fields.status?.statusCategory?.name,
      issue_type: fields.issuetype?.name,
      priority: fields.priority?.name,
      assignee: fields.assignee?.displayName || null,
      assignee_id: fields.assignee?.accountId || null,
      reporter: fields.reporter?.displayName || null,
      cycle_time_hours: cycleTimeHours,
      // Raw dates for audit trail + per-ticket cycle time analysis
      created_date: fields.created || null,
      resolved_date: fields.resolutiondate || null,
      story_points: fields.storyPoints || fields.customfield_10016 || null,
      sprint: fields.sprint?.name || null,
      sprint_id: fields.sprint?.id || null,
      labels: Array.isArray(fields.labels) ? fields.labels : [],
      components: Array.isArray(fields.components)
        ? fields.components.map((c: any) => c.name).filter(Boolean)
        : [],
      fix_versions: Array.isArray(fields.fixVersions)
        ? fields.fixVersions.map((v: any) => v.name).filter(Boolean)
        : [],
      // First 3 comment excerpts for cross-linking resilience (entity_links fallback)
      comment_excerpts: extractCommentExcerpts(fields.comment),
    },
    created_at: fields.resolutiondate || fields.updated || fields.created,
  };
}

/**
 * Back-link Jira issues → GitHub PRs referenced in descriptions/comments.
 * Non-fatal — failures here never block signal ingestion.
 */
async function linkIssuesToGitHub(supabase: any, workspaceId: string, issues: any[]) {
  for (const issue of issues) {
    try {
      const fields = issue.fields || {};
      const commentTexts: string[] = (fields.comment?.comments || []).map(
        (c: any) => (typeof c.body === 'string' ? c.body : JSON.stringify(c.body ?? ''))
      );
      await linkJiraToGitHub(supabase, workspaceId, {
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
        insight: `The most active projects in the last 90 days: ${topProjects.map(([k, c]) => `${k} (${c} tickets, ${total > 0 ? ((c/total)*100).toFixed(0) : '0'}%)`).join(", ")}. ${total > 0 && topProjects[0]?.[1] / total > 0.5 ? `${topProjects[0][0]} dominates — this project carries the most delivery risk.` : "Work is spread across multiple projects."}`,
        top_projects: topProjects.map(([key, count]) => ({ project_key: key, ticket_count: count, share: total > 0 ? count / total : 0 })),
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

  // ── 4. RELEASE READINESS SCORECARD ──────────────────────────────────────
  // This is the single most important pattern for design partner demos.
  // Pre-computes a release health summary that the brain context builder
  // AUTOMATICALLY includes in every copilot query. The copilot can then
  // reference this pre-built insight without needing to compute it on-the-fly.
  const byPriority: Record<string, { total: number; done: number; inProgress: number; todo: number }> = {};
  const byType: Record<string, number> = {};
  let totalDone = 0;
  let totalInProgress = 0;
  let totalTodo = 0;
  const blockers: string[] = [];

  for (const s of signals) {
    const m = s.signal_metadata || {};
    const priority = m.priority || 'Unknown';
    const statusCat = m.status_category || 'Unknown';
    const issueType = m.issue_type || 'Unknown';

    if (!byPriority[priority]) byPriority[priority] = { total: 0, done: 0, inProgress: 0, todo: 0 };
    byPriority[priority].total++;

    if (statusCat === 'Done') { byPriority[priority].done++; totalDone++; }
    else if (statusCat === 'In Progress') { byPriority[priority].inProgress++; totalInProgress++; }
    else { byPriority[priority].todo++; totalTodo++; }

    byType[issueType] = (byType[issueType] || 0) + 1;

    // Track blockers: high-priority items not done
    if ((priority === 'Highest' || priority === 'Blocker' || priority === 'Critical' || priority === 'High') && statusCat !== 'Done') {
      blockers.push(`${m.issue_key}: ${m.summary || 'No summary'} [${priority}/${m.status || '?'}]${m.assignee ? ` → ${m.assignee}` : ''}`);
    }
  }

  const total = signals.length;
  const completionRate = total > 0 ? ((totalDone / total) * 100).toFixed(0) : '0';
  const riskLevel = blockers.length > 5 ? 'HIGH' : blockers.length > 2 ? 'MEDIUM' : 'LOW';

  await supabase.from("ai_memory").upsert({
    organization_id: organizationId,
    memory_type: "pattern",
    domain: "product.release_readiness",
    content: JSON.stringify({
      title: "Release Readiness Scorecard",
      insight: `Release status: ${completionRate}% complete (${totalDone}/${total} tickets done, ${totalInProgress} in progress, ${totalTodo} to do). Risk level: ${riskLevel} — ${blockers.length} high-priority items still open.${blockers.length > 0 ? ` Top blockers: ${blockers.slice(0, 5).join('; ')}` : ' No blockers detected.'}`,
      completion_rate: parseFloat(completionRate),
      total_tickets: total,
      done: totalDone,
      in_progress: totalInProgress,
      todo: totalTodo,
      risk_level: riskLevel,
      blocker_count: blockers.length,
      blockers: blockers.slice(0, 10),
      by_priority: byPriority,
      by_type: byType,
    }),
    importance: 0.95, // Highest importance — used in every copilot query about releases
    metadata: { source: "jira_sync_derived" },
    created_at: new Date().toISOString(),
  }, { onConflict: "organization_id,memory_type,domain" });

  logger.info(`[Brain] Derived real Jira insights from ${signals.length} signals for org ${organizationId} — release readiness: ${completionRate}% (${riskLevel} risk, ${blockers.length} blockers)`);
}
