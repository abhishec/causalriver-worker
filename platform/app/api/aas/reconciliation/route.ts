/**
 * AAS Bank Reconciliation API — GET/POST /api/aas/reconciliation
 * ===============================================================
 *
 * GET  — List bank reconciliations for the authenticated user's workspace.
 *        Query params: organizationId, status, bankAccount, limit, offset
 *
 * POST — Create a new bank reconciliation record in 'in_progress' status.
 *        Body: { organizationId, bankAccountName, periodStart, periodEnd,
 *                bankStatementBalance, bookBalance }
 *
 * Both routes:
 *   1. Validate session via supabase.auth.getUser()
 *   2. Verify organisation membership (admin client to bypass RLS recursion)
 *   3. Scope all DB queries to organization_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  getReconciliations,
  createReconciliation,
} from "@/lib/aas/accounting-dal";

export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/aas/reconciliation
// ============================================================================

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Organisation from query param or header ──────────────────────────────
  const url = new URL(request.url);
  const organizationId =
    url.searchParams.get("organizationId") ||
    request.headers.get("x-organization-id");

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required (query param or x-organization-id header)" },
      { status: 400 },
    );
  }

  // ── Verify org membership ────────────────────────────────────────────────
  const membership = await verifyWorkspaceMembership(user.id, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse filters ────────────────────────────────────────────────────────
  const statusParam = url.searchParams.get("status");
  const bankAccount = url.searchParams.get("bankAccount") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const validStatuses = ["in_progress", "completed", "reviewed"] as const;
  type RecoStatus = (typeof validStatuses)[number];

  const status: RecoStatus | undefined =
    statusParam && (validStatuses as readonly string[]).includes(statusParam)
      ? (statusParam as RecoStatus)
      : undefined;

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  // ── Fetch ────────────────────────────────────────────────────────────────
  try {
    const reconciliations = await getReconciliations(supabase, organizationId, {
      status,
      bankAccount,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      reconciliations,
      count: reconciliations.length,
      filters: { status, bankAccount, limit, offset },
    });
  } catch (err) {
    logger.error("[/api/aas/reconciliation GET] unexpected error", {
      error: (err as Error)?.message ?? String(err),
      organizationId,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/aas/reconciliation
// ============================================================================

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    organizationId,
    bankAccountName,
    periodStart,
    periodEnd,
    bankStatementBalance,
    bookBalance,
  } = body as Record<string, unknown>;

  // ── Required field validation ────────────────────────────────────────────
  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (!bankAccountName || typeof bankAccountName !== "string") {
    return NextResponse.json({ error: "bankAccountName is required" }, { status: 400 });
  }
  if (!periodStart || typeof periodStart !== "string") {
    return NextResponse.json(
      { error: "periodStart is required (ISO date, e.g. '2025-01-01')" },
      { status: 400 },
    );
  }
  if (!periodEnd || typeof periodEnd !== "string") {
    return NextResponse.json(
      { error: "periodEnd is required (ISO date, e.g. '2025-01-31')" },
      { status: 400 },
    );
  }
  if (typeof bankStatementBalance !== "number") {
    return NextResponse.json(
      { error: "bankStatementBalance must be a number" },
      { status: 400 },
    );
  }
  if (typeof bookBalance !== "number") {
    return NextResponse.json({ error: "bookBalance must be a number" }, { status: 400 });
  }

  // ── Validate period ordering early (before DB round-trip) ───────────────
  if (new Date(periodStart) >= new Date(periodEnd)) {
    return NextResponse.json(
      { error: "periodStart must be before periodEnd" },
      { status: 422 },
    );
  }

  // ── Verify org membership ────────────────────────────────────────────────
  const membership = await verifyWorkspaceMembership(user.id, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Create reconciliation ────────────────────────────────────────────────
  try {
    const result = await createReconciliation(supabase, {
      organizationId,
      bankAccountName,
      periodStart,
      periodEnd,
      bankStatementBalance,
      bookBalance,
      reconciledBy: user.id,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to create reconciliation: validation error or database failure" },
        { status: 422 },
      );
    }

    logger.warn("[/api/aas/reconciliation POST] Reconciliation created", {
      id: result.id,
      organizationId,
      bankAccountName,
      periodStart,
      periodEnd,
    });

    return NextResponse.json(
      {
        success: true,
        id: result.id,
        status: "in_progress",
        bankAccountName,
        periodStart,
        periodEnd,
        bankStatementBalance,
        bookBalance,
        difference: Math.round((bankStatementBalance - bookBalance) * 100) / 100,
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[/api/aas/reconciliation POST] unexpected error", {
      error: (err as Error)?.message ?? String(err),
      organizationId,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
