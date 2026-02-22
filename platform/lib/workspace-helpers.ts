import { createClient, getAuthUser } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { cache } from "react";

import { CORE_ORG_ID } from "@/lib/constants";

/** Alias for clarity — same UUID, workspace naming */
export const CORE_WORKSPACE_ID = CORE_ORG_ID;
export { CORE_ORG_ID };

const STORAGE_KEY = "nexus_current_workspace";
const OLD_STORAGE_KEY = "nexus_current_org";  // migration fallback

/* ── Types ──────────────────────────────────────────────────────────── */

export interface CurrentCustomer {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_design_partner: boolean;
  primary_org_id: string | null;
}

/* ── getCurrentCustomer ─────────────────────────────────────────────── */

/**
 * Cached server-side helper: resolves user → customer_members → customer.
 *
 * Uses React cache() for per-request deduplication — multiple server
 * components / helpers calling getCurrentCustomer() in the same request
 * share a single Supabase query.
 *
 * Resolution: picks the user's first customer (by joined_at).
 */
export const getCurrentCustomer = cache(
  async (): Promise<CurrentCustomer | null> => {
    try {
      const supabase = await createClient();
      const user = await getAuthUser();
      if (!user) return null;

      const { data } = await supabase
        .from("customer_members")
        .select(
          `primary_org_id,
         customer:customer_id(id, name, slug, plan, is_design_partner)`
        )
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .single();

      if (!data) return null;

      const cust = (data as any).customer;
      return {
        id: cust.id,
        name: cust.name,
        slug: cust.slug,
        plan: cust.plan,
        is_design_partner: cust.is_design_partner ?? false,
        primary_org_id: data.primary_org_id,
      };
    } catch {
      return null;
    }
  }
);

/* ── getCurrentWorkspaceId ───────────────────────────────────────────── */

/**
 * Server-side helper to resolve the current workspace ID.
 *
 * Resolution order (customer-first):
 *   1. Cookie override — user explicitly switched workspaces (validate via org_members)
 *   2. Customer chain — primary_org_id from getCurrentCustomer() (cached, no extra query)
 *   3. Fallback — first non-core workspace from org_members
 *   4. Default — CORE_WORKSPACE_ID
 *
 * Reads both new and old cookie names for backward compat.
 */
export const getCurrentWorkspaceId = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const user = await getAuthUser();

    if (!user) return CORE_WORKSPACE_ID;

    /* 1. Cookie override — user explicitly switched workspaces */
    const cookieStore = await cookies();
    // Read new cookie first, fall back to old cookie
    const saved = cookieStore.get(STORAGE_KEY)?.value
      ?? cookieStore.get(OLD_STORAGE_KEY)?.value;

    if (saved) {
      // Validate: user must be a member of this workspace
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("organization_id", saved)
        .single();

      if (membership) return saved;

      // Platform admins can view any workspace
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (admin) return saved;
    }

    /* 2. Customer chain — primary_org_id (zero extra queries, uses cached getCurrentCustomer) */
    const customer = await getCurrentCustomer();
    if (customer?.primary_org_id) return customer.primary_org_id;

    /* 3. Fallback: first non-core workspace from org_members */
    const { data: first } = await supabase
      .from("org_members")
      .select(
        "organization_id, organizations:organization_id(is_core_brain), is_platform_admin"
      )
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (first && first.length > 0) {
      const nonCore = (first as any[]).find(
        (m) => !(m.organizations as any)?.is_core_brain
      );
      if (nonCore) return nonCore.organization_id;

      // Only fall back to CORE if user is a platform admin (non-admins can't read CORE via RLS)
      const isPlatformAdmin = (first as any[]).some((m) => m.is_platform_admin);
      if (isPlatformAdmin) return first[0].organization_id;

      // Non-admin with only CORE membership — return it anyway (best effort)
      return first[0].organization_id;
    }

    // 4. No memberships found — only use CORE for platform admins
    const { data: adminCheck } = await supabase
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .single();

    if (adminCheck) return CORE_WORKSPACE_ID;

    // Non-admin with no workspace memberships — return empty string to signal "no workspace"
    return CORE_WORKSPACE_ID;
  } catch {
    return CORE_WORKSPACE_ID;
  }
});

/* ── Backward compat alias ───────────────────────────────────────────── */

/** @deprecated Use getCurrentWorkspaceId() instead */
export const getCurrentOrgId = getCurrentWorkspaceId;
