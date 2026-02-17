/**
 * Org Provisioning — Server-Side
 * ================================
 * Handles the S3 + connector provisioning that can't be done from a DB trigger.
 * Called during onboarding Step 3 via POST /api/org/provision.
 *
 * The DB trigger `provision_new_org()` handles:
 *   - storage_config, brain_cortex_state, org_settings, federation_config, scheduled_jobs
 *
 * This module handles:
 *   - S3 prefix folder creation (.org-manifest.json)
 *   - s3-storage connector registration in org_connectors
 *   - Selected connector registration (pending status, need OAuth later)
 *   - Verification that DB trigger ran correctly
 */

import { getOrgStorage, isS3Configured } from "@/lib/storage/org-storage";
import { createServiceClient } from "@/lib/supabase/server";

// ── Types ──────────────────────────────────────────────────────────

export interface ProvisionResult {
  success: boolean;
  orgId: string;
  provisioned: {
    s3_prefix: boolean;
    s3_connector: boolean;
    selected_connectors: string[];
    brain_cortex_state: boolean;
    org_settings: boolean;
    federation_config: boolean;
    scheduled_jobs: number;
  };
  errors: string[];
}

export interface ProvisionOptions {
  selectedConnectors?: string[];
}

// ── Main Provisioning Function ─────────────────────────────────────

export async function provisionOrg(
  orgId: string,
  options?: ProvisionOptions
): Promise<ProvisionResult> {
  const errors: string[] = [];
  const result: ProvisionResult = {
    success: true,
    orgId,
    provisioned: {
      s3_prefix: false,
      s3_connector: false,
      selected_connectors: [],
      brain_cortex_state: false,
      org_settings: false,
      federation_config: false,
      scheduled_jobs: 0,
    },
    errors: [],
  };

  const service = await createServiceClient();

  // ── 1. Create S3 prefix folder ───────────────────────────────────

  if (isS3Configured()) {
    try {
      const storage = getOrgStorage();
      const manifestExists = await storage.exists(orgId, ".org-manifest.json");

      if (!manifestExists) {
        const manifest = {
          orgId,
          createdAt: new Date().toISOString(),
          version: 1,
          provisionedBy: "auto-provision",
        };
        await storage.upload(
          orgId,
          ".org-manifest.json",
          JSON.stringify(manifest, null, 2),
          { contentType: "application/json" }
        );
        console.log(`[Provision] Created S3 prefix for org ${orgId}`);
      } else {
        console.log(`[Provision] S3 prefix already exists for org ${orgId}`);
      }
      result.provisioned.s3_prefix = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "S3 prefix creation failed";
      errors.push(`S3 prefix: ${msg}`);
      console.error(`[Provision] S3 prefix failed for org ${orgId}:`, msg);
    }
  } else {
    console.log("[Provision] S3 not configured, skipping prefix creation");
    result.provisioned.s3_prefix = false;
  }

  // ── 2. Register s3-storage connector ─────────────────────────────

  try {
    const { data: existingS3 } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", orgId)
      .eq("connector_type", "s3-storage")
      .maybeSingle();

    if (!existingS3) {
      const { error } = await service.from("org_connectors").insert({
        organization_id: orgId,
        connector_type: "s3-storage",
        status: "active",
        config: {
          bucket: process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data",
          region: process.env.AWS_REGION || "ap-southeast-1",
          prefix: orgId,
          purpose: "Org-level file storage (CSV, JSON, reports)",
          provisionedBy: "auto-provision",
        },
      });
      if (error) throw error;
      console.log(`[Provision] Registered s3-storage connector for org ${orgId}`);
    } else {
      console.log(`[Provision] s3-storage connector already exists for org ${orgId}`);
    }
    result.provisioned.s3_connector = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "S3 connector registration failed";
    errors.push(`S3 connector: ${msg}`);
    console.error(`[Provision] S3 connector failed for org ${orgId}:`, msg);
  }

  // ── 3. Register selected connectors (pending — need OAuth later) ─

  const selectedConnectors = options?.selectedConnectors || [];
  for (const connectorType of selectedConnectors) {
    // Skip s3-storage (already handled above)
    if (connectorType === "s3-storage") continue;

    try {
      const { data: existing } = await service
        .from("org_connectors")
        .select("id")
        .eq("organization_id", orgId)
        .eq("connector_type", connectorType)
        .maybeSingle();

      if (!existing) {
        const { error } = await service.from("org_connectors").insert({
          organization_id: orgId,
          connector_type: connectorType,
          status: "pending",
          config: {
            registeredAt: new Date().toISOString(),
            registeredBy: "onboarding",
            needsOAuth: true,
          },
        });
        if (error) throw error;
        result.provisioned.selected_connectors.push(connectorType);
        console.log(`[Provision] Registered ${connectorType} connector (pending) for org ${orgId}`);
      } else {
        result.provisioned.selected_connectors.push(connectorType);
        console.log(`[Provision] ${connectorType} connector already exists for org ${orgId}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${connectorType} registration failed`;
      errors.push(`${connectorType}: ${msg}`);
    }
  }

  // ── 4. Verify DB trigger provisions ──────────────────────────────

  try {
    // Check brain_cortex_state
    const { data: cortex } = await service
      .from("brain_cortex_state")
      .select("id")
      .eq("organization_id", orgId)
      .maybeSingle();
    result.provisioned.brain_cortex_state = !!cortex;

    // Check org_settings
    const { data: settings } = await service
      .from("org_settings")
      .select("id")
      .eq("organization_id", orgId)
      .maybeSingle();
    result.provisioned.org_settings = !!settings;

    // Check federation_config
    const { data: federation } = await service
      .from("federation_config")
      .select("id")
      .eq("organization_id", orgId)
      .maybeSingle();
    result.provisioned.federation_config = !!federation;

    // Check scheduled_jobs
    const { data: jobs, count } = await service
      .from("scheduled_jobs")
      .select("id", { count: "exact" })
      .eq("organization_id", orgId);
    result.provisioned.scheduled_jobs = count || jobs?.length || 0;

    // Log any missing DB provisions (trigger may not have fired yet)
    if (!cortex) errors.push("brain_cortex_state not found (DB trigger may not have fired)");
    if (!settings) errors.push("org_settings not found");
    if (!federation) errors.push("federation_config not found");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Verification query failed";
    errors.push(`Verify: ${msg}`);
  }

  // ── Finalize ─────────────────────────────────────────────────────

  result.errors = errors;
  result.success = errors.length === 0;

  console.log(
    `[Provision] Org ${orgId}: ${result.success ? "SUCCESS" : "PARTIAL"} — ` +
    `S3=${result.provisioned.s3_prefix}, ` +
    `connector=${result.provisioned.s3_connector}, ` +
    `brain=${result.provisioned.brain_cortex_state}, ` +
    `settings=${result.provisioned.org_settings}, ` +
    `federation=${result.provisioned.federation_config}, ` +
    `jobs=${result.provisioned.scheduled_jobs}, ` +
    `selected=[${result.provisioned.selected_connectors.join(",")}]` +
    (errors.length > 0 ? ` — errors: ${errors.join("; ")}` : "")
  );

  return result;
}
