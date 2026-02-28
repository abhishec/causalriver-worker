/**
 * Copilot Session Resolution
 *
 * Handles workspace/org resolution, user auth validation, and membership checks.
 * Extracted from chat/route.ts to keep the main handler clean.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
// CORE_WORKSPACE_ID intentionally not imported — never use as fallback (cross-tenant leak risk)
import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionResult {
  user: { id: string; [k: string]: unknown };
  workspaceId: string;
  supabase: SupabaseClient;
  service: SupabaseClient;
}

export type SessionError =
  | { type: "invalid_json" }
  | { type: "invalid_id_format" }
  | { type: "unauthorized" }
  | { type: "forbidden" }
  | { type: "no_api_key" };

/**
 * Resolve the session for a copilot chat request.
 *
 * @param requestedWorkspaceId - workspaceId or organizationId from the request body (may be undefined)
 * @returns SessionResult on success, or SessionError to be converted to an HTTP response
 */
export async function resolveSession(
  requestedWorkspaceId: string | undefined
): Promise<SessionResult | SessionError> {
  // ── Validate workspace ID format (prevent path traversal) ──────────
  if (requestedWorkspaceId && !UUID_RE.test(requestedWorkspaceId)) {
    return { type: "invalid_id_format" };
  }

  // ── Workspace resolution ────────────────────────────────────────────
  // workspaceId comes from the frontend (WorkspaceProvider cookie / context).
  // It is ALWAYS the workspace the user is currently viewing.
  //
  // Workspace isolation guarantee:
  //   - Each workspace has its own causal graph, signals, memory, predictions.
  //   - customer_id (billing parent) is NEVER used here — organization_id is the
  //     sole isolation boundary for all brain/SE-AAS/copilot paths.
  //
  // Workspace must be supplied by the authenticated frontend.
  // We do NOT fall back to CORE_WORKSPACE_ID — that would expose cross-tenant data
  // to unauthenticated or workspace-less callers. If no workspace is resolved
  // after auto-resolution below, the request is rejected with 403.
  let workspaceId: string = requestedWorkspaceId ?? "";

  // Authenticate via Supabase
  // Step 1: createClient in isolated try-catch — throws when env vars missing in Lambda cold start
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { type: "unauthorized" };
  }

  // Step 2: getUser in isolated try-catch
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    return { type: "unauthorized" };
  }

  if (!user) {
    return { type: "unauthorized" };
  }

  // ── Auto-resolve workspace when frontend didn't provide one ──────
  // Uses admin client to bypass RLS recursion on org_members
  if (!requestedWorkspaceId) {
    const admin = getAdminClient();
    const { data: userOrgs } = await admin
      .from("org_members")
      .select("organization_id, organizations:organization_id(is_core_brain)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });

    if (userOrgs && userOrgs.length > 0) {
      // Prefer first non-core org (actual workspace), fallback to first org
      const nonCore = userOrgs.find(
        (m: any) => !(m.organizations as any)?.is_core_brain
      );
      workspaceId = nonCore?.organization_id ?? userOrgs[0].organization_id;
      logger.debug("[Chat] Auto-resolved workspace:", workspaceId);
    }
    // If no memberships found, workspaceId stays empty → membership check below will 403 (correct)
  }

  // ── Validate user is a member of the requested org ──────────────────
  // Uses admin client to bypass RLS recursion on org_members.
  const membership = await verifyWorkspaceMembership(user.id, workspaceId);

  // Platform admins can access any org (for support/debugging)
  let adminCheck: { is_platform_admin: boolean } | null = null;
  if (!membership) {
    const admin = getAdminClient();
    const { data } = await admin
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .maybeSingle();
    adminCheck = data;
  }

  if (!membership && !adminCheck) {
    return { type: "forbidden" };
  }

  // ── Create service client once for the entire request lifecycle ──────
  let service;
  try {
    service = await createServiceClient();
  } catch {
    return { type: "unauthorized" };
  }

  return { user: user as any, workspaceId, supabase, service };
}
