import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Direct service-role Supabase client that fully bypasses RLS.
 *
 * The SSR `createServiceClient()` from server.ts still injects the user's
 * JWT from cookies into the Authorization header, causing PostgreSQL to
 * evaluate RLS policies with the user's role. This results in infinite
 * recursion on the `org_members` table whose RLS policy references itself.
 *
 * This client uses only the service-role key with no cookie injection,
 * so PostgreSQL treats all queries as the `service_role` (superuser-like).
 *
 * NOTE: Typed as SupabaseClient<any,any,any> because this project does not
 * have generated Supabase Database types. This matches the typing pattern
 * used by the SSR clients in server.ts and client.ts.
 */
let _adminClient: SupabaseClient<any, any, any> | null = null;

export function getAdminClient(): SupabaseClient<any, any, any> {
  if (!_adminClient) {
    // Fall back to non-NEXT_PUBLIC_ prefixed vars for Amplify SSR Lambda compatibility
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY. Check your .env.local");
    _adminClient = createClient(
      url,
      key,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _adminClient;
}

/**
 * Verify that a user is a member of the given workspace.
 * Uses the admin client to bypass RLS recursion on org_members.
 *
 * @returns The membership row if found, or null if not a member.
 */
export async function verifyWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<{ id: string; role: string; is_platform_admin: boolean } | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("org_members")
    .select("id, role, is_platform_admin")
    .eq("organization_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** @deprecated Use verifyWorkspaceMembership() instead */
export const verifyOrgMembership = verifyWorkspaceMembership;
