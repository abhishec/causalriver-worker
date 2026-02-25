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

    // ── Query 1: Core membership data (always works, no optional columns) ──
    const { data: rows, error } = await admin
      .from("org_members")
      .select(
        `organization_id, role, is_platform_admin,
         organizations:organization_id(
           id, name, slug, plan, is_core_brain, customer_id, description,
           customer:customer_id(id, name, slug)
         )`
      )
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (error) {
      logger.error("[/api/workspace/memberships] query error:", error);
      return NextResponse.json({ error: "Failed to load memberships" }, { status: 500 });
    }

    // ── Query 2: Domain restrictions (optional — migration may not exist) ──
    // If allowed_email_domains columns don't exist yet, skip domain filtering
    let domainMap: Record<string, { orgDomains: string[]; customerDomains: string[] }> = {};
    try {
      const orgIds = (rows ?? []).map((r: Record<string, unknown>) => r.organization_id);
      if (orgIds.length > 0) {
        const { data: domainRows } = await admin
          .from("organizations")
          .select("id, allowed_email_domains, customer_id, customer:customer_id(allowed_email_domains)")
          .in("id", orgIds);

        if (domainRows) {
          for (const dr of domainRows as Record<string, unknown>[]) {
            const cust = dr.customer as Record<string, unknown> | null;
            domainMap[dr.id as string] = {
              orgDomains: (dr.allowed_email_domains as string[]) ?? [],
              customerDomains: (cust?.allowed_email_domains as string[]) ?? [],
            };
          }
        }
      }
    } catch {
      // Migration 20260324000001 not applied yet — skip domain filtering
      logger.warn("[/api/workspace/memberships] allowed_email_domains not available — skipping domain filter");
    }

    // Extract email domain for access control checks
    const userEmailDomain = user.email
      ? user.email.split("@")[1]?.toLowerCase()
      : null;

    // Flatten nested organizations fields so generic option mappers can read {id, name}
    // Also filter by email domain restrictions (if available)
    const memberships = (rows ?? [])
      .filter((r: Record<string, unknown>) => {
        const orgId = r.organization_id as string;
        if (!userEmailDomain || !domainMap[orgId]) return true;

        const { orgDomains, customerDomains } = domainMap[orgId];

        // Check org-level domain restriction first
        if (orgDomains.length > 0) {
          return orgDomains.includes(userEmailDomain);
        }

        // Fallback to customer-level domain restriction
        if (customerDomains.length > 0) {
          return customerDomains.includes(userEmailDomain);
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
          customer_id: org?.customer_id ?? null,
        };
      });

    return NextResponse.json({ memberships });
  } catch (err) {
    logger.error("[/api/workspace/memberships] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
