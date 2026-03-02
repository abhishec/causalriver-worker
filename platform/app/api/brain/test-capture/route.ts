export const dynamic = "force-dynamic";
/**
 * POST /api/brain/test-capture
 *
 * Records UX journey test flow results into federated_knowledge.
 * Enables the Brain to learn from test outcomes (passed, failed, bug-found, fixed).
 *
 * Body: {
 *   flowName: string,      // e.g. "Flow 1 — New User Onboarding"
 *   step: string,          // e.g. "Step 1.3 — Worker creation"
 *   status: "pass" | "fail" | "bug-found" | "fixed",
 *   notes?: string,        // human-readable details
 *   bugId?: string,        // e.g. "BUG-006"
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { flowName: string; step: string; status: string; notes?: string; bugId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { flowName, step, status, notes, bugId } = body;
  if (!flowName || !step || !status) {
    return NextResponse.json({ error: "flowName, step, status required" }, { status: 400 });
  }

  try {
    const service = await createServiceClient();

    // Get the user's workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = membership?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Quality: pass = high quality signal, fail/bug = low quality (negative RL)
    const quality = status === "pass" || status === "fixed" ? 0.80 : 0.25;
    const domain = `ux-testing.${flowName.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40)}`;

    const content = [
      `UX Test: ${flowName}`,
      `Step: ${step}`,
      `Status: ${status}`,
      notes ? `Notes: ${notes}` : "",
      bugId ? `Bug ID: ${bugId}` : "",
    ].filter(Boolean).join(" | ");

    // Write to federated_knowledge — Brain learns from test outcomes
    await service.from("federated_knowledge").insert({
      organization_id: orgId,
      source_type: "ux-test",
      source_id: `${flowName}:${step}`,
      domain,
      content,
      quality_score: quality,
      metadata: { flowName, step, status, notes, bugId, capturedAt: new Date().toISOString() },
    });

    // Write RL signal: bug-found = gaba (negative), pass/fixed = dopamine (positive)
    const signal = status === "pass" || status === "fixed" ? "dopamine" : "gaba";
    // non-fatal RL signal — fire and forget
    void service.from("cross_domain_signals").insert({
      organization_id: orgId,
      source_domain: "ux-testing",
      target_domain: "code-quality",
      signal_type: signal,
      signal_strength: quality,
      signal_data: { flowName, step, status, bugId },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, domain, quality });
  } catch (err) {
    logger.error("[test-capture] Error:", err);
    return NextResponse.json({ error: "Failed to capture" }, { status: 500 });
  }
}
