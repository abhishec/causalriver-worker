export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const VALID_ROLES = ["owner", "admin", "member", "viewer"];

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
      .limit(1)
      .maybeSingle();
    if (!adminCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { memberId, role } = await req.json();
    if (!memberId || !role) return NextResponse.json({ error: "memberId and role required" }, { status: 400 });
    if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(memberId)) return NextResponse.json({ error: "Invalid memberId format" }, { status: 400 });

    const service = await createServiceClient();
    const { error } = await service.from("org_members").update({ role }).eq("id", memberId);
    if (error) {
      logger.error("[admin/users/change-role] Update failed:", error.message);
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[admin/users/change-role] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
