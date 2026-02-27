import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  captureCodeDecision,
  captureArchitecturalDecision,
  captureResearchFinding,
  captureSessionSummary,
  captureCurrentSessionLearnings,
  type CodeDecision,
  type ArchitecturalDecision,
  type ResearchFinding,
  type SessionSummary,
} from "@/lib/brain/session-learning-capture";

export const dynamic = "force-dynamic";

type RequestBody =
  | { type: "code_decision"; orgId: string; data: CodeDecision }
  | { type: "architectural_decision"; orgId: string; data: ArchitecturalDecision }
  | { type: "research_finding"; orgId: string; data: ResearchFinding }
  | { type: "session_summary"; orgId: string; data: SessionSummary }
  | { type: "current_session"; orgId: string; data?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const isCron =
    cronSecret !== undefined &&
    cronSecret.length > 0 &&
    authHeader === `Bearer ${cronSecret}`;

  let adminClient;
  try {
    adminClient = getAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!isCron) {
    // Fall back to session-based auth + org membership check
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const membership = await verifyWorkspaceMembership(user.id, body.orgId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return handleCapture(adminClient, body);
  }

  // CRON path — skip user auth, parse body directly
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  return handleCapture(adminClient, body);
}

async function handleCapture(
  adminClient: ReturnType<typeof getAdminClient>,
  body: RequestBody
): Promise<NextResponse> {
  try {
    switch (body.type) {
      case "code_decision":
        await captureCodeDecision(adminClient, body.orgId, body.data as CodeDecision);
        break;
      case "architectural_decision":
        await captureArchitecturalDecision(adminClient, body.orgId, body.data as ArchitecturalDecision);
        break;
      case "research_finding":
        await captureResearchFinding(adminClient, body.orgId, body.data as ResearchFinding);
        break;
      case "session_summary":
        await captureSessionSummary(adminClient, body.orgId, body.data as SessionSummary);
        break;
      case "current_session":
        await captureCurrentSessionLearnings(adminClient, body.orgId);
        break;
      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[/api/brain/session-learning] capture error:", { error: (err as Error)?.message ?? String(err), route: "/api/brain/session-learning" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
