/**
 * S3 Upload API — Upload files to org-scoped S3 storage + auto-trigger brain ingestion
 * =====================================================================================
 *
 * POST /api/connectors/s3-upload
 *   Accepts multipart/form-data with:
 *     - file: The file to upload (CSV, JSON, XLSX)
 *     - fileType: 'gl-data' | 'transactions' | 'report' | 'custom'
 *
 *   Flow:
 *     1. Validate auth + org membership
 *     2. Upload file to S3 at {orgId}/{filename}
 *     3. Record in org_connectors as s3-storage connector
 *     4. Auto-trigger brain ingestion for GL data
 *     5. Return upload result + brain trigger status
 *
 * This replaces the manual upload-gl-to-s3.ts script with a proper API endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { getOrgStorage, isS3Configured } from "@/lib/storage/org-storage";

export const dynamic = "force-dynamic";

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/json",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export async function POST(request: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();

    // ── Verify membership ──────────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!membership) {
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (!admin) {
        return NextResponse.json(
          { error: "Not a member of this organization" },
          { status: 403 }
        );
      }
    }

    // ── Check S3 configuration ─────────────────────────────────────
    if (!isS3Configured()) {
      return NextResponse.json(
        { error: "S3 storage is not configured. Set AWS_S3_BUCKET_NAME and credentials." },
        { status: 503 }
      );
    }

    // ── Parse multipart form ───────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = (formData.get("fileType") as string) || "custom";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Send a file via multipart/form-data." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.has(file.type) && !file.name.endsWith(".json") && !file.name.endsWith(".csv")) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: JSON, CSV, XLSX.` },
        { status: 400 }
      );
    }

    // ── Determine S3 key ───────────────────────────────────────────
    const keyMap: Record<string, string> = {
      "gl-data": "gl-data.json",
      "transactions": "transactions.json",
      "report": `reports/${file.name}`,
      "custom": file.name,
    };
    const s3Key = keyMap[fileType] || file.name;

    // ── Upload to S3 ───────────────────────────────────────────────
    const storage = getOrgStorage();
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await storage.upload(orgId, s3Key, buffer, {
      contentType: file.type || "application/octet-stream",
      metadata: {
        uploadedBy: user.id,
        originalName: file.name,
        fileType,
        uploadedAt: new Date().toISOString(),
      },
    });

    console.log(`[S3Upload] Uploaded ${s3Key} for org ${orgId} (${buffer.length} bytes)`);

    // ── Upsert org_connectors record ───────────────────────────────
    const service = await createServiceClient();
    const { error: upsertError } = await service
      .from("org_connectors")
      .upsert(
        {
          organization_id: orgId,
          connector_type: "s3-storage",
          status: "active",
          config: { bucket: storage.bucketName, region: process.env.AWS_REGION || "ap-southeast-1" },
          metadata: {
            lastUploadedFile: s3Key,
            lastUploadedAt: new Date().toISOString(),
            lastUploadedBy: user.email,
            fileSize: buffer.length,
          },
          last_sync_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,connector_type" }
      );

    if (upsertError) {
      console.warn("[S3Upload] Failed to update org_connectors:", upsertError.message);
    }

    // ── Auto-trigger brain ingestion for GL data ───────────────────
    let brainTriggerResult: any = null;

    if (fileType === "gl-data") {
      try {
        // Parse and validate the GL data
        const text = buffer.toString("utf-8");
        const transactions = JSON.parse(text);

        if (!Array.isArray(transactions) || transactions.length === 0) {
          return NextResponse.json({
            success: true,
            upload: uploadResult,
            warning: "File uploaded but contains no transactions. Brain ingestion skipped.",
          });
        }

        // Ingest GL signals into cross_domain_signals
        const signals = generateGLSignals(transactions, orgId);

        if (signals.length > 0) {
          const { error: signalError } = await service
            .from("cross_domain_signals")
            .insert(signals);

          if (signalError) {
            console.warn("[S3Upload] Signal insertion error:", signalError.message);
          }
        }

        // Update connector signals count
        await service
          .from("org_connectors")
          .update({
            signals_count: signals.length,
            last_sync_at: new Date().toISOString(),
          })
          .eq("organization_id", orgId)
          .eq("connector_type", "s3-storage");

        brainTriggerResult = {
          triggered: true,
          signalsIngested: signals.length,
          transactionCount: transactions.length,
        };

        console.log(`[S3Upload] GL brain ingestion: ${signals.length} signals from ${transactions.length} txns`);
      } catch (parseErr: any) {
        console.warn("[S3Upload] GL parse/ingestion error:", parseErr.message);
        brainTriggerResult = {
          triggered: false,
          error: "File uploaded but could not parse as GL data: " + parseErr.message,
        };
      }
    }

    return NextResponse.json({
      success: true,
      upload: {
        key: uploadResult.key,
        bucket: uploadResult.bucket,
        size: buffer.length,
        fileType,
        fileName: file.name,
      },
      organizationId: orgId,
      brainIngestion: brainTriggerResult,
    });
  } catch (error: any) {
    console.error("[S3Upload] Error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}

// ── Generate cross-domain signals from GL transactions ──────────────────────

function generateGLSignals(
  transactions: any[],
  orgId: string
): Array<{
  organization_id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
  signal_metadata: Record<string, any>;
}> {
  const signals: any[] = [];
  const now = new Date().toISOString();

  // Aggregate monthly revenue/expense signals
  const monthly = new Map<string, { revenue: number; expenses: number; count: number }>();
  for (const txn of transactions) {
    const month = typeof txn.date === "string" ? txn.date.slice(0, 7) : "unknown";
    if (!monthly.has(month)) monthly.set(month, { revenue: 0, expenses: 0, count: 0 });
    const m = monthly.get(month)!;
    m.count++;

    const account = (txn.account || "").toLowerCase();
    const isRevenue = account.includes("fee") || account.includes("income") || account.includes("grant") || account.includes("revenue");
    const isExpense = account.includes("salary") || account.includes("expense") || account.includes("cost") || account.includes("depreciation") || account.includes("rental") || account.includes("insurance");

    if (isRevenue) m.revenue += (txn.credit || 0) - (txn.debit || 0);
    if (isExpense) m.expenses += (txn.debit || 0) - (txn.credit || 0);
  }

  for (const [month, data] of monthly) {
    if (month === "unknown") continue;

    if (data.revenue !== 0) {
      signals.push({
        organization_id: orgId,
        source_domain: "finance",
        signal_type: "monthly_revenue",
        signal_value: data.revenue,
        signal_timestamp: `${month}-15T00:00:00Z`,
        signal_metadata: { source_connector: "s3-storage", month, txn_count: data.count },
      });
    }

    if (data.expenses !== 0) {
      signals.push({
        organization_id: orgId,
        source_domain: "finance",
        signal_type: "monthly_expenses",
        signal_value: data.expenses,
        signal_timestamp: `${month}-15T00:00:00Z`,
        signal_metadata: { source_connector: "s3-storage", month, txn_count: data.count },
      });
    }

    signals.push({
      organization_id: orgId,
      source_domain: "finance",
      signal_type: "monthly_net_income",
      signal_value: data.revenue - data.expenses,
      signal_timestamp: `${month}-15T00:00:00Z`,
      signal_metadata: { source_connector: "s3-storage", month },
    });
  }

  // Transaction volume signal
  signals.push({
    organization_id: orgId,
    source_domain: "finance",
    signal_type: "gl_transaction_volume",
    signal_value: transactions.length,
    signal_timestamp: now,
    signal_metadata: { source_connector: "s3-storage", event: "gl_upload" },
  });

  return signals;
}

// ── GET: List files in org's S3 storage ─────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();

    if (!isS3Configured()) {
      return NextResponse.json({ files: [], configured: false });
    }

    const storage = getOrgStorage();
    const files = await storage.list(orgId);

    return NextResponse.json({
      files,
      configured: true,
      organizationId: orgId,
    });
  } catch (error: any) {
    console.error("[S3Upload] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
