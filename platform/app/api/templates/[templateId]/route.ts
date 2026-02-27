import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/templates/[templateId]
 * Load a single template.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { templateId } = await params;

    const { data, error } = await supabase
      .from("agent_templates")
      .select("*")
      .eq("id", templateId)
      .eq("is_archived", false)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify access: must be in the same org or template is public
    const { data: member } = await supabase
      .from("org_members")
      .select("id")
      .eq("organization_id", data.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member && !data.is_public) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ template: data });
  } catch {
    return NextResponse.json(
      { error: "Failed to get template" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/templates/[templateId]
 * Update a template's fields.
 *
 * Body: { label?, description?, icon?, prompt?, category?,
 *         gatheringSchema?, agentConfig?, isPublic? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { templateId } = await params;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Build update object from allowed fields
    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) updates.label = body.label;
    if (body.description !== undefined) updates.description = body.description;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.prompt !== undefined) updates.prompt = body.prompt;
    if (body.category !== undefined) updates.category = body.category;
    if (body.gatheringSchema !== undefined) updates.gathering_schema = body.gatheringSchema;
    if (body.agentConfig !== undefined) updates.agent_config = body.agentConfig;
    if (body.isPublic !== undefined) updates.is_public = body.isPublic;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Only allow updating templates in user's org
    const { data: template } = await supabase
      .from("agent_templates")
      .select("org_id")
      .eq("id", templateId)
      .maybeSingle();

    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("org_members")
      .select("id")
      .eq("organization_id", template.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("agent_templates")
      .update(updates)
      .eq("id", templateId);

    if (error) {
      return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[templateId]
 * Soft-delete a template (set is_archived = true).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { templateId } = await params;

    // Only allow deleting templates in user's org
    const { data: template } = await supabase
      .from("agent_templates")
      .select("org_id")
      .eq("id", templateId)
      .maybeSingle();

    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("org_members")
      .select("id")
      .eq("organization_id", template.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("agent_templates")
      .update({ is_archived: true })
      .eq("id", templateId);

    if (error) {
      return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
