/* eslint-disable no-console */
/**
 * Seed Script: Tookitaki Demo — Two Workspaces
 *
 * Usage: npx tsx scripts/seed-tookitaki-demo.ts
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - seed-users.ts already run (Tookitaki customer + users exist)
 *
 * Creates:
 *   Workspace 1: "Tookitaki Fincense Release 5.11.5"
 *     └── Repos: product-amls (prerelease/v5.11.5-enterprise), product-dss (prerelease/v5.11.5-enterprise)
 *     └── Jira: Dashboard 10398, Plan 108
 *
 *   Workspace 2: "Tookitaki Fincense Release 6.3.4"
 *     └── Repos: product-dss (prerelease/v6.3.4), product-amls (prerelease/v6.3.4), gladiator-2.0 (prerelease/v6.3.4)
 *     └── Jira: Board 544, Dashboard 10431
 *
 * Both workspaces inherit all existing Tookitaki customer members (abhishek, jeeta, yuan).
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TOOKITAKI_CUSTOMER_ID = "a1000000-0000-4000-a000-000000000001";

// ─── Workspace Definitions ──────────────────────────────────────────────────

interface WorkspaceDef {
  name: string;
  slug: string;
  releaseVersion: string;
  repos: Array<{
    owner: string;
    name: string;
    branch: string;
    url: string;
  }>;
  jira: Array<{
    type: "dashboard" | "board" | "plan";
    name: string;
    url: string;
    externalId: string;
    projectKey?: string; // extracted from URL (e.g. FIN from projects/FIN/boards/544)
  }>;
  jiraProjectKeys?: string[];      // explicit project keys to scope sync
  jiraFixVersionFilter?: string;   // e.g. "5.11.5" — scopes JQL to fixVersion="X"
}

const WORKSPACES: WorkspaceDef[] = [
  {
    name: "Tookitaki Fincense Release 5.11.5",
    slug: "tookitaki-fincense-5-11-5",
    releaseVersion: "5.11.5",
    jiraProjectKeys: ["FIN"],        // Fincense project
    jiraFixVersionFilter: "5.11.5",  // Scope to 5.11.5 release tickets only
    repos: [
      {
        owner: "tookitaki",
        name: "product-amls",
        branch: "prerelease/v5.11.5-enterprise",
        url: "https://github.com/tookitaki/product-amls",
      },
      {
        owner: "tookitaki",
        name: "product-dss",
        branch: "prerelease/v5.11.5-enterprise",
        url: "https://github.com/tookitaki/product-dss",
      },
    ],
    jira: [
      {
        type: "dashboard",
        name: "Fincense 5.11.5 Dashboard",
        url: "https://tookitaki.atlassian.net/jira/dashboards/10398",
        externalId: "10398",
      },
      {
        type: "plan",
        name: "Fincense 5.11.5 Plan/Timeline",
        url: "https://tookitaki.atlassian.net/jira/plans/108/scenarios/108/timeline?vid=137",
        externalId: "108",
        // Plan 108 = Advanced Roadmaps — sync extracts issues from plan's cross-project scope
      },
    ],
  },
  {
    name: "Tookitaki Fincense Release 6.3.4",
    slug: "tookitaki-fincense-6-3-4",
    releaseVersion: "6.3.4",
    jiraProjectKeys: ["FIN"],        // Fincense project (from board URL: projects/FIN/boards/544)
    jiraFixVersionFilter: "6.3.4",   // Scope to 6.3.4 release tickets only
    repos: [
      {
        owner: "tookitaki",
        name: "product-dss",
        branch: "prerelease/v6.3.4",
        url: "https://github.com/tookitaki/product-dss",
      },
      {
        owner: "tookitaki",
        name: "product-amls",
        branch: "prerelease/v6.3.4",
        url: "https://github.com/tookitaki/product-amls",
      },
      {
        owner: "tookitaki",
        name: "gladiator-2.0",
        branch: "prerelease/v6.3.4",
        url: "https://github.com/tookitaki/gladiator-2.0",
      },
    ],
    jira: [
      {
        type: "board",
        name: "Fincense FIN Board",
        url: "https://tookitaki.atlassian.net/jira/software/c/projects/FIN/boards/544",
        externalId: "544",
        projectKey: "FIN",  // Extracted from: projects/FIN/boards/544
      },
      {
        type: "dashboard",
        name: "Fincense 6.3.4 Dashboard",
        url: "https://tookitaki.atlassian.net/jira/dashboards/10431",
        externalId: "10431",
      },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findOrCreateWorkspace(def: WorkspaceDef) {
  // Check if workspace already exists by slug
  const { data: existing } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", def.slug)
    .maybeSingle();

  if (existing) {
    console.log(`  [exists] Workspace "${def.name}" (${existing.id})`);
    return existing;
  }

  // Create new workspace
  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      id: randomUUID(),
      name: def.name,
      slug: def.slug,
      plan: "enterprise",
      customer_id: TOOKITAKI_CUSTOMER_ID,
      settings: {
        releaseVersion: def.releaseVersion,
        branchName: def.repos[0]?.branch || null,
        industry: "AML Compliance Software",
        description: `Tookitaki Fincense v${def.releaseVersion} release workspace`,
        createdBy: "seed-tookitaki-demo.ts",
        createdAt: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error) {
    console.error(`  [error] Failed to create workspace "${def.name}":`, error.message);
    return null;
  }

  console.log(`  [created] Workspace "${def.name}" (${org.id})`);
  return org;
}

async function syncCustomerMembersToOrg(orgId: string) {
  // Get all Tookitaki customer members
  const { data: customerMembers } = await supabase
    .from("customer_members")
    .select("user_id, role, is_platform_admin")
    .eq("customer_id", TOOKITAKI_CUSTOMER_ID);

  if (!customerMembers?.length) {
    console.warn("  [warn] No customer members found for Tookitaki — run seed-users.ts first!");
    return 0;
  }

  let added = 0;
  for (const cm of customerMembers) {
    const { data: existing } = await supabase
      .from("org_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", cm.user_id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("org_members").insert({
        organization_id: orgId,
        user_id: cm.user_id,
        role: cm.role,
        is_platform_admin: cm.is_platform_admin,
      });

      if (!error) {
        added++;
        console.log(`    [added] org_member ${cm.user_id} as ${cm.role}`);
      } else {
        console.error(`    [error] org_member ${cm.user_id}:`, error.message);
      }
    } else {
      console.log(`    [exists] org_member ${cm.user_id}`);
    }
  }

  return added;
}

async function seedGitHubConnectors(orgId: string, repos: WorkspaceDef["repos"]) {
  // Create GitHub connector record for the workspace
  const { data: existingConnector } = await supabase
    .from("org_connectors")
    .select("id")
    .eq("organization_id", orgId)
    .eq("connector_type", "github")
    .maybeSingle();

  let connectorId = existingConnector?.id;

  if (!existingConnector) {
    const { data: connector, error } = await supabase
      .from("org_connectors")
      .insert({
        organization_id: orgId,
        connector_type: "github",
        status: "pending", // Needs GitHub PAT to activate
        config: {
          repositories: repos.map((r) => ({
            owner: r.owner,
            name: r.name,
            branch: r.branch,
            url: r.url,
            fullName: `${r.owner}/${r.name}`,
          })),
          note: "GitHub PAT required — run sync after providing token",
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error(`    [error] GitHub connector:`, error.message);
      return;
    }
    connectorId = connector.id;
    console.log(`    [created] GitHub connector (${connectorId}) — ${repos.length} repos configured`);
  } else {
    // Update config with repos
    await supabase
      .from("org_connectors")
      .update({
        config: {
          repositories: repos.map((r) => ({
            owner: r.owner,
            name: r.name,
            branch: r.branch,
            url: r.url,
            fullName: `${r.owner}/${r.name}`,
          })),
        },
      })
      .eq("id", connectorId);
    console.log(`    [exists] GitHub connector (${connectorId}) — repos updated`);
  }

  // Seed individual repo records in tracked_repositories (if table exists)
  for (const repo of repos) {
    const { error } = await supabase
      .from("tracked_repositories")
      .upsert(
        {
          organization_id: orgId,
          connector_id: connectorId,
          full_name: `${repo.owner}/${repo.name}`,
          owner: repo.owner,
          name: repo.name,
          default_branch: repo.branch,
          url: repo.url,
          is_active: true,
        },
        { onConflict: "organization_id,full_name" }
      );

    if (error && !error.message.includes("does not exist")) {
      console.error(`    [error] tracked_repo ${repo.owner}/${repo.name}:`, error.message);
    } else if (!error) {
      console.log(`    [upserted] tracked_repo: ${repo.owner}/${repo.name} @ ${repo.branch}`);
    }
  }
}

async function seedJiraConnectors(
  orgId: string,
  jiraItems: WorkspaceDef["jira"],
  projectKeys?: string[],
  fixVersionFilter?: string,
) {
  const { data: existingConnector } = await supabase
    .from("org_connectors")
    .select("id")
    .eq("organization_id", orgId)
    .eq("connector_type", "jira")
    .maybeSingle();

  // Auto-extract project keys from board URLs (e.g. projects/FIN/boards/544 → "FIN")
  const extractedProjectKeys = new Set<string>(projectKeys || []);
  for (const j of jiraItems) {
    if (j.projectKey) extractedProjectKeys.add(j.projectKey);
    const boardMatch = j.url.match(/projects\/([A-Z][A-Z0-9]+)\/boards/);
    if (boardMatch) extractedProjectKeys.add(boardMatch[1]);
  }

  const connectorConfig = {
    siteUrl: "https://tookitaki.atlassian.net",
    sources: jiraItems.map((j) => ({
      type: j.type,
      name: j.name,
      url: j.url,
      externalId: j.externalId,
      projectKey: j.projectKey || null,
    })),
    // These are CRITICAL for scoping the sync to the right release
    projectKeys: extractedProjectKeys.size > 0 ? [...extractedProjectKeys] : undefined,
    fixVersionFilter: fixVersionFilter || undefined,
    note: "Jira API token required — run sync after providing token",
  };

  if (!existingConnector) {
    const { data: connector, error } = await supabase
      .from("org_connectors")
      .insert({
        organization_id: orgId,
        connector_type: "jira",
        status: "pending",
        config: connectorConfig,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`    [error] Jira connector:`, error.message);
      return;
    }
    console.log(`    [created] Jira connector (${connector.id}) — ${jiraItems.length} sources, projectKeys=[${[...extractedProjectKeys].join(',')}], fixVersion=${fixVersionFilter || 'all'}`);
  } else {
    await supabase
      .from("org_connectors")
      .update({ config: connectorConfig })
      .eq("id", existingConnector.id);
    console.log(`    [exists] Jira connector (${existingConnector.id}) — sources updated, projectKeys=[${[...extractedProjectKeys].join(',')}], fixVersion=${fixVersionFilter || 'all'}`);
  }
}

async function seedS3Connector(orgId: string) {
  const { data: existing } = await supabase
    .from("org_connectors")
    .select("id")
    .eq("organization_id", orgId)
    .eq("connector_type", "s3-storage")
    .maybeSingle();

  if (!existing) {
    await supabase.from("org_connectors").insert({
      organization_id: orgId,
      connector_type: "s3-storage",
      status: "active",
      config: {
        bucket: process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data",
        region: process.env.AWS_REGION || "ap-southeast-1",
        prefix: orgId,
        purpose: "Org-level file storage (CSV, JSON, reports)",
      },
    });
    console.log(`    [created] S3 storage connector`);
  } else {
    console.log(`    [exists] S3 storage connector`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Tookitaki Demo Seed: Two Workspaces ===\n");

  // Verify Tookitaki customer exists
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", TOOKITAKI_CUSTOMER_ID)
    .single();

  if (!customer) {
    console.error("Tookitaki customer not found! Run seed-users.ts first.");
    process.exit(1);
  }
  console.log(`Customer: ${customer.name} (${customer.id})\n`);

  for (const wsDef of WORKSPACES) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Workspace: ${wsDef.name}`);
    console.log(`${"─".repeat(60)}`);

    // 1. Create workspace
    const org = await findOrCreateWorkspace(wsDef);
    if (!org) continue;

    // 2. Sync customer members → org members
    console.log("\n  Members:");
    const added = await syncCustomerMembersToOrg(org.id);
    console.log(`    Total: ${added} new members synced`);

    // 3. Seed connectors
    console.log("\n  Connectors:");
    await seedS3Connector(org.id);
    await seedGitHubConnectors(org.id, wsDef.repos);
    await seedJiraConnectors(org.id, wsDef.jira, wsDef.jiraProjectKeys, wsDef.jiraFixVersionFilter);
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(60)}`);
  console.log("DEMO SETUP SUMMARY");
  console.log(`${"═".repeat(60)}\n`);

  for (const wsDef of WORKSPACES) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", wsDef.slug)
      .single();

    if (org) {
      const { count: memberCount } = await supabase
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id);

      const { count: connectorCount } = await supabase
        .from("org_connectors")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id);

      console.log(`${org.name}`);
      console.log(`  ID:          ${org.id}`);
      console.log(`  Slug:        ${org.slug}`);
      console.log(`  Members:     ${memberCount}`);
      console.log(`  Connectors:  ${connectorCount}`);
      console.log(`  Repos:       ${wsDef.repos.map((r) => `${r.owner}/${r.name}@${r.branch}`).join(", ")}`);
      console.log(`  Jira:        ${wsDef.jira.map((j) => j.name).join(", ")}`);
      console.log();
    }
  }

  console.log("NEXT STEPS:");
  console.log("  1. Provide GitHub PAT (repo scope) for tookitaki org");
  console.log("  2. Provide Jira API token for tookitaki.atlassian.net");
  console.log("  3. Update connector status to 'active' with tokens");
  console.log("  4. Trigger GitHub sync: POST /api/connectors/github/sync");
  console.log("  5. Trigger Jira sync: POST /api/connectors/jira/sync");
  console.log("  6. Trigger brain cycle: POST /api/brain/cycle");
  console.log("  7. Verify data in portal for both workspaces");
  console.log();
}

main().catch(console.error);
