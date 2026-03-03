/**
 * AAS Journal Entries API — GET/POST /api/aas/journal-entries
 * ============================================================
 *
 * GET  — List journal entries for the authenticated user's workspace.
 *        Query params: status, periodStart, periodEnd, limit, offset
 *
 * POST — Create a new journal entry (persisted as 'draft').
 *        Body: CreateJournalEntryParams fields
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
  getJournalEntries,
  createJournalEntry,
} from "@/lib/aas/accounting-dal";
import type { CreateJournalEntryParams, JournalEntryLineItem } from "@/lib/aas/accounting-dal";

export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/aas/journal-entries
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
  const organizationId = url.searchParams.get("organizationId") ||
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
  const periodStart = url.searchParams.get("periodStart") ?? undefined;
  const periodEnd = url.searchParams.get("periodEnd") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const validStatuses = ["draft", "posted", "voided"] as const;
  type JournalStatus = (typeof validStatuses)[number];

  const status: JournalStatus | undefined =
    statusParam && (validStatuses as readonly string[]).includes(statusParam)
      ? (statusParam as JournalStatus)
      : undefined;

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  // ── Fetch ────────────────────────────────────────────────────────────────
  try {
    const entries = await getJournalEntries(supabase, organizationId, {
      status,
      period:
        periodStart || periodEnd
          ? { start: periodStart ?? "2000-01-01", end: periodEnd ?? "2099-12-31" }
          : undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      entries,
      count: entries.length,
      filters: { status, periodStart, periodEnd, limit, offset },
    });
  } catch (err) {
    logger.error("[/api/aas/journal-entries GET] unexpected error", {
      error: (err as Error)?.message ?? String(err),
      organizationId,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/aas/journal-entries
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
    entryDate,
    referenceNumber,
    description,
    currency,
    lineItems,
    source,
    agentJobId,
    sourceDocumentId,
    metadata,
  } = body as Partial<CreateJournalEntryParams & { organizationId: string }>;

  // ── Required field validation ────────────────────────────────────────────
  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (!entryDate || typeof entryDate !== "string") {
    return NextResponse.json({ error: "entryDate is required (ISO date, e.g. '2025-03-31')" }, { status: 400 });
  }
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return NextResponse.json({ error: "lineItems must be a non-empty array" }, { status: 400 });
  }

  // ── Validate line item shape ─────────────────────────────────────────────
  for (const [i, li] of (lineItems as Array<unknown>).entries()) {
    if (typeof li !== "object" || li === null) {
      return NextResponse.json({ error: `lineItems[${i}] must be an object` }, { status: 400 });
    }
    const item = li as Record<string, unknown>;
    if (!item.account_code || !item.account_name) {
      return NextResponse.json(
        { error: `lineItems[${i}] is missing account_code or account_name` },
        { status: 400 },
      );
    }
    if (typeof item.debit !== "number" || typeof item.credit !== "number") {
      return NextResponse.json(
        { error: `lineItems[${i}] debit and credit must be numbers` },
        { status: 400 },
      );
    }
  }

  // ── Verify org membership ────────────────────────────────────────────────
  const membership = await verifyWorkspaceMembership(user.id, organizationId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Validate source field ────────────────────────────────────────────────
  const validSources = ["manual", "agent", "import", "reconciliation"] as const;
  type JournalSource = (typeof validSources)[number];
  const resolvedSource: JournalSource =
    source && (validSources as readonly string[]).includes(source as string)
      ? (source as JournalSource)
      : "manual";

  // ── Create journal entry ─────────────────────────────────────────────────
  try {
    const result = await createJournalEntry(supabase, {
      organizationId,
      entryDate,
      referenceNumber: referenceNumber ?? undefined,
      description,
      currency: currency ?? "SGD",
      lineItems: lineItems as JournalEntryLineItem[],
      source: resolvedSource,
      agentJobId: agentJobId ?? undefined,
      sourceDocumentId: sourceDocumentId ?? undefined,
      metadata: (metadata as Record<string, unknown>) ?? undefined,
      createdBy: user.id,
    });

    if (!result) {
      // createJournalEntry returns null if debit != credit or lineItems empty
      return NextResponse.json(
        {
          error:
            "Journal entry validation failed: total debits must equal total credits, and lineItems must be non-empty",
        },
        { status: 422 },
      );
    }

    logger.warn("[/api/aas/journal-entries POST] Journal entry created", {
      id: result.id,
      organizationId,
      totalDebit: result.totalDebit,
    });

    return NextResponse.json(
      {
        success: true,
        id: result.id,
        totalDebit: result.totalDebit,
        totalCredit: result.totalCredit,
        status: "draft",
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[/api/aas/journal-entries POST] unexpected error", {
      error: (err as Error)?.message ?? String(err),
      organizationId,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
