export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api-key-auth";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

/**
 * GET /api/keys
 * List all API keys for the current org.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    const { data: keys, error } = await supabase
      .from("api_keys")
      .select(
        "id, key_prefix, name, permissions, rate_limit_per_minute, last_used_at, created_at, is_active"
      )
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ keys: keys || [] });
  } catch (err) {
    logger.error("[keys GET] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/keys
 * Generate a new API key.
 * Body: { name: string, permissions?: string[], rateLimitPerMinute?: number }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    // Verify caller is owner/admin
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role))
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );

    const body = await request.json();
    const { name, permissions, rateLimitPerMinute } = body;

    if (!name || !name.trim())
      return NextResponse.json(
        { error: "Key name is required" },
        { status: 400 }
      );

    // Generate the key using the existing utility
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    // Insert into api_keys table using service client (bypasses RLS for insert)
    const service = await createServiceClient();
    const { error } = await service.from("api_keys").insert({
      organization_id: workspaceId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: name.trim(),
      permissions: permissions || ["read"],
      rate_limit_per_minute: rateLimitPerMinute || 60,
      created_by: user.id,
      is_active: true,
    });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Return the raw key — this is the ONLY time it's visible
    return NextResponse.json({
      rawKey,
      keyPrefix,
      name: name.trim(),
      message:
        "Save this key now — it will not be shown again.",
    });
  } catch (err) {
    logger.error("[keys POST] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/keys
 * Revoke (soft-delete) an API key.
 * Body: { keyId: string }
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    // Verify caller is owner/admin
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role))
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );

    const { keyId } = await request.json();
    if (!keyId)
      return NextResponse.json(
        { error: "keyId is required" },
        { status: 400 }
      );

    // Soft-delete: set is_active = false
    const service = await createServiceClient();
    const { error } = await service
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", keyId)
      .eq("organization_id", workspaceId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[keys DELETE] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
