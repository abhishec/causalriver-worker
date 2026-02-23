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
           id, name, slug, plan, is_core_brain, customer_id, allowed_email_domains,
           customer:customer_id(id, name, slug, allowed_email_domains)
         )`
      )
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (error) {
      logger.error("[/api/workspace/memberships] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extract email domain for access control checks
    const userEmailDomain = user.email
      ? user.email.split("@")[1]?.toLowerCase()
      : null;

    // Flatten nested organizations fields so generic option mappers can read {id, name}
    // Also filter by email domain restrictions
    const memberships = (rows ?? [])
      .filter((r: Record<string, unknown>) => {
        // Email domain access control — only show workspaces the user's domain is allowed in
        const org = r.organizations as Record<string, unknown> | null;
        if (!org || !userEmailDomain) return true;

        // Check org-level domain restriction first
        const orgDomains = org.allowed_email_domains as string[] | null;
        if (orgDomains && orgDomains.length > 0) {
          return orgDomains.includes(userEmailDomain);
        }

        // Fallback to customer-level domain restriction
        const customer = org.customer as Record<string, unknown> | null;
        if (customer) {
          const customerDomains = customer.allowed_email_domains as string[] | null;
          if (customerDomains && customerDomains.length > 0) {
            return customerDomains.includes(userEmailDomain);
          }
        }

        // No restrictions — allow access
        return true;
      })
      .map((r: Record<string, unknown>) => {
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
