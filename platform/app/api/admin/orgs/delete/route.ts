export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function DELETE(req: NextRequest) {
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
      .limit(1)
      .maybeSingle();
    if (!adminCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { orgId } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(orgId)) return NextResponse.json({ error: "Invalid orgId format" }, { status: 400 });

    const service = await createServiceClient();

    // Safety: never delete core brain org
    const { data: org, error: orgErr } = await service.from("organizations").select("is_core_brain").eq("id", orgId).maybeSingle();
    if (orgErr || !org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    if (org.is_core_brain) return NextResponse.json({ error: "Cannot delete Core Brain org" }, { status: 400 });

    // Delete members first (cascade handles most things, but be explicit)
    await service.from("org_members").delete().eq("organization_id", orgId);

    // Delete the org
    const { error } = await service.from("organizations").delete().eq("id", orgId);
    if (error) {
      logger.error("[admin/orgs/delete] Delete failed:", error.message);
      return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[admin/orgs/delete] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
