import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/memberships
 *
 * Returns the current user's org memberships with organization + customer details.
 * Uses the admin client to bypass RLS (org_members has infinite recursion in RLS).
 */
export async function GET() {
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
      logger.error("[/api/org/memberships] query error:", error);
      return NextResponse.json({ error: "Failed to load memberships" }, { status: 500 });
    }

    return NextResponse.json({ memberships: rows ?? [] });
  } catch (err) {
    logger.error("[/api/org/memberships] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
