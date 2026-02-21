/**
 * Workspace Provisioning — Server-Side
 * ════════════════════════════════════════════════════════════════════
 * Full workspace provisioning — called when a new workspace is
 * created from the admin panel, onboarding, or API.
 *
 * Split of responsibilities:
 *   DB Trigger `provision_new_org()` (fires automatically on INSERT):
 *     → storage_config, brain_cortex_state, org_settings,
 *       federation_config, scheduled_jobs (3 jobs)
 *
 *   This module (server-side, called explicitly):
 *     → Verifies all DB trigger provisions exist (and backfills if missing)
 *     → S3 prefix + .org-manifest.json
 *     → s3-storage connector in org_connectors
 *     → Selected connectors (pending status, need OAuth)
 *     → customer_members → org_members sync
 *     → Release entity (if branchName/releaseVersion given)
 *     → Returns full audit report of what was created vs already existed
 */

import { getOrgStorage, isS3Configured } from "@/lib/storage/org-storage";
import { createServiceClient }           from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────

export interface ProvisionResult {
  success:     boolean;
  workspaceId: string;
  audit: {
    // DB trigger provisions (auto on INSERT — we verify/backfill)
    storage_config:       "created" | "existed" | "failed";
    brain_cortex_state:   "created" | "existed" | "failed";
    org_settings:         "created" | "existed" | "failed";
    federation_config:    "created" | "existed" | "failed";
    scheduled_jobs:       number;   // count of jobs (should be 3)

    // Server-side provisions
    s3_prefix:            "created" | "existed" | "skipped" | "failed";
    s3_connector:         "created" | "existed" | "failed";
    selected_connectors:  string[];

    // Membership sync
    members_synced:       number;

    // Optional
    release_entity:       "created" | "skipped" | "failed";
  };
  errors:  string[];
  warnings: string[];
}

export interface ProvisionOptions {
  selectedConnectors?: string[];
  branchName?:         string;
  releaseVersion?:     string;
  customerId?:         string;   // if provided, syncs customer_members → org_members
  createdByEmail?:     string;
}

// ── Constants ──────────────────────────────────────────────────────

const CORE_WORKSPACE_ID = "00000000-0000-4000-a000-000000000001";

// ── Main Provisioning Function ─────────────────────────────────────

export async function provisionWorkspace(
  workspaceId: string,
  options?: ProvisionOptions,
): Promise<ProvisionResult> {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const result: ProvisionResult = {
    success: true,
    workspaceId,
    audit: {
      storage_config:      "failed",
      brain_cortex_state:  "failed",
      org_settings:        "failed",
      federation_config:   "failed",
      scheduled_jobs:      0,
      s3_prefix:           "failed",
      s3_connector:        "failed",
      selected_connectors: [],
      members_synced:      0,
      release_entity:      "skipped",
    },
    errors:  [],
    warnings: [],
  };

  const service = await createServiceClient();

  // ── 0. Ensure storage_config is set on the workspace row ────────
  try {
    const { data: ws } = await service
      .from("organizations")
      .select("storage_config")
      .eq("id", workspaceId)
      .single();

    const hasConfig = ws?.storage_config && Object.keys(ws.storage_config).length > 0;

    if (!hasConfig) {
      await service.from("organizations").update({
        storage_config: {
          s3: {
            bucket:  process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data",
            region:  process.env.AWS_REGION         || "ap-southeast-1",
            prefix:  workspaceId,
            enabled: true,
          },
        },
      }).eq("id", workspaceId);
      result.audit.storage_config = "created";
    } else {
      result.audit.storage_config = "existed";
    }
  } catch (err) {
    errors.push(`storage_config: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 1. Brain Cortex State ──────────────────────────────────────────
  try {
    const { data: existing } = await service
      .from("brain_cortex_state")
      .select("id")
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!existing) {
      const { error } = await service.from("brain_cortex_state").insert({
        organization_id: workspaceId,
        cycle_count:     0,
        last_mode:       "awake_full",
      });
      if (error) throw error;
      result.audit.brain_cortex_state = "created";
    } else {
      result.audit.brain_cortex_state = "existed";
    }
  } catch (err) {
    errors.push(`brain_cortex_state: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Org Settings ────────────────────────────────────────────────
  try {
    const { data: existing } = await service
      .from("org_settings")
      .select("id")
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!existing) {
      const { error } = await service.from("org_settings").insert({
        organization_id: workspaceId,
      });
      if (error) throw error;
      result.audit.org_settings = "created";
    } else {
      result.audit.org_settings = "existed";
    }
  } catch (err) {
    errors.push(`org_settings: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Federation Config ───────────────────────────────────────────
  try {
    const { data: existing } = await service
      .from("federation_config")
      .select("id")
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!existing) {
      const isCore = workspaceId === CORE_WORKSPACE_ID;
      const { error } = await service.from("federation_config").insert({
        organization_id:         workspaceId,
        enabled:                 true,
        upstream_org_id:         isCore ? null : CORE_WORKSPACE_ID,
        auto_pull_enabled:       !isCore,
        auto_pull_interval_hours: 24,
        auto_promote_enabled:    !isCore,
        auto_promote_threshold:  0.75,
      });
      if (error) throw error;
      result.audit.federation_config = "created";
    } else {
      result.audit.federation_config = "existed";
    }
  } catch (err) {
    errors.push(`federation_config: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. Scheduled Jobs (3 required) ────────────────────────────────
  const JOBS = [
    { job_name: "autonomous-learning", job_type: "learning",      schedule: "0 */6 * * *" },
    { job_name: "consolidation",       job_type: "consolidation", schedule: "0 2 * * 0"   },
    { job_name: "calibration-review",  job_type: "calibration",   schedule: "0 3 * * 1"   },
  ];

  try {
    for (const job of JOBS) {
      await service.from("scheduled_jobs").upsert(
        { organization_id: workspaceId, ...job, enabled: true },
        { onConflict: "organization_id,job_name", ignoreDuplicates: true }
      );
    }

    const { count } = await service
      .from("scheduled_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", workspaceId);

    result.audit.scheduled_jobs = count ?? 0;
    if ((count ?? 0) < 3) warnings.push(`Only ${count} of 3 scheduled jobs present`);
  } catch (err) {
    errors.push(`scheduled_jobs: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 5. S3 Prefix + .org-manifest.json ────────────────────────────
  if (isS3Configured()) {
    try {
      const storage       = getOrgStorage();
      const manifestExists = await storage.exists(workspaceId, ".org-manifest.json");

      if (!manifestExists) {
        await storage.upload(
          workspaceId,
          ".org-manifest.json",
          JSON.stringify({
            workspaceId,
            createdAt:    new Date().toISOString(),
            version:      1,
            provisionedBy: options?.createdByEmail || "admin-panel",
          }, null, 2),
          { contentType: "application/json" }
        );
        result.audit.s3_prefix = "created";
      } else {
        result.audit.s3_prefix = "existed";
      }
    } catch (err) {
      warnings.push(`S3 prefix: ${err instanceof Error ? err.message : String(err)}`);
      result.audit.s3_prefix = "failed";
    }
  } else {
    warnings.push("S3 not configured — skipping prefix creation");
    result.audit.s3_prefix = "skipped";
  }

  // ── 6. s3-storage Connector ───────────────────────────────────────
  try {
    const { data: existingS3 } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "s3-storage")
      .maybeSingle();

    if (!existingS3) {
      const { error } = await service.from("org_connectors").insert({
        organization_id: workspaceId,
        connector_type:  "s3-storage",
        status:          "active",
        config: {
          bucket:        process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data",
          region:        process.env.AWS_REGION         || "ap-southeast-1",
          prefix:        workspaceId,
          purpose:       "Workspace-level file storage (CSV, JSON, reports)",
          provisionedBy: "auto-provision",
        },
      });
      if (error) throw error;
      result.audit.s3_connector = "created";
    } else {
      result.audit.s3_connector = "existed";
    }
  } catch (err) {
    errors.push(`s3-connector: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 7. Selected Connectors (pending — need OAuth) ─────────────────
  const selectedConnectors = options?.selectedConnectors || [];
  for (const connectorType of selectedConnectors) {
    if (connectorType === "s3-storage") continue;
    try {
      await service.from("org_connectors").upsert(
        {
          organization_id: workspaceId,
          connector_type:  connectorType,
          instance_name:   "default",
          display_name:    connectorType,
          status:          "pending",
          config: {
            registeredAt:  new Date().toISOString(),
            registeredBy:  options?.createdByEmail || "admin-panel",
            needsOAuth:    true,
          },
        },
        { onConflict: "organization_id,connector_type,instance_name", ignoreDuplicates: true }
      );
      result.audit.selected_connectors.push(connectorType);
    } catch (err) {
      warnings.push(`${connectorType}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 8. Sync customer_members → org_members ───────────────────────
  const customerId = options?.customerId;
  if (customerId) {
    try {
      const { data: custMembers } = await service
        .from("customer_members")
        .select("user_id, role, is_platform_admin")
        .eq("customer_id", customerId);

      let synced = 0;
      for (const m of (custMembers || [])) {
        const { error } = await service.from("org_members").upsert(
          {
            organization_id:  workspaceId,
            user_id:          m.user_id,
            role:             m.role,
            is_platform_admin: m.is_platform_admin,
          },
          { onConflict: "organization_id,user_id", ignoreDuplicates: true }
        );
        if (!error) synced++;
      }
      result.audit.members_synced = synced;
    } catch (err) {
      warnings.push(`member sync: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 9. Release Entity (optional) ──────────────────────────────────
  if (options?.branchName || options?.releaseVersion) {
    try {
      await service.from("release_entities").insert({
        organization_id: workspaceId,
        release_name:    options.releaseVersion || options.branchName,
        release_type:    "enterprise",
        branch_name:     options.branchName || `release/${options.releaseVersion}`,
        status:          "planned",
        metadata: {
          createdFrom: "admin-workspace-create",
          createdBy:   options.createdByEmail || "admin",
        },
      });
      result.audit.release_entity = "created";
    } catch (err) {
      // non-fatal — table may not exist in all environments
      warnings.push(`release_entity: ${err instanceof Error ? err.message : String(err)}`);
      result.audit.release_entity = "failed";
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────
  result.errors   = errors;
  result.warnings = warnings;
  result.success  = errors.length === 0;

  logger.debug(
    `[Provision] Workspace ${workspaceId}: ${result.success ? "✓ SUCCESS" : "⚠ PARTIAL"}\n` +
    `  storage_config=${result.audit.storage_config}\n` +
    `  brain_cortex=${result.audit.brain_cortex_state}\n` +
    `  org_settings=${result.audit.org_settings}\n` +
    `  federation=${result.audit.federation_config}\n` +
    `  scheduled_jobs=${result.audit.scheduled_jobs}/3\n` +
    `  s3_prefix=${result.audit.s3_prefix}\n` +
    `  s3_connector=${result.audit.s3_connector}\n` +
    `  connectors=[${result.audit.selected_connectors.join(",")}]\n` +
    `  members_synced=${result.audit.members_synced}\n` +
    `  release_entity=${result.audit.release_entity}` +
    (errors.length   ? `\n  ERRORS: ${errors.join("; ")}`     : "") +
    (warnings.length ? `\n  WARNINGS: ${warnings.join("; ")}` : "")
  );

  return result;
}

// ── Audit only (no mutations) — check what's missing ──────────────

export async function auditWorkspace(workspaceId: string): Promise<{
  workspaceId: string;
  missing: string[];
  present: string[];
  healthy: boolean;
}> {
  const service = await createServiceClient();
  const missing: string[] = [];
  const present: string[] = [];

  const checks: Array<{ name: string; table: string }> = [
    { name: "brain_cortex_state", table: "brain_cortex_state" },
    { name: "org_settings",       table: "org_settings"       },
    { name: "federation_config",  table: "federation_config"  },
  ];

  for (const check of checks) {
    const { data } = await service
      .from(check.table as any)
      .select("id")
      .eq("organization_id", workspaceId)
      .maybeSingle();
    if (data) present.push(check.name); else missing.push(check.name);
  }

  const { count: jobCount } = await service
    .from("scheduled_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", workspaceId);

  if ((jobCount ?? 0) >= 3) present.push(`scheduled_jobs(${jobCount})`);
  else missing.push(`scheduled_jobs(only ${jobCount ?? 0}/3)`);

  const { data: s3 } = await service
    .from("org_connectors")
    .select("id")
    .eq("organization_id", workspaceId)
    .eq("connector_type", "s3-storage")
    .maybeSingle();
  if (s3) present.push("s3-storage-connector"); else missing.push("s3-storage-connector");

  return { workspaceId, missing, present, healthy: missing.length === 0 };
}

/* ── Backward compat aliases ─────────────────────────────────────────── */

/** @deprecated Use provisionWorkspace() instead */
export const provisionOrg = provisionWorkspace;

/** @deprecated Use auditWorkspace() instead */
export const auditOrg = auditWorkspace;
