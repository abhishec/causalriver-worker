import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/memberships
 *
 * Returns the current user's workspace memberships with workspace + customer details.
 * Uses the admin client to bypass RLS (org_members has infinite recursion in RLS).
 *
 * This is the new canonical path — /api/org/memberships is kept as a compat alias.
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
      logger.error("[/api/workspace/memberships] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten nested organizations fields so generic option mappers can read {id, name}
    const memberships = (rows ?? []).map((r: Record<string, unknown>) => {
      const org = r.organizations as Record<string, unknown> | null;
      return {
        ...r,
        id: r.organization_id,
        name: org?.name ?? r.organization_id,
        slug: org?.slug,
      };
    });

    return NextResponse.json({ memberships });
  } catch (err) {
    logger.error("[/api/workspace/memberships] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
