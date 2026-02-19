/**
 * POST /api/admin/workspaces/create
 * ═══════════════════════════════════════════════════════════════
 * Creates a new workspace (org) under an existing customer and
 * fully provisions it: DB tables, S3, connectors, customer_members
 * and org_members (inheriting all existing customer members).
 *
 * Auth: platform admin only.
 *
 * Body:
 * {
 *   customerId:          string   — which customer to create under
 *   workspaceName:       string   — e.g. "Tookitaki 6.x"
 *   workspaceSlug?:      string   — auto-derived from name if omitted
 *   plan?:               string   — default "enterprise"
 *   connectors?:         string[] — connector types to register (pending)
 *   branchName?:         string   — e.g. "release/6.3.4"
 *   releaseVersion?:     string   — e.g. "6.3.4"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient }       from "@/lib/supabase/server";
import { provisionOrg }              from "@/lib/org-provisioning";

function slugify(name: string, suffix: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + suffix;
}

export async function POST(req: NextRequest) {
  try {
    const service = await createServiceClient();

    // ── Auth: platform admin only ──────────────────────────────────
    const { data: { user }, error: authErr } = await service.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminCheck } = await service
      .from("customer_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .maybeSingle();

    // Also check org_members for backwards compat
    const { data: orgAdminCheck } = await service
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .maybeSingle();

    if (!adminCheck && !orgAdminCheck) {
      return NextResponse.json({ error: "Platform admin required" }, { status: 403 });
    }

    // ── Parse body ─────────────────────────────────────────────────
    const body = await req.json();
    const {
      customerId,
      workspaceName,
      workspaceSlug: slugOverride,
      plan = "enterprise",
      connectors = [],
      branchName,
      releaseVersion,
    } = body;

    if (!customerId)    return NextResponse.json({ error: "customerId required" }, { status: 400 });
    if (!workspaceName) return NextResponse.json({ error: "workspaceName required" }, { status: 400 });

    // ── Verify customer exists ─────────────────────────────────────
    const { data: customer, error: custErr } = await service
      .from("customers")
      .select("id, name, slug")
      .eq("id", customerId)
      .single();
    if (custErr || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    // ── Derive slug — ensure uniqueness ───────────────────────────
    const suffix   = Math.random().toString(36).slice(2, 6); // 4 random chars
    const baseSlug = slugOverride
      ? slugOverride.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      : slugify(workspaceName, suffix);

    // Check slug not taken
    const { data: existing } = await service
      .from("organizations")
      .select("id")
      .eq("slug", baseSlug)
      .maybeSingle();

    const finalSlug = existing ? `${baseSlug}-${suffix}` : baseSlug;

    // ── 1. Create org ─────────────────────────────────────────────
    const { data: org, error: orgErr } = await service
      .from("organizations")
      .insert({
        name:        workspaceName,
        slug:        finalSlug,
        plan,
        customer_id: customerId,
        settings: {
          branchName:     branchName     || null,
          releaseVersion: releaseVersion || null,
          createdBy:      user.email,
          createdAt:      new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (orgErr || !org) {
      return NextResponse.json({ error: orgErr?.message || "Failed to create org" }, { status: 500 });
    }

    // ── 2. Full provision — verifies + backfills EVERYTHING ───────
    const provisionResult = await provisionOrg(org.id, {
      selectedConnectors: connectors,
      branchName,
      releaseVersion,
      customerId,
      createdByEmail: user.email,
    });

    return NextResponse.json({
      ok: true,
      workspace: {
        id:   org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
      },
      customer: {
        id:   customer.id,
        name: customer.name,
      },
      membersAdded: provisionResult.audit.members_synced,
      provision:    provisionResult,
    });

  } catch (err) {
    console.error("[create-workspace]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
