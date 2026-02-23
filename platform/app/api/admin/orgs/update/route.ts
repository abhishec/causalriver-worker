export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function PATCH(req: NextRequest) {
  try {
    // Verify caller is a platform admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminCheck } = await supabase
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .single();
    if (!adminCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { orgId, plan, name } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (plan) updates.plan = plan;
    if (name) updates.name = name;

    const service = await createServiceClient();
    const { error } = await service.from("organizations").update(updates).eq("id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[admin/orgs/update] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
