/**
 * GET /api/aaas/gl-status — Check if GL data exists for an organization
 *
 * Returns { exists, metadata } so the copilot gathering flow can decide
 * whether to show "use existing" or "upload new" options.
 *
 * Uses S3 primary → Supabase Storage fallback (same as /api/aaas GET).
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrgStorage, isS3Configured } from "@/lib/storage/org-storage";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface GLTransaction {
  date: string;
  account: string;
  [key: string]: unknown;
}

export async function GET(request: Request) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Resolve org ──────────────────────────────────────────────────────
    const url = new URL(request.url);
    let orgId = url.searchParams.get("orgId");

    if (!orgId) {
      // Find user's first org membership
      const { data: memberships } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      orgId = memberships?.[0]?.organization_id || null;
    }

    if (!orgId) {
      return NextResponse.json(
        { exists: false, metadata: null, error: "Not found" },
        { status: 200 }
      );
    }

    // ── Try loading GL data ──────────────────────────────────────────────
    let transactions: GLTransaction[] = [];

    // S3 primary
    if (isS3Configured()) {
      try {
        const storage = getOrgStorage();
        transactions = await storage.downloadJSON<GLTransaction[]>(
          orgId,
          "gl-data.json"
        );
      } catch {
        // Fall through to Supabase
      }
    }

    // Supabase Storage fallback
    if (transactions.length === 0) {
      try {
        const service = await createServiceClient();
        const { data } = await service.storage
          .from("org-data")
          .download(`${orgId}/gl-data.json`);

        if (data) {
          const text = await data.text();
          try {
            transactions = JSON.parse(text);
          } catch {
            // Malformed JSON
          }
        }
      } catch {
        // No data in Supabase Storage
      }
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json(
        { exists: false, metadata: null, organizationId: orgId },
        { status: 200 }
      );
    }

    // ── Compute metadata from GL data ────────────────────────────────────
    const accountSet = new Set<string>();
    let minDate = "9999-12-31";
    let maxDate = "0000-01-01";

    for (const txn of transactions) {
      if (txn.account) accountSet.add(txn.account);
      if (txn.date && txn.date < minDate) minDate = txn.date;
      if (txn.date && txn.date > maxDate) maxDate = txn.date;
    }

    // Format period nicely (e.g., "Jan 2024 – Dec 2024")
    let period = "";
    try {
      const startDate = new Date(minDate);
      const endDate = new Date(maxDate);
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      period = `${months[startDate.getMonth()]} ${startDate.getFullYear()} – ${months[endDate.getMonth()]} ${endDate.getFullYear()}`;
    } catch {
      period = `${minDate} to ${maxDate}`;
    }

    // ── Try to get upload metadata from org_connectors ───────────────────
    let filename = "gl-data.json";
    let uploadedAt: string | null = null;

    try {
      const service = await createServiceClient();
      const { data: connector } = await service
        .from("org_connectors")
        .select("metadata, last_sync_at")
        .eq("organization_id", orgId)
        .eq("connector_type", "s3-storage")
        .maybeSingle();

      if (connector) {
        const meta = connector.metadata as Record<string, unknown> | null;
        if (meta?.lastUploadedFile)
          filename = String(meta.lastUploadedFile);
        uploadedAt =
          (connector.last_sync_at as string) ||
          (meta?.lastUploadedAt as string) ||
          null;
      }
    } catch {
      // Non-blocking — metadata is supplementary
    }

    return NextResponse.json({
      exists: true,
      metadata: {
        transactionCount: transactions.length,
        accountCount: accountSet.size,
        period,
        uploadedAt,
        filename,
      },
      organizationId: orgId,
    });
  } catch (err) {
    logger.error("[gl-status] Error:", err);
    return NextResponse.json(
      { exists: false, metadata: null, error: "Internal error" },
      { status: 500 }
    );
  }
}
