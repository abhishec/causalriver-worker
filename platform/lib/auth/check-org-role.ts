/**
 * RBAC helper for API routes.
 *
 * Usage:
 *   const { allowed, role } = await requireOrgRole(supabase, user.id, workspaceId, ["admin", "owner"]);
 *   if (!allowed) return NextResponse.json({ error: "..." }, { status: 403 });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrgRoleResult {
  allowed: boolean;
  role: string | null;
}

/**
 * Check whether a user holds one of the allowedRoles in the given organization.
 *
 * @param supabase      - Already-created Supabase client (reuse the one from createClient()).
 * @param userId        - The authenticated user's ID.
 * @param organizationId - The org/workspace ID to scope the check to.
 * @param allowedRoles  - Roles that are permitted (e.g. ["admin", "owner"]).
 * @returns { allowed, role } — role is null when the user has no membership row.
 */
export async function requireOrgRole(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  allowedRoles: string[]
): Promise<OrgRoleResult> {
  const { data: member, error } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !member) {
    return { allowed: false, role: null };
  }

  const role: string = member.role ?? "";
  return { allowed: allowedRoles.includes(role), role };
}
