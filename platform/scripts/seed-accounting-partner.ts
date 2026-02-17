/**
 * Seed Script: Create "PH Accounting" Design Partner Organization
 *
 * Usage: npx tsx scripts/seed-accounting-partner.ts
 *
 * Creates:
 * 1. "PH Accounting" organization (enterprise plan)
 * 2. Links abhishek@tookitaki.com as owner
 * 3. Links platform admin (abhishek@monetiz3.com) as admin
 * 4. Seeds org_connectors entry for Xero GL data
 *
 * This org is the design partner for Accounting-as-a-Service (AaaS).
 * The GL data was parsed from a real Xero General Ledger Detail export:
 *   - 49,684 transactions, 187 accounts, SGD
 *   - Date range: 2020-01-01 to 2026-02-12
 *   - Perfectly balanced (debits = credits = $570,335,353.95)
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load env from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Design Partner Config ────────────────────────────────────

const PH_ACCOUNTING_ORG = {
  name: "PH Accounting",
  slug: "ph-accounting",
  plan: "enterprise",
  settings: {
    industry: "Accounting & Advisory Services",
    countries: ["SG"],
    currency: "SGD",
    jurisdiction: "SFRS/IRAS",
    headcount: 15,
    description: "Singapore accounting firm — design partner for Accounting-as-a-Service (AaaS)",
    designPartner: true,
  },
};

const OWNER_EMAIL = "abhishek@tookitaki.com";
const OWNER_PASSWORD = "Tookitaki@2025!";

const PLATFORM_ADMIN_EMAIL = "abhishek@monetiz3.com";

// ─── Helpers (same pattern as seed-users.ts) ──────────────────

async function findOrCreateUser(email: string, password: string) {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === email);

  if (existing) {
    console.log(`  [exists] ${email} (${existing.id})`);
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { onboarding_complete: true },
  });

  if (error) {
    console.error(`  [error] Failed to create ${email}:`, error.message);
    return null;
  }

  console.log(`  [created] ${email} (${data.user.id})`);
  return data.user;
}

async function findOrCreateOrg(name: string, slug: string, plan: string, settings?: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (existing) {
    // Update settings if provided (ensures consistency on re-runs)
    if (settings) {
      await supabase
        .from("organizations")
        .update({ settings })
        .eq("id", existing.id);
      console.log(`  [exists] Org "${name}" (${existing.id}) — settings updated`);
    } else {
      console.log(`  [exists] Org "${name}" (${existing.id})`);
    }
    return existing;
  }

  const orgId = randomUUID();
  const { data, error } = await supabase
    .from("organizations")
    .insert({ id: orgId, name, slug, plan, ...(settings ? { settings } : {}) })
    .select()
    .single();

  if (error) {
    console.error(`  [error] Failed to create org "${name}":`, error.message);
    return null;
  }

  console.log(`  [created] Org "${name}" (${data.id})`);
  return data;
}

async function addOrgMember(orgId: string, userId: string, role: string, isPlatformAdmin = false) {
  const { data: existing } = await supabase
    .from("org_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    console.log(`    [exists] membership for user in org`);
    return;
  }

  const { error } = await supabase
    .from("org_members")
    .insert({
      organization_id: orgId,
      user_id: userId,
      role,
      is_platform_admin: isPlatformAdmin,
    });

  if (error) {
    console.error(`    [error] Failed to add member:`, error.message);
  } else {
    console.log(`    [added] ${role}${isPlatformAdmin ? " (platform admin)" : ""}`);
  }
}

async function addXeroConnector(orgId: string) {
  const { data: existing } = await supabase
    .from("org_connectors")
    .select("id")
    .eq("organization_id", orgId)
    .eq("connector_type", "xero")
    .single();

  if (existing) {
    console.log(`  [exists] Xero connector`);
    return;
  }

  const { error } = await supabase
    .from("org_connectors")
    .insert({
      organization_id: orgId,
      connector_type: "xero",
      status: "active",
      signals_count: 49684,
      config: {
        source: "general-ledger-detail",
        jurisdiction: "SG",
        currency: "SGD",
        dateRange: { from: "2020-01-01", to: "2026-02-12" },
        accounts: 187,
        transactions: 49684,
        balanced: true,
        designPartner: true,
        importedAt: new Date().toISOString(),
      },
    });

  if (error) {
    console.error(`  [error] Failed to create Xero connector:`, error.message);
  } else {
    console.log(`  [created] Xero connector (49,684 signals)`);
  }
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Seed: PH Accounting Design Partner ===\n");

  // 1. Create the org
  console.log("1. Organization:");
  const org = await findOrCreateOrg(PH_ACCOUNTING_ORG.name, PH_ACCOUNTING_ORG.slug, PH_ACCOUNTING_ORG.plan, PH_ACCOUNTING_ORG.settings);
  if (!org) {
    console.error("Failed to create PH Accounting org. Aborting.");
    process.exit(1);
  }

  // 2. Create/find the owner user
  console.log("\n2. Owner User:");
  const ownerUser = await findOrCreateUser(OWNER_EMAIL, OWNER_PASSWORD);
  if (ownerUser) {
    console.log("  Adding as owner of PH Accounting:");
    await addOrgMember(org.id, ownerUser.id, "owner");
  }

  // 3. Link platform admin to org
  console.log("\n3. Platform Admin:");
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const adminUser = existingUsers?.users?.find((u) => u.email === PLATFORM_ADMIN_EMAIL);

  if (adminUser) {
    console.log(`  [found] ${PLATFORM_ADMIN_EMAIL} (${adminUser.id})`);
    console.log("  Adding as admin of PH Accounting:");
    await addOrgMember(org.id, adminUser.id, "admin", true);
  } else {
    console.log(`  [skip] ${PLATFORM_ADMIN_EMAIL} not found — run seed-users.ts first`);
  }

  // 3b. S3 storage (auto-provisioned by DB trigger, ensure connector exists)
  console.log("\n   Verifying S3 storage provisioning...");
  const { data: existingS3 } = await supabase
    .from("org_connectors")
    .select("id")
    .eq("organization_id", org.id)
    .eq("connector_type", "s3-storage")
    .single();
  if (!existingS3) {
    await supabase.from("org_connectors").insert({
      organization_id: org.id,
      connector_type: "s3-storage",
      status: "active",
      config: {
        bucket: process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data",
        region: process.env.AWS_REGION || "ap-southeast-1",
        prefix: org.id,
        purpose: "Org-level file storage (GL data, CSV, reports)",
      },
    });
    console.log("   [created] S3 storage connector");
  } else {
    console.log("   [exists] S3 storage connector (auto-provisioned)");
  }

  // 4. Seed Xero connector
  console.log("\n4. Xero Connector:");
  await addXeroConnector(org.id);

  // 5. Convert GL data to cross_domain_signals (so brain can reason about this org)
  console.log("\n5. GL → Signal Conversion:");
  try {
    // Load GL data from storage (uploaded by migrate-gl-data-to-storage.ts)
    const storagePath = `${org.id}/gl-data.json`;
    const { data: fileData, error: dlError } = await supabase.storage
      .from("org-data")
      .download(storagePath);

    if (dlError || !fileData) {
      console.log("  [skip] No GL data in storage — run migrate-gl-data-to-storage.ts first");
    } else {
      const text = await fileData.text();
      const transactions = JSON.parse(text) as Array<{
        date: string; account: string; debit: number; credit: number; source: string;
      }>;

      // Aggregate monthly revenue & expense signals
      const monthlyData = new Map<string, { revenue: number; expenses: number; txnCount: number }>();
      for (const txn of transactions) {
        const month = txn.date.slice(0, 7); // YYYY-MM
        if (!monthlyData.has(month)) monthlyData.set(month, { revenue: 0, expenses: 0, txnCount: 0 });
        const m = monthlyData.get(month)!;
        m.txnCount++;
        const acctLower = txn.account.toLowerCase();
        // Revenue accounts: license, subscription, implementation, support, overage, interest, grant, other income
        if (acctLower.includes("fee") || acctLower.includes("income") || acctLower.includes("grant") || acctLower.includes("revenue")) {
          m.revenue += txn.credit - txn.debit;
        }
        // Expense accounts: salary, cpf, depreciation, insurance, rental, travel, marketing, software, etc.
        if (acctLower.includes("salary") || acctLower.includes("salaries") || acctLower.includes("cpf") ||
            acctLower.includes("depreciation") || acctLower.includes("insurance") || acctLower.includes("rental") ||
            acctLower.includes("travel") || acctLower.includes("marketing") || acctLower.includes("software") ||
            acctLower.includes("contractor") || acctLower.includes("legal") || acctLower.includes("bank charge") ||
            acctLower.includes("audit") || acctLower.includes("accounting") || acctLower.includes("bonus")) {
          m.expenses += txn.debit - txn.credit;
        }
      }

      // Generate signals from monthly aggregates
      const signals: Array<Record<string, unknown>> = [];
      for (const [month, data] of monthlyData) {
        const timestamp = `${month}-15T00:00:00.000Z`;
        if (data.revenue !== 0) {
          signals.push({
            organization_id: org.id,
            source_domain: "accounting",
            signal_type: "monthly_revenue",
            signal_value: data.revenue,
            signal_timestamp: timestamp,
            entity_type: "financial_period",
            entity_id: month,
            signal_metadata: { currency: "SGD", source: "xero-gl", txnCount: data.txnCount },
          });
        }
        if (data.expenses !== 0) {
          signals.push({
            organization_id: org.id,
            source_domain: "accounting",
            signal_type: "monthly_expenses",
            signal_value: data.expenses,
            signal_timestamp: timestamp,
            entity_type: "financial_period",
            entity_id: month,
            signal_metadata: { currency: "SGD", source: "xero-gl" },
          });
        }
        // Net income signal
        const netIncome = data.revenue - data.expenses;
        if (data.revenue !== 0 || data.expenses !== 0) {
          signals.push({
            organization_id: org.id,
            source_domain: "accounting",
            signal_type: "monthly_net_income",
            signal_value: netIncome,
            signal_timestamp: timestamp,
            entity_type: "financial_period",
            entity_id: month,
            signal_metadata: { currency: "SGD", source: "xero-gl", margin: data.revenue > 0 ? (netIncome / data.revenue * 100).toFixed(1) : "0" },
          });
        }
      }

      if (signals.length > 0) {
        // Check if signals already exist for this org
        const { count: existingCount } = await supabase
          .from("cross_domain_signals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("source_domain", "accounting");

        if (existingCount && existingCount > 0) {
          console.log(`  [exists] ${existingCount} accounting signals already present`);
        } else {
          // Insert in batches
          const BATCH_SIZE = 100;
          let inserted = 0;
          for (let i = 0; i < signals.length; i += BATCH_SIZE) {
            const batch = signals.slice(i, i + BATCH_SIZE);
            const { error: insertError } = await supabase.from("cross_domain_signals").insert(batch);
            if (insertError) {
              console.error(`  [error] Batch insert: ${insertError.message}`);
            } else {
              inserted += batch.length;
            }
          }
          console.log(`  [created] ${inserted} accounting signals (${monthlyData.size} months × 3 metrics)`);
        }
      }

      // Log sync activity
      await supabase.from("connector_sync_log").insert({
        organization_id: org.id,
        connector_id: "seed-accounting-partner",
        sync_type: "full",
        status: "completed",
        signals_generated: signals.length,
        records_processed: transactions.length,
        errors: [],
        duration_ms: 0,
        completed_at: new Date().toISOString(),
      });
      console.log(`  [synced] ${transactions.length} GL transactions → ${signals.length} signals`);
    }
  } catch (err) {
    console.log(`  [skip] Signal conversion failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6. Summary
  console.log("\n=== Summary ===\n");
  console.log(`Organization: ${PH_ACCOUNTING_ORG.name}`);
  console.log(`  ID:    ${org.id}`);
  console.log(`  Slug:  ${PH_ACCOUNTING_ORG.slug}`);
  console.log(`  Plan:  ${PH_ACCOUNTING_ORG.plan}`);
  console.log("");
  console.log("Members:");
  console.log(`  ${OWNER_EMAIL} — owner`);
  if (adminUser) {
    console.log(`  ${PLATFORM_ADMIN_EMAIL} — admin (platform admin)`);
  }
  console.log("");
  console.log("Connectors:");
  console.log("  Xero GL — 49,684 transactions, 187 accounts, SGD");
  console.log("");
  console.log("Login:");
  console.log(`  Email:    ${OWNER_EMAIL}`);
  console.log(`  Password: ${OWNER_PASSWORD}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Login at your platform URL with the credentials above");
  console.log('  2. Switch to "PH Accounting" org from the sidebar');
  console.log("  3. Navigate to Accounting Jarvis dashboard");
  console.log("\nDone!\n");
}

main().catch(console.error);
