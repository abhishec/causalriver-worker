import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkSessionRateLimit } from "@/lib/security-middleware";

export const dynamic = "force-dynamic";

export interface AgentCreatedResponse {
  agentId: string;
  name: string;
  domain: string;
  trigger: string;
  schedule?: string;
  status: string;
  brainEnabled: boolean;
  rlEnabled: boolean;
  memoryTracking: boolean;
  createdAt: string;
}

export async function POST(req: Request) {
  try {
    // Step 1: createClient in isolated try-catch — throws when env vars missing in Lambda cold start
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 2: getUser in isolated try-catch
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limiting — 10 req/min per user ──────────────────────────────────
    const rateLimit = await checkSessionRateLimit(user.id, "/api/agents/create");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before creating another agent." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { spec, organizationId } = body as {
      spec?: {
        name?: string;
        description?: string;
        domain?: string;
        trigger?: string;
        schedule?: string;
        requiredInputs?: string[];
      };
      organizationId?: string;
    };

    if (!spec?.name || !organizationId) {
      return NextResponse.json(
        { error: "Missing spec.name or organizationId" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // Verify org membership before creating
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const agentId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Store agent in se_aas_artifacts using existing schema columns:
    // id, organization_id, job_id, domain_type, artifact_data, metadata, created_by, created_at
    const { error: insertError } = await admin.from("se_aas_artifacts").insert({
      id: agentId,
      organization_id: organizationId,
      domain_type: "agent-definition",
      artifact_data: {
        agentId,
        name: spec.name,
        description: spec.description || "",
        domain: spec.domain || "custom",
        trigger: spec.trigger || "manual",
        schedule: spec.schedule ?? null,
        requiredInputs: spec.requiredInputs ?? [],
        status: "active",
        brainEnabled: true,
        rlEnabled: true,
        memoryTracking: true,
        createdAt: now,
        createdBy: user.id,
      },
      metadata: {
        source: "copilot",
        agentVersion: "1.0",
      },
      created_by: user.id,
      created_at: now,
    });

    if (insertError) {
      logger.error("[/api/agents/create] insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to persist agent" },
        { status: 500 }
      );
    }

    logger.warn(
      `[/api/agents/create] Agent created: ${spec.name} (${agentId}) for org ${organizationId}`
    );

    const response: AgentCreatedResponse = {
      agentId,
      name: spec.name,
      domain: spec.domain || "custom",
      trigger: spec.trigger || "manual",
      schedule: spec.schedule,
      status: "active",
      brainEnabled: true,
      rlEnabled: true,
      memoryTracking: true,
      createdAt: now,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error("[/api/agents/create] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
