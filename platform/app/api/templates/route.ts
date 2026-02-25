import { createClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { ALL_SLASH_COMMANDS } from "@/components/copilot/slash-commands";
import { labelToCommandId } from "@/lib/templates/types";

export const dynamic = "force-dynamic";

// ── System command IDs — custom templates must not collide ──────────────────
const SYSTEM_COMMAND_IDS = new Set(ALL_SLASH_COMMANDS.map((c) => c.id));

/**
 * GET /api/templates?orgId=<uuid>
 * List the org's templates + public templates from other orgs.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = req.nextUrl.searchParams.get("workspaceId") || req.nextUrl.searchParams.get("orgId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    // Verify workspace membership (uses admin client to bypass RLS recursion)
    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Org templates (sorted by usage, most-used first)
    const { data: templates, error: orgError } = await supabase
      .from("agent_templates")
      .select("*")
      .eq("org_id", workspaceId)
      .eq("is_archived", false)
      .order("usage_count", { ascending: false });

    if (orgError) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    // Public templates from other orgs
    const { data: publicTemplates, error: pubError } = await supabase
      .from("agent_templates")
      .select("*")
      .eq("is_public", true)
      .eq("is_archived", false)
      .neq("org_id", workspaceId)
      .order("usage_count", { ascending: false })
      .limit(50);

    if (pubError) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({
      templates: templates || [],
      publicTemplates: publicTemplates || [],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Failed to list templates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates
 * Create a new agent template.
 *
 * Body: { orgId, label, description, icon?, prompt, category?,
 *         gatheringSchema?, agentConfig?, sourceArtifactId?, sourceDomainId?, isPublic? }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const workspaceId = (body.workspaceId || body.orgId) as string;
    const { label, description, prompt } = body as { label: string; description: string; prompt: string };

    if (!workspaceId || !label || !description || !prompt) {
      return NextResponse.json(
        { error: "workspaceId, label, description, and prompt are required" },
        { status: 400 }
      );
    }

    // Verify workspace membership (uses admin client to bypass RLS recursion)
    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate command_id from label
    const commandId = labelToCommandId(label);

    // Check collision with system commands
    if (SYSTEM_COMMAND_IDS.has(commandId)) {
      return NextResponse.json(
        { error: "This name conflicts with a built-in command. Please choose a different name." },
        { status: 409 }
      );
    }

    // Insert template
    const { data, error } = await supabase
      .from("agent_templates")
      .insert({
        org_id: workspaceId,
        created_by: user.id,
        command_id: commandId,
        label: label.trim(),
        description: description.trim(),
        icon: (body.icon as string) || "🔧",
        prompt: prompt.trim(),
        category: (body.category as string) || "Custom",
        service: "custom",
        gathering_schema: body.gatheringSchema || null,
        agent_config: body.agentConfig || null,
        source_artifact_id: body.sourceArtifactId || null,
        source_domain_id: body.sourceDomainId || null,
        is_public: body.isPublic || false,
      })
      .select("id, command_id")
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A command with this name already exists." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, commandId: data.command_id, template: { id: data.id, command_id: data.command_id } });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
