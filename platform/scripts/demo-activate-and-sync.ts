/* eslint-disable no-console */
/**
 * Demo Execution Script: Activate Connectors & Trigger Full Sync
 *
 * Usage:
 *   GITHUB_PAT=ghp_xxx JIRA_EMAIL=you@company.com JIRA_API_TOKEN=xxx \
 *     npx tsx scripts/demo-activate-and-sync.ts
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - seed-users.ts already run (Tookitaki customer + users)
 *   - seed-tookitaki-demo.ts already run (2 workspaces + pending connectors)
 *
 * What this script does:
 *   1. Activates all GitHub connectors with the provided PAT
 *   2. Activates all Jira connectors with the provided email + API token
 *   3. Triggers GitHub sync for each repo (pulls PRs, reviews, commits, CI/CD)
 *   4. Triggers Jira sync for each workspace (pulls tickets, sprints)
 *   5. Triggers brain cycle for each workspace (builds causal graph)
 *   6. Verifies data readiness (signal counts, pattern counts, edge counts)
 *
 * This runs entirely server-side using the service role key.
 * No browser session or auth required.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GITHUB_PAT = process.env.GITHUB_PAT || process.env.GH_TOKEN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_SITE_URL = process.env.JIRA_SITE_URL || "https://tookitaki.atlassian.net";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Step 1: Validate credentials ──────────────────────────────────────────

async function validateGitHubToken(token: string): Promise<boolean> {
  console.log("\n🔑 Validating GitHub PAT...");
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexusBrain-Demo",
    },
  });
  if (res.ok) {
    const user = await res.json();
    console.log(`  ✅ GitHub PAT valid — authenticated as ${user.login}`);
    return true;
  }
  console.error(`  ❌ GitHub PAT invalid — status ${res.status}`);
  return false;
}

async function validateJiraToken(email: string, token: string, siteUrl: string): Promise<boolean> {
  console.log("\n🔑 Validating Jira credentials...");
  const basicAuth = Buffer.from(`${email}:${token}`).toString("base64");
  const res = await fetch(`${siteUrl}/rest/api/3/myself`, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
    },
  });
  if (res.ok) {
    const user = await res.json();
    console.log(`  ✅ Jira credentials valid — authenticated as ${user.displayName}`);
    return true;
  }
  console.error(`  ❌ Jira credentials invalid — status ${res.status}`);
  return false;
}

// ─── Step 2: Activate connectors ───────────────────────────────────────────

async function activateGitHubConnectors(token: string) {
  console.log("\n📦 Activating GitHub connectors...");

  const { data: connectors } = await supabase
    .from("org_connectors")
    .select("id, organization_id, config, status, instance_name")
    .eq("connector_type", "github")
    .in("status", ["pending", "error"]);

  if (!connectors?.length) {
    console.log("  ⚠️  No pending GitHub connectors found");
    return [];
  }

  const activated = [];
  for (const conn of connectors) {
    const config = conn.config as Record<string, any>;
    const repos = config?.repositories || [];

    // For multi-repo connectors (from seed script), create one connector per repo
    if (repos.length > 0) {
      for (const repo of repos) {
        // Validate the repo is accessible
        const repoRes = await fetch(
          `https://api.github.com/repos/${repo.owner}/${repo.name}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "NexusBrain-Demo",
            },
          }
        );

        if (!repoRes.ok) {
          console.log(`  ⚠️  Repo ${repo.owner}/${repo.name} not accessible (${repoRes.status}) — skipping`);
          continue;
        }

        const repoData = await repoRes.json();
        const instanceName = `${repo.owner}/${repo.name}`;

        // Upsert the connector for this specific repo
        const { error } = await supabase
          .from("org_connectors")
          .upsert({
            organization_id: conn.organization_id,
            connector_type: "github",
            instance_name: instanceName,
            display_name: instanceName,
            status: "active",
            credentials: { token, access_token: token },
            config: {
              owner: repo.owner,
              repo: repo.name,
              repoFullName: repoData.full_name,
              defaultBranch: repoData.default_branch,
              repoLanguage: repoData.language,
              repoSize: repoData.size,
              isPrivate: repoData.private,
              trackedBranches: [repo.branch],
              dataLookback: "90d",
              tokenHint: `****${token.slice(-4)}`,
              connectedAt: new Date().toISOString(),
              connectedBy: "demo-script",
            },
          }, { onConflict: "organization_id,connector_type,instance_name" });

        if (error) {
          console.error(`  ❌ Failed to activate ${instanceName}:`, error.message);
        } else {
          console.log(`  ✅ Activated GitHub connector: ${instanceName} @ ${repo.branch}`);
          activated.push({ orgId: conn.organization_id, instanceName, owner: repo.owner, repo: repo.name, branch: repo.branch });
        }
      }

      // Remove the original "pending" multi-repo connector if separate ones were created
      if (activated.length > 0 && conn.status === "pending") {
        await supabase.from("org_connectors").delete().eq("id", conn.id);
      }
    } else {
      // Single repo connector — just update credentials and status
      const { error } = await supabase
        .from("org_connectors")
        .update({
          status: "active",
          credentials: { token, access_token: token },
        })
        .eq("id", conn.id);

      if (error) {
        console.error(`  ❌ Failed to activate connector ${conn.id}:`, error.message);
      } else {
        console.log(`  ✅ Activated GitHub connector: ${conn.instance_name || conn.id}`);
        activated.push({ orgId: conn.organization_id, connectorId: conn.id });
      }
    }
  }

  return activated;
}

async function activateJiraConnectors(email: string, apiToken: string, siteUrl: string) {
  console.log("\n📋 Activating Jira connectors...");

  const { data: connectors } = await supabase
    .from("org_connectors")
    .select("id, organization_id, config, status")
    .eq("connector_type", "jira")
    .in("status", ["pending", "error"]);

  if (!connectors?.length) {
    console.log("  ⚠️  No pending Jira connectors found");
    return [];
  }

  const siteName = siteUrl.replace(/^https?:\/\//, "");
  const activated = [];

  for (const conn of connectors) {
    const config = conn.config as Record<string, any>;

    const { error } = await supabase
      .from("org_connectors")
      .update({
        status: "active",
        instance_name: siteName,
        display_name: siteName,
        credentials: {
          auth_type: "basic",
          email,
          api_token: apiToken,
          site_url: siteUrl,
        },
        metadata: {
          site_url: siteUrl,
          site_name: siteName,
          connection_method: "basic_auth",
          connected_at: new Date().toISOString(),
          connected_by: "demo-script",
        },
        config: {
          ...config,
          site_url: siteUrl,
          site_name: siteName,
          auth_type: "basic",
        },
      })
      .eq("id", conn.id);

    if (error) {
      console.error(`  ❌ Failed to activate Jira connector ${conn.id}:`, error.message);
    } else {
      console.log(`  ✅ Activated Jira connector for org ${conn.organization_id}`);
      activated.push({ orgId: conn.organization_id, connectorId: conn.id, config });
    }
  }

  return activated;
}

// ─── Step 3: GitHub Sync (direct — no auth required) ───────────────────────

async function syncGitHubRepo(
  orgId: string,
  owner: string,
  repo: string,
  branch: string,
  token: string
) {
  console.log(`\n  🔄 Syncing GitHub ${owner}/${repo} @ ${branch}...`);
  const startMs = Date.now();

  try {
    // Use the memory-stack GitHub connector directly
    const { createGitHubConnector } = await import("@nexus-ai/memory-stack");

    const github = createGitHubConnector({
      token,
      owner,
      repo,
      trackedBranches: [branch],
      dataLookback: "90d",
      syncScope: {
        pulls: true,
        reviews: true,
        fileChanges: true,
        workflows: true,
        issues: true,
        commits: true,
        jobDetails: true,
      },
    });

    const syncResult = await github.fullSync(supabase, orgId);
    const duration = ((Date.now() - startMs) / 1000).toFixed(1);

    console.log(`    ✅ Synced: ${syncResult.signalsGenerated} signals from ${syncResult.recordsProcessed} records (${duration}s)`);
    if (syncResult.errors?.length > 0) {
      console.log(`    ⚠️  Errors: ${syncResult.errors.join("; ")}`);
    }

    // Update connector stats
    const { data: conn } = await supabase
      .from("org_connectors")
      .select("id, signals_count")
      .eq("organization_id", orgId)
      .eq("connector_type", "github")
      .eq("instance_name", `${owner}/${repo}`)
      .maybeSingle();

    if (conn) {
      await supabase
        .from("org_connectors")
        .update({
          last_sync_at: new Date().toISOString(),
          signals_count: (conn.signals_count || 0) + syncResult.signalsGenerated,
        })
        .eq("id", conn.id);
    }

    return syncResult;
  } catch (err: any) {
    console.error(`    ❌ Sync failed: ${err.message}`);
    return { signalsGenerated: 0, recordsProcessed: 0, errors: [err.message] };
  }
}

// ─── Step 4: Jira Sync (direct — no auth required) ────────────────────────

async function syncJiraForOrg(
  orgId: string,
  connectorConfig: Record<string, any>,
  email: string,
  apiToken: string,
  siteUrl: string
) {
  console.log(`\n  🔄 Syncing Jira for org ${orgId}...`);
  const startMs = Date.now();

  try {
    const basicAuth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const authHeaders = { Authorization: `Basic ${basicAuth}`, Accept: "application/json" };

    const projectKeys = connectorConfig.projectKeys as string[] | undefined;
    const fixVersionFilter = connectorConfig.fixVersionFilter || connectorConfig.sources?.[0]?.name?.match(/\d+\.\d+\.\d+/)?.[0];
    const sources = (connectorConfig.sources || []) as Array<{
      type: string; externalId: string; name?: string; url?: string; projectKey?: string;
    }>;

    let signalsGenerated = 0;
    let recordsProcessed = 0;
    const errors: string[] = [];
    const syncedIssueKeys = new Set<string>();

    // Helper: transform issue to signal
    const issueToSignal = (issue: any, projKey?: string, projName?: string) => {
      const fields = issue.fields || {};
      const pKey = projKey || fields.project?.key || issue.key?.split("-")[0] || "UNKNOWN";
      const pName = projName || fields.project?.name || pKey;
      const isResolved = !!fields.resolutiondate;
      const cycleTimeHours = isResolved
        ? (new Date(fields.resolutiondate).getTime() - new Date(fields.created).getTime()) / 3600000
        : null;
      return {
        organization_id: orgId,
        source_domain: "product.jira",
        signal_type: isResolved ? "ticket_resolved" : "ticket_in_progress",
        signal_value: cycleTimeHours || 1,
        entity_type: "jira_issue",
        entity_id: `${pKey}-${issue.key}`,
        signal_metadata: {
          project_key: pKey, project_name: pName, issue_key: issue.key,
          summary: fields.summary,
          description: typeof fields.description === "string"
            ? fields.description.slice(0, 800)
            : typeof fields.description === "object" && fields.description
              ? JSON.stringify(fields.description).slice(0, 800)
              : null,
          status: fields.status?.name,
          status_category: fields.status?.statusCategory?.name,
          issue_type: fields.issuetype?.name,
          priority: fields.priority?.name,
          assignee: fields.assignee?.displayName || null,
          reporter: fields.reporter?.displayName || null,
          cycle_time_hours: cycleTimeHours,
          created_date: fields.created || null,
          resolved_date: fields.resolutiondate || null,
          story_points: fields.storyPoints || fields.story_points || null,
          sprint: fields.sprint?.name || null,
          sprint_id: fields.sprint?.id || null,
          labels: Array.isArray(fields.labels) ? fields.labels : [],
          components: Array.isArray(fields.components)
            ? fields.components.map((c: any) => c.name).filter(Boolean) : [],
          fix_versions: Array.isArray(fields.fixVersions)
            ? fields.fixVersions.map((v: any) => v.name).filter(Boolean) : [],
          comment_excerpts: (() => {
            const comments = fields.comment?.comments;
            if (!Array.isArray(comments) || comments.length === 0) return null;
            return comments.slice(0, 3).map((c: any) => {
              const text = typeof c.body === "string" ? c.body : JSON.stringify(c.body ?? "");
              return text.slice(0, 300);
            });
          })(),
        },
        created_at: fields.resolutiondate || fields.updated || fields.created,
      };
    };

    // ── Phase A: Board-specific sync (Agile API) ─────────────────────────
    const boardSources = sources.filter((s) => s.type === "board" && s.externalId);
    for (const board of boardSources) {
      try {
        console.log(`    🎯 Fetching board ${board.externalId} via Agile API...`);
        let startAt = 0;
        let boardIssues: any[] = [];
        let hasMore = true;
        while (hasMore) {
          const boardRes = await fetch(
            `${siteUrl}/rest/agile/1.0/board/${board.externalId}/issue?startAt=${startAt}&maxResults=50&fields=summary,description,comment,status,assignee,reporter,issuetype,priority,created,updated,resolutiondate,sprint,storyPoints,labels,components,fixVersions`,
            { headers: authHeaders }
          );
          if (!boardRes.ok) throw new Error(`Board API ${boardRes.status}`);
          const boardData = await boardRes.json();
          const issues = boardData?.issues || [];
          boardIssues = boardIssues.concat(issues);
          startAt += issues.length;
          hasMore = issues.length === 50 && startAt < (boardData?.total || 0);
          if (startAt >= 500) break;
        }

        // Optional fixVersion filter within board issues
        if (fixVersionFilter) {
          boardIssues = boardIssues.filter((issue: any) => {
            const fv = issue.fields?.fixVersions || [];
            return fv.length === 0 || fv.some((v: any) => v.name?.includes(fixVersionFilter));
          });
        }

        console.log(`    📋 Board ${board.externalId}: ${boardIssues.length} issues`);
        const signals = boardIssues.map((i: any) => issueToSignal(i, board.projectKey));
        for (const i of boardIssues) syncedIssueKeys.add(i.key);

        if (signals.length > 0) {
          const { error: insertErr } = await supabase.from("cross_domain_signals").insert(signals);
          if (insertErr) errors.push(`board-${board.externalId}: ${insertErr.message}`);
          else signalsGenerated += signals.length;
        }
        recordsProcessed += boardIssues.length;
      } catch (boardErr: any) {
        console.log(`    ⚠️  Board ${board.externalId} Agile API failed: ${boardErr.message} — will fall back to project sync`);
        errors.push(`board-${board.externalId}: ${boardErr.message}`);
      }
    }

    // ── Phase B: Dashboard validation ────────────────────────────────────
    const dashboardSources = sources.filter((s) => s.type === "dashboard" && s.externalId);
    for (const dash of dashboardSources) {
      try {
        const dashRes = await fetch(
          `${siteUrl}/rest/api/3/dashboard/${dash.externalId}`,
          { headers: authHeaders }
        );
        if (dashRes.ok) {
          const dashData = await dashRes.json();
          console.log(`    📊 Dashboard "${dashData?.name || dash.externalId}" validated ✓`);
        } else {
          console.log(`    ⚠️  Dashboard ${dash.externalId}: ${dashRes.status} — non-fatal`);
        }
      } catch {
        // Non-fatal
      }
    }

    // ── Phase C: Project-level sync (catch-all with dedup) ───────────────
    const projectsRes = await fetch(
      `${siteUrl}/rest/api/3/project/search?maxResults=50`,
      { headers: authHeaders }
    );

    if (!projectsRes.ok) {
      throw new Error(`Jira project fetch failed: ${projectsRes.status}`);
    }

    const projectsData = await projectsRes.json();
    const projects = projectsData.values || [];

    for (const project of projects) {
      if (projectKeys && projectKeys.length > 0 && !projectKeys.includes(project.key)) {
        continue;
      }

      try {
        const fixVersionClause = fixVersionFilter
          ? ` AND fixVersion = "${fixVersionFilter}"`
          : "";
        const jql = encodeURIComponent(
          `project = "${project.key}"${fixVersionClause} AND updated >= -90d ORDER BY updated DESC`
        );
        const issuesRes = await fetch(
          `${siteUrl}/rest/api/3/search?jql=${jql}&maxResults=100&fields=summary,description,comment,status,assignee,reporter,issuetype,priority,created,updated,resolutiondate,sprint,storyPoints,labels,components,fixVersions`,
          { headers: authHeaders }
        );

        if (!issuesRes.ok) {
          const errText = await issuesRes.text().catch(() => issuesRes.statusText);
          errors.push(`${project.key}: HTTP ${issuesRes.status} — ${errText}`);
          continue;
        }

        const issuesData = await issuesRes.json();
        // Dedup: skip issues already synced from board phase
        const issues = (issuesData.issues || []).filter((i: any) => !syncedIssueKeys.has(i.key));

        const signals = issues.map((issue: any) => issueToSignal(issue, project.key, project.name));
        for (const i of issues) syncedIssueKeys.add(i.key);

        if (signals.length > 0) {
          const { error: insertErr } = await supabase.from("cross_domain_signals").insert(signals);
          if (insertErr) errors.push(`${project.key}: ${insertErr.message}`);
          else signalsGenerated += signals.length;
        }

        recordsProcessed += issues.length;
        console.log(`    📋 ${project.key}: ${issues.length} new issues → ${signals.length} signals`);

        // Link Jira issues to GitHub PRs
        try {
          const { linkJiraToGitHub } = await import("@nexus-ai/memory-stack");
          for (const issue of issues) {
            const fields = issue.fields || {};
            const commentTexts: string[] = (fields.comment?.comments || []).map(
              (c: any) => (typeof c.body === "string" ? c.body : JSON.stringify(c.body ?? ""))
            );
            await linkJiraToGitHub(supabase, orgId, {
              key: issue.key,
              summary: fields.summary || "",
              description: typeof fields.description === "string"
                ? fields.description
                : JSON.stringify(fields.description ?? ""),
              commentTexts,
            });
          }
        } catch {
          // Non-fatal
        }
      } catch (projectErr: any) {
        errors.push(`${project.key}: ${projectErr.message}`);
      }
    }

    // Update connector stats
    const { data: conn } = await supabase
      .from("org_connectors")
      .select("id, signals_count")
      .eq("organization_id", orgId)
      .eq("connector_type", "jira")
      .maybeSingle();

    if (conn) {
      await supabase
        .from("org_connectors")
        .update({
          last_sync_at: new Date().toISOString(),
          signals_count: (conn.signals_count || 0) + signalsGenerated,
        })
        .eq("id", conn.id);
    }

    const duration = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`    ✅ Jira sync: ${signalsGenerated} signals from ${recordsProcessed} issues, ${syncedIssueKeys.size} unique (${duration}s)`);
    console.log(`       Sources: ${boardSources.length} boards, ${dashboardSources.length} dashboards + project catch-all. fixVersion=${fixVersionFilter || 'all'}, projectKeys=[${(projectKeys || []).join(',')}]`);
    if (errors.length > 0) {
      console.log(`    ⚠️  Errors: ${errors.join("; ")}`);
    }

    return { signalsGenerated, recordsProcessed, errors };
  } catch (err: any) {
    console.error(`    ❌ Jira sync failed: ${err.message}`);
    return { signalsGenerated: 0, recordsProcessed: 0, errors: [err.message] };
  }
}

// ─── Step 5: Brain Cycle ─────────────────────────────────────────────────────
// The Neural Cortex Controller requires the full Next.js server context
// (cognitive stack config, deep layers, pipeline). Instead of replicating that
// here, this step verifies signal counts and tells the user to trigger the
// brain cycle via the running server after the dev server is started.
//
// The brain cycle will be triggered during the demo via:
//   POST http://localhost:3001/api/brain/cycle { mode: "full" }

async function verifyBrainReadiness(orgId: string) {
  console.log(`\n  🧠 Checking brain readiness for org ${orgId}...`);

  const { count: signalCount } = await supabase
    .from("cross_domain_signals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const { count: patternCount } = await supabase
    .from("ai_memory")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("memory_type", "pattern");

  const { count: edgeCount } = await supabase
    .from("causal_relationships_statistical")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  console.log(`    Signals: ${signalCount || 0}`);
  console.log(`    Patterns: ${patternCount || 0} (from sync-derived insights)`);
  console.log(`    Causal edges: ${edgeCount || 0}`);

  if ((signalCount || 0) > 0) {
    console.log(`    ✅ Brain has data — ready for cycle. Trigger via POST /api/brain/cycle after starting dev server.`);
  } else {
    console.log(`    ⚠️  No signals yet — sync must complete before brain cycle.`);
  }

  return { signalCount: signalCount || 0, patternCount: patternCount || 0, edgeCount: edgeCount || 0 };
}

// ─── Step 6: Verification ──────────────────────────────────────────────────

async function verifyWorkspaceData(orgId: string, orgName: string) {
  console.log(`\n  📊 Verifying data for "${orgName}"...`);

  const { count: signalCount } = await supabase
    .from("cross_domain_signals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const { count: ghSignals } = await supabase
    .from("cross_domain_signals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .like("source_domain", "engineering%");

  const { count: jiraSignals } = await supabase
    .from("cross_domain_signals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("source_domain", "product.jira");

  const { count: patternCount } = await supabase
    .from("ai_memory")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("memory_type", "pattern");

  const { count: edgeCount } = await supabase
    .from("causal_relationships_statistical")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  let entityLinks = 0;
  try {
    const { count } = await supabase
      .from("entity_links")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    entityLinks = count || 0;
  } catch {
    // entity_links table may not exist
  }

  const { count: connectorCount } = await supabase
    .from("org_connectors")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "active");

  console.log(`    Total signals:       ${signalCount || 0}`);
  console.log(`    GitHub signals:      ${ghSignals || 0}`);
  console.log(`    Jira signals:        ${jiraSignals || 0}`);
  console.log(`    Patterns:            ${patternCount || 0}`);
  console.log(`    Causal edges:        ${edgeCount || 0}`);
  console.log(`    Entity links:        ${entityLinks || 0}`);
  console.log(`    Active connectors:   ${connectorCount || 0}`);

  const ready = (signalCount || 0) > 0 && (patternCount || 0) > 0;
  console.log(`    Status:              ${ready ? "✅ READY FOR DEMO" : "⚠️  NOT READY — needs more data"}`);

  return {
    signals: signalCount || 0,
    ghSignals: ghSignals || 0,
    jiraSignals: jiraSignals || 0,
    patterns: patternCount || 0,
    edges: edgeCount || 0,
    entityLinks: entityLinks || 0,
    ready,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   BrainOS Demo Execution — Activate, Sync & Verify        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Pre-flight checks
  if (!GITHUB_PAT) {
    console.error("❌ GITHUB_PAT env var not set. Set it and re-run:");
    console.error("   GITHUB_PAT=ghp_xxx npx tsx scripts/demo-activate-and-sync.ts");
    process.exit(1);
  }
  if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
    console.warn("⚠️  JIRA_EMAIL or JIRA_API_TOKEN not set — Jira sync will be skipped");
  }

  // ── 1. Validate tokens ──────────────────────────────────────────────────
  const ghValid = await validateGitHubToken(GITHUB_PAT);
  if (!ghValid) {
    console.error("❌ Cannot proceed without valid GitHub PAT");
    process.exit(1);
  }

  let jiraValid = false;
  if (JIRA_EMAIL && JIRA_API_TOKEN) {
    jiraValid = await validateJiraToken(JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE_URL);
  }

  // ── 2. Find workspaces ──────────────────────────────────────────────────
  console.log("\n🏢 Finding Tookitaki workspaces...");
  const { data: workspaces } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .like("slug", "tookitaki-fincense%");

  if (!workspaces?.length) {
    console.error("❌ No Tookitaki workspaces found. Run seed-tookitaki-demo.ts first.");
    process.exit(1);
  }

  for (const ws of workspaces) {
    console.log(`  📁 ${ws.name} (${ws.id})`);
  }

  // ── 3. Activate connectors ──────────────────────────────────────────────
  const activatedGH = await activateGitHubConnectors(GITHUB_PAT);
  let activatedJira: any[] = [];
  if (jiraValid && JIRA_EMAIL && JIRA_API_TOKEN) {
    activatedJira = await activateJiraConnectors(JIRA_EMAIL, JIRA_API_TOKEN, JIRA_SITE_URL);
  }

  // ── 4. Sync GitHub repos ────────────────────────────────────────────────
  console.log("\n\n═══ Phase 2: GitHub Sync ═══════════════════════════════════\n");

  for (const ws of workspaces) {
    console.log(`\n📁 Workspace: ${ws.name}`);

    // Get active GitHub connectors for this workspace
    const { data: ghConnectors } = await supabase
      .from("org_connectors")
      .select("id, config, instance_name")
      .eq("organization_id", ws.id)
      .eq("connector_type", "github")
      .eq("status", "active");

    if (!ghConnectors?.length) {
      console.log("  ⚠️  No active GitHub connectors — skipping");
      continue;
    }

    for (const conn of ghConnectors) {
      const config = conn.config as Record<string, any>;
      if (config?.owner && config?.repo) {
        await syncGitHubRepo(
          ws.id,
          config.owner,
          config.repo,
          config.trackedBranches?.[0] || config.defaultBranch || "main",
          GITHUB_PAT
        );
      }
    }
  }

  // ── 5. Sync Jira ────────────────────────────────────────────────────────
  if (jiraValid && JIRA_EMAIL && JIRA_API_TOKEN) {
    console.log("\n\n═══ Phase 3: Jira Sync ════════════════════════════════════\n");

    for (const ws of workspaces) {
      console.log(`\n📁 Workspace: ${ws.name}`);

      const { data: jiraConn } = await supabase
        .from("org_connectors")
        .select("id, config")
        .eq("organization_id", ws.id)
        .eq("connector_type", "jira")
        .eq("status", "active")
        .maybeSingle();

      if (!jiraConn) {
        console.log("  ⚠️  No active Jira connector — skipping");
        continue;
      }

      await syncJiraForOrg(
        ws.id,
        jiraConn.config as Record<string, any>,
        JIRA_EMAIL,
        JIRA_API_TOKEN,
        JIRA_SITE_URL
      );
    }
  }

  // ── 6. Brain readiness check ─────────────────────────────────────────────
  console.log("\n\n═══ Phase 4: Brain Readiness ══════════════════════════════\n");

  for (const ws of workspaces) {
    console.log(`\n📁 Workspace: ${ws.name}`);
    await verifyBrainReadiness(ws.id);
  }

  // ── 7. Verification ─────────────────────────────────────────────────────
  console.log("\n\n═══ Phase 5: Verification ═════════════════════════════════\n");

  const results = [];
  for (const ws of workspaces) {
    const result = await verifyWorkspaceData(ws.id, ws.name);
    results.push({ ...ws, ...result });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    DEMO READINESS REPORT                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let allReady = true;
  for (const r of results) {
    const status = r.ready ? "✅ READY" : "❌ NOT READY";
    console.log(`${r.name}: ${status}`);
    console.log(`  Signals: ${r.signals} (GH: ${r.ghSignals}, Jira: ${r.jiraSignals})`);
    console.log(`  Patterns: ${r.patterns} | Causal Edges: ${r.edges} | Links: ${r.entityLinks}`);
    console.log();
    if (!r.ready) allReady = false;
  }

  if (allReady) {
    console.log("🎉 ALL WORKSPACES READY FOR DEMO!\n");
    console.log("Demo steps:");
    console.log("  1. Login at http://localhost:3001 as abhishek@tookitaki.com");
    console.log("  2. Switch to workspace: Tookitaki Fincense Release 5.11.5");
    console.log("  3. Go to /copilot → Ask about P0 requirements");
    console.log("  4. Switch to workspace: Tookitaki Fincense Release 6.3.4");
    console.log("  5. Repeat — compare results across workspaces");
    console.log();
  } else {
    console.log("⚠️  Some workspaces need attention before the demo.\n");
    console.log("Troubleshooting:");
    console.log("  - Check GitHub PAT has 'repo' scope");
    console.log("  - Check Jira API token has read:jira-work permission");
    console.log("  - Verify repos are accessible: curl -H 'Authorization: Bearer $GITHUB_PAT' https://api.github.com/repos/tookitaki/product-amls");
    console.log("  - Re-run this script after fixing credentials");
    console.log();
  }
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
