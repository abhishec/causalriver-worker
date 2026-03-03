/**
 * /api/agents/sessions/[id]/corpus
 *
 * GET  — Get corpus info for a session (document_filter, few_shot_examples, style_profile)
 * POST — Create or update corpus for a session (upsert by agent_session_id)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── GET /api/agents/sessions/[id]/corpus ─────────────────────────────────────
// Returns the corpus record for this session, or 404 if none exists.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    // Auth
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify session ownership
    const admin = getAdminClient();
    const { data: sessionRow } = await admin
      .from("agent_sessions")
      .select("organization_id")
      .eq("id", sessionId)
      .single();

    if (!sessionRow) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Verify org membership
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", sessionRow.organization_id as string)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch corpus
    const { data: corpus, error: corpusError } = await supabase
      .from("agent_corpus")
      .select(
        "id, corpus_name, document_filter, few_shot_examples, style_profile, total_documents, total_examples, created_at"
      )
      .eq("agent_session_id", sessionId)
      .limit(1)
      .single();

    if (corpusError || !corpus) {
      // No corpus yet — return empty structure (not an error)
      return NextResponse.json({
        corpus: null,
        message: "No corpus configured for this session",
      });
    }

    return NextResponse.json({ corpus });
  } catch (err) {
    logger.error("[/api/agents/sessions/[id]/corpus GET] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/agents/sessions/[id]/corpus ────────────────────────────────────
// Body: { corpusName?, documentFilter?, fewShotExamples?, styleProfile? }
// Creates the corpus record if it doesn't exist, otherwise updates it.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    // Auth
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    let body: {
      corpusName?: string;
      documentFilter?: Record<string, unknown>;
      fewShotExamples?: Array<{ input: string; output: string; description?: string }>;
      styleProfile?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Verify session ownership
    const admin = getAdminClient();
    const { data: sessionRow } = await admin
      .from("agent_sessions")
      .select("organization_id, ai_worker_id")
      .eq("id", sessionId)
      .single();

    if (!sessionRow) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const organizationId = sessionRow.organization_id as string;
    const aiWorkerId = sessionRow.ai_worker_id as string | null;

    // Verify org membership
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fewShotExamples = Array.isArray(body.fewShotExamples)
      ? body.fewShotExamples
      : [];

    // Check if corpus already exists for this session
    const { data: existingCorpus } = await supabase
      .from("agent_corpus")
      .select("id")
      .eq("agent_session_id", sessionId)
      .limit(1)
      .single();

    let corpusId: string;

    if (existingCorpus?.id) {
      // Update existing corpus
      const { error: updateError } = await supabase
        .from("agent_corpus")
        .update({
          corpus_name: body.corpusName ?? null,
          document_filter: body.documentFilter ?? {},
          few_shot_examples: fewShotExamples,
          style_profile: body.styleProfile ?? null,
          total_examples: fewShotExamples.length,
        })
        .eq("id", existingCorpus.id as string);

      if (updateError) {
        logger.error("[/api/agents/sessions/[id]/corpus POST] Corpus update failed", {
          sessionId,
          error: updateError.message,
        });
        return NextResponse.json(
          { error: "Failed to update corpus" },
          { status: 500 }
        );
      }

      corpusId = existingCorpus.id as string;

      logger.warn("[/api/agents/sessions/[id]/corpus POST] Corpus updated", {
        sessionId,
        corpusId,
        examplesCount: fewShotExamples.length,
      });
    } else {
      // Create new corpus
      const { data: newCorpus, error: insertError } = await supabase
        .from("agent_corpus")
        .insert({
          organization_id: organizationId,
          agent_session_id: sessionId,
          ai_worker_id: aiWorkerId,
          corpus_name: body.corpusName ?? `Corpus for session ${sessionId.slice(0, 8)}`,
          document_filter: body.documentFilter ?? {},
          few_shot_examples: fewShotExamples,
          style_profile: body.styleProfile ?? null,
          total_documents: 0,
          total_examples: fewShotExamples.length,
        })
        .select("id")
        .single();

      if (insertError || !newCorpus) {
        logger.error("[/api/agents/sessions/[id]/corpus POST] Corpus insert failed", {
          sessionId,
          error: insertError?.message ?? "no data returned",
        });
        return NextResponse.json(
          { error: "Failed to create corpus" },
          { status: 500 }
        );
      }

      corpusId = newCorpus.id as string;

      logger.warn("[/api/agents/sessions/[id]/corpus POST] Corpus created", {
        sessionId,
        corpusId,
        examplesCount: fewShotExamples.length,
      });
    }

    return NextResponse.json({
      success: true,
      corpusId,
      sessionId,
      totalExamples: fewShotExamples.length,
    });
  } catch (err) {
    logger.error("[/api/agents/sessions/[id]/corpus POST] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
