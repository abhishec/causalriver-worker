export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

/**
 * POST /api/partner/feedback
 *
 * Stores structured feedback from design partners.
 * Saves to org_settings.partner_activation.feedback_history array.
 */
export async function POST(request: Request) {
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

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();
    const body = await request.json();

    const { rating, whats_working, whats_missing } = body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be 1-5" },
        { status: 400 }
      );
    }

    // Get current org_settings
    const { data: current } = await service
      .from("org_settings")
      .select("partner_activation")
      .eq("organization_id", workspaceId)
      .maybeSingle();

    const existing = (current?.partner_activation as Record<string, any>) || {};
    const feedbackHistory = Array.isArray(existing.feedback_history)
      ? existing.feedback_history
      : [];

    const newEntry = {
      id: crypto.randomUUID(),
      user_id: user.id,
      rating,
      whats_working: whats_working || "",
      whats_missing: whats_missing || "",
      created_at: new Date().toISOString(),
    };

    feedbackHistory.push(newEntry);

    await service
      .from("org_settings")
      .upsert({
        organization_id: workspaceId,
        partner_activation: {
          ...existing,
          feedback_history: feedbackHistory,
          last_feedback_at: new Date().toISOString(),
        },
      }, { onConflict: "organization_id" });

    return NextResponse.json({ success: true, id: newEntry.id });
  } catch (err) {
    logger.error("[Partner/feedback] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/partner/feedback
 *
 * Returns feedback history for the current org.
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

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const { data } = await service
      .from("org_settings")
      .select("partner_activation")
      .eq("organization_id", workspaceId)
      .maybeSingle();

    const activation = (data?.partner_activation as Record<string, any>) || {};
    const feedbackHistory = Array.isArray(activation.feedback_history)
      ? activation.feedback_history
      : [];

    return NextResponse.json({ feedback: feedbackHistory });
  } catch (err) {
    logger.error("[Partner/feedback] GET Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
