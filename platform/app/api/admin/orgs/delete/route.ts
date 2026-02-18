import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
      .single();
    if (!adminCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { orgId } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    const service = await createServiceClient();

    // Safety: never delete core brain org
    const { data: org } = await service.from("organizations").select("is_core_brain").eq("id", orgId).single();
    if (org?.is_core_brain) return NextResponse.json({ error: "Cannot delete Core Brain org" }, { status: 400 });

    // Delete members first (cascade handles most things, but be explicit)
    await service.from("org_members").delete().eq("organization_id", orgId);

    // Delete the org
    const { error } = await service.from("organizations").delete().eq("id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/orgs/delete] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
