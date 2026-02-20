import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/memberships
 *
 * Returns the current user's org memberships with organization + customer details.
 * Uses the admin client to bypass RLS (org_members has infinite recursion in RLS).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: rows, error } = await admin
      .from("org_members")
      .select(
        `organization_id, role, is_platform_admin,
         organizations:organization_id(
           id, name, slug, plan, is_core_brain, customer_id,
           customer:customer_id(id, name, slug)
         )`
      )
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("[/api/org/memberships] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memberships: rows ?? [] });
  } catch (err) {
    console.error("[/api/org/memberships] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
