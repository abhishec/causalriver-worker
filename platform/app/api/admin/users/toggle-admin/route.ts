import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

    const { memberId, isPlatformAdmin } = await req.json();
    if (!memberId || typeof isPlatformAdmin !== "boolean") {
      return NextResponse.json({ error: "memberId and isPlatformAdmin required" }, { status: 400 });
    }

    const service = await createServiceClient();
    const { error } = await service
      .from("org_members")
      .update({ is_platform_admin: isPlatformAdmin })
      .eq("id", memberId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/toggle-admin] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
