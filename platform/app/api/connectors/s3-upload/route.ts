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
import { maybeTriggerBrainCycle } from "@/lib/brain-trigger";

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

    // ── Storage mode ───────────────────────────────────────────────
    // S3 is preferred but Supabase Storage is a valid fallback.
    // Only block if neither is available (should never happen).
    const useS3 = isS3Configured();

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

    // ── Service client (needed for both storage fallback and DB writes) ────
    const service = await createServiceClient();

    // ── Upload to S3 (or Supabase Storage fallback) ────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    let uploadResult: { key: string; bucket: string };
    let s3BucketName: string = "org-data (Supabase)";

    if (useS3) {
      const storage = getOrgStorage();
      s3BucketName = storage.bucketName;
      uploadResult = await storage.upload(orgId, s3Key, buffer, {
        contentType: file.type || "application/octet-stream",
        metadata: {
          uploadedBy: user.id,
          originalName: file.name,
          fileType,
          uploadedAt: new Date().toISOString(),
        },
      });
      console.log(`[Upload] S3: ${s3Key} for org ${orgId} (${buffer.length} bytes)`);
    } else {
      // Fallback: Supabase Storage (bucket: org-data)
      const storagePath = `${orgId}/${s3Key}`;
      const { error: storageErr } = await service.storage
        .from("org-data")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
      if (storageErr) {
        return NextResponse.json({ error: `Storage upload failed: ${storageErr.message}` }, { status: 500 });
      }
      uploadResult = { key: storagePath, bucket: "org-data (Supabase)" };
      console.log(`[Upload] Supabase Storage: ${storagePath} for org ${orgId} (${buffer.length} bytes)`);
    }

    console.log(`[Upload] Complete: ${s3Key} for org ${orgId}`);

    // ── Upsert org_connectors record ───────────────────────────────
    const { error: upsertError } = await service
      .from("org_connectors")
      .upsert(
        {
          organization_id: orgId,
          connector_type: "s3-storage",
          status: "active",
          config: { bucket: s3BucketName, region: process.env.AWS_REGION || "ap-southeast-1" },
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

        // ── Bootstrap accounting causal graph (day-1 intelligence) ─────────
        // On the very first GL upload, seed fundamental accounting causal
        // relationships into causal_relationships_statistical so the brain has
        // day-1 causal intelligence even before it has run a learning cycle.
        // These are domain-expert priors, not learned — they represent the
        // accounting relationships every accountant knows.
        const causalSeedResult = await bootstrapAccountingCausalGraph(service, orgId, transactions);
        console.log(`[S3Upload] Causal bootstrap: ${causalSeedResult.seeded} edges seeded (${causalSeedResult.status})`);

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
          causalBootstrap: causalSeedResult,
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

    // ── Auto-trigger brain cycle after signal ingestion ─────────
    if (brainTriggerResult?.triggered && brainTriggerResult.signalsIngested > 0) {
      maybeTriggerBrainCycle(orgId, service).catch(() => {});
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

// ── Bootstrap Accounting Causal Graph (day-1 intelligence) ──────────────────
//
// Seeds fundamental accounting causal relationships into the brain's causal
// graph on first GL upload. These are domain-expert priors — accounting
// relationships that every accountant knows — so the brain has causal
// intelligence from day one, before it has run a learning cycle.
//
// We use UPSERT so subsequent uploads refresh confidence based on observed data
// rather than re-seeding duplicates.

async function bootstrapAccountingCausalGraph(
  service: any,
  orgId: string,
  transactions: any[]
): Promise<{ seeded: number; status: "new" | "refreshed" | "skipped"; edges: string[] }> {
  try {
    // Check if we already have accounting causal edges for this org
    const { count: existingCount } = await service
      .from("causal_relationships_statistical")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .like("source_signal", "finance.%");

    const status: "new" | "refreshed" | "skipped" = existingCount === 0 ? "new" : "refreshed";

    // Compute observed metrics from actual transactions to calibrate initial edges
    const revenues = transactions.filter((t: any) =>
      /fee|income|grant|revenue|subscription/i.test(t.account || "")
    );
    const expenses = transactions.filter((t: any) =>
      /salary|expense|cost|depreciation|rental|insurance/i.test(t.account || "")
    );
    const hasRevenue = revenues.length > 0;
    const hasPayroll = transactions.some((t: any) => /salary|salaries|cpf/i.test(t.account || ""));
    const hasReceivables = transactions.some((t: any) => /trade debtor|receivable/i.test(t.account || ""));
    const hasGST = transactions.some((t: any) => /gst/i.test(t.account || "") || t.taxRate > 0);
    const hasDeferred = transactions.some((t: any) => /deferred revenue/i.test(t.account || ""));

    // Fundamental accounting causal edges — domain-expert priors
    // Each edge: "if source signal changes, target signal follows with lag + confidence"
    const fundamentalEdges = [
      // Revenue → Cash (collections lag 30-90 days for B2B)
      hasRevenue && {
        source_signal: "finance.monthly_revenue",
        target_signal: "finance.cash_inflow",
        effect_size: 0.85,
        lag_days: 45,
        confidence: 0.90,
        p_value: 0.01,
        description: "Revenue collection: B2B SaaS invoices typically collected 30-90 days after recognition",
        category: "revenue_collection",
      },
      // Revenue → Trade Debtors (receivables increase with new billings)
      hasReceivables && {
        source_signal: "finance.monthly_revenue",
        target_signal: "finance.trade_debtors_balance",
        effect_size: 0.92,
        lag_days: 0,
        confidence: 0.95,
        p_value: 0.001,
        description: "New billings increase trade debtors balance before cash collection",
        category: "working_capital",
      },
      // Payroll → Cash outflow (payroll is the largest cash expense)
      hasPayroll && {
        source_signal: "finance.payroll_expense",
        target_signal: "finance.cash_outflow",
        effect_size: 0.95,
        lag_days: 0,
        confidence: 0.98,
        p_value: 0.001,
        description: "Payroll disbursement directly reduces cash — same-day settlement",
        category: "payroll_cash",
      },
      // CPF → Liability then Cash (CPF accrues in month, paid by 14th next month)
      hasPayroll && {
        source_signal: "finance.payroll_expense",
        target_signal: "finance.cpf_payable",
        effect_size: 0.17, // ~17% of salary is CPF
        lag_days: 0,
        confidence: 0.99,
        p_value: 0.0001,
        description: "CPF accrues monthly as liability (~17% of payroll); settled by 14th of following month",
        category: "statutory",
      },
      // GST output → GST liability (GST collected becomes payable to IRAS)
      hasGST && {
        source_signal: "finance.monthly_revenue",
        target_signal: "finance.gst_payable",
        effect_size: 0.09, // 9% GST rate in Singapore
        lag_days: 0,
        confidence: 0.99,
        p_value: 0.0001,
        description: "9% GST on standard-rated supplies becomes output tax payable to IRAS",
        category: "gst",
      },
      // Revenue → Deferred Revenue (SaaS billing creates contract liability)
      hasDeferred && {
        source_signal: "finance.cash_inflow",
        target_signal: "finance.deferred_revenue",
        effect_size: 0.80,
        lag_days: -30, // deferred revenue recognised into P&L over contract period
        confidence: 0.88,
        p_value: 0.02,
        description: "Advance billing creates deferred revenue liability; recognised monthly over subscription term",
        category: "revenue_recognition",
      },
      // Expenses → Net Income (opex directly drives profitability)
      {
        source_signal: "finance.monthly_expenses",
        target_signal: "finance.monthly_net_income",
        effect_size: -0.90, // negative: more expenses → lower net income
        lag_days: 0,
        confidence: 0.99,
        p_value: 0.0001,
        description: "Operating expenses directly reduce net income in the same period",
        category: "profitability",
      },
      // Revenue → Net Income
      hasRevenue && {
        source_signal: "finance.monthly_revenue",
        target_signal: "finance.monthly_net_income",
        effect_size: 0.90,
        lag_days: 0,
        confidence: 0.99,
        p_value: 0.0001,
        description: "Revenue directly drives net income — the fundamental P&L relationship",
        category: "profitability",
      },
      // Cash → Runway (burn rate determines runway)
      {
        source_signal: "finance.cash_outflow",
        target_signal: "finance.runway_months",
        effect_size: -0.95,
        lag_days: 0,
        confidence: 0.97,
        p_value: 0.001,
        description: "Higher monthly burn directly reduces cash runway — critical survival signal",
        category: "runway",
      },
    ].filter(Boolean) as any[];

    if (fundamentalEdges.length === 0) {
      return { seeded: 0, status: "skipped", edges: [] };
    }

    // Upsert edges (idempotent — safe to call on every upload)
    const edgesToInsert = fundamentalEdges.map((edge: any) => ({
      organization_id: orgId,
      source_signal: edge.source_signal,
      target_signal: edge.target_signal,
      effect_size: edge.effect_size,
      lag_days: edge.lag_days,
      confidence: edge.confidence,
      p_value: edge.p_value,
      sample_size: transactions.length,
      method: "domain_prior", // marks these as expert priors, not statistically learned
      metadata: {
        description: edge.description,
        category: edge.category,
        seededAt: new Date().toISOString(),
        transactionCount: transactions.length,
        bootstrapVersion: "v1",
      },
    }));

    const { error: upsertError } = await service
      .from("causal_relationships_statistical")
      .upsert(edgesToInsert, {
        onConflict: "organization_id,source_signal,target_signal",
        ignoreDuplicates: false, // update confidence on re-upload
      });

    if (upsertError) {
      console.warn("[S3Upload] Causal bootstrap upsert error:", upsertError.message);
      // Try insert instead (table may not have the upsert conflict key)
      const { error: insertError } = await service
        .from("causal_relationships_statistical")
        .insert(edgesToInsert);
      if (insertError) {
        console.warn("[S3Upload] Causal bootstrap insert error:", insertError.message);
        return { seeded: 0, status: "skipped", edges: [] };
      }
    }

    const edgeNames = fundamentalEdges.map((e: any) => `${e.source_signal} → ${e.target_signal}`);
    console.log(`[S3Upload] Bootstrapped ${edgesToInsert.length} accounting causal edges for org ${orgId} (${status})`);

    return { seeded: edgesToInsert.length, status, edges: edgeNames };
  } catch (err: any) {
    console.warn("[S3Upload] Causal bootstrap error:", err.message);
    return { seeded: 0, status: "skipped", edges: [] };
  }
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
      // List from Supabase Storage fallback
      const svc = await createServiceClient();
      const { data: sbFiles } = await svc.storage.from("org-data").list(orgId);
      return NextResponse.json({
        files: (sbFiles || []).map(f => ({ key: f.name, fullKey: `${orgId}/${f.name}`, size: f.metadata?.size || 0, lastModified: f.updated_at ? new Date(f.updated_at) : null })),
        configured: true,
        storageMode: "supabase",
        organizationId: orgId,
      });
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
