/**
 * Self-MOA API Route — POST /api/brain/self-moa
 *
 * Triggers a 3-lens multi-agent synthesis for a high-stakes domain query.
 * Requires: authenticated user + org membership.
 *
 * Request body:
 *   { query: string; domain: string; organizationId: string }
 *
 * Response:
 *   SelfMoaResult | { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getBrainContext } from "@/lib/brain/brain-context";
import { runSelfMoa } from "@/lib/brain/self-moa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let user: { id: string } | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    logger.warn("[self-moa/route] createClient or getUser failed:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { query, domain, organizationId } = body as {
    query?: string;
    domain?: string;
    organizationId?: string;
  };

  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 }
    );
  }
  if (!domain || typeof domain !== "string") {
    return NextResponse.json(
      { error: "domain is required" },
      { status: 400 }
    );
  }
  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 }
    );
  }

  // ── Org membership check ──────────────────────────────────────────────────
  let service: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    service = await createServiceClient();
    const { data: member, error: memberErr } = await service
      .from("org_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single();

    if (memberErr || !member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (err) {
    logger.warn("[self-moa/route] membership check failed:", err);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Get brain context ─────────────────────────────────────────────────────
  let brainContextStr = "";
  try {
    const brainCtx = await getBrainContext(service, organizationId, { query });
    brainContextStr = brainCtx.contextSummary ?? "";
  } catch (err) {
    // Non-fatal — proceed with empty context
    logger.warn("[self-moa/route] getBrainContext failed (non-fatal):", err);
  }

  // ── Run Self-MOA ──────────────────────────────────────────────────────────
  try {
    const result = await runSelfMoa({
      query,
      domain,
      organizationId,
      userId: user.id,
      brainContext: brainContextStr,
      apiKey,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Self-MOA execution failed — no sub-agents succeeded" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.warn("[self-moa/route] runSelfMoa threw unexpectedly:", err);
    return NextResponse.json(
      { error: "Self-MOA execution failed" },
      { status: 500 }
    );
  }
}
