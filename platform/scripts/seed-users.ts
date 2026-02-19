/**
 * Seed Script: Create demo users for Tookitaki (customer + workspace)
 *
 * Usage: npx tsx scripts/seed-users.ts
 *
 * Architecture:
 *   Customer: Tookitaki  ← users are members of THIS
 *     └── Workspace: Tookitaki (org)  ← brain scoping only
 *
 * Creates:
 * 1. Platform admin: abhishek@monetiz3.com
 *    └── customer_member of NexusBrain Platform (is_platform_admin=true)
 *    └── org_member of Core Brain (owner)
 *
 * 2. Tookitaki customer (if not exists)
 *    └── Workspace org linked to customer
 *    └── Users as customer_members:
 *        - abhishek@tookitaki.com (owner)
 *        - jeeta@tookitaki.com (admin)
 *        - yuan.luo@tookitaki.com (member)
 *    └── Each user also added to workspace org_members (for brain access)
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load env from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── IDs (stable, predictable) ─────────────────────────────────────────────

const CORE_ORG_ID              = "00000000-0000-4000-a000-000000000001";
const NEXUSBRAIN_CUSTOMER_ID   = "00000000-0000-4000-c000-000000000001";
const TOOKITAKI_CUSTOMER_ID    = "a1000000-0000-4000-a000-000000000001";

// ─── Definitions ───────────────────────────────────────────────────────────

const PLATFORM_ADMIN = {
  email:    "abhishek@monetiz3.com",
  password: "NexusBrain2025!",
};

const TOOKITAKI_CUSTOMER = {
  id:               TOOKITAKI_CUSTOMER_ID,
  name:             "Tookitaki",
  slug:             "tookitaki",
  plan:             "enterprise",
  is_design_partner: true,
  industry:         "FinTech",
  settings: {
    description:     "AML/compliance SaaS — first NexusBrain design partner",
    csm_notes:       "Two active release tracks: 6.x main (Bao/Ravi) and 5.11.x enterprise (Sandeep/Doan)",
    primary_contact: "abhishek@tookitaki.com",
    slack_channel:   "#nexusbrain-tookitaki",
  },
};

const TOOKITAKI_WORKSPACE = {
  name: "Tookitaki",
  slug: "tookitaki",
  plan: "enterprise",
  settings: {
    industry:    "AML Compliance Software",
    countries:   ["SG", "MY", "TW", "AU", "PH"],
    arr:         10200000,
    headcount:   87,
    description: "Enterprise AML compliance platform — RegTech SaaS across 5 APAC countries",
  },
};

// Users: role applies to BOTH customer_members AND org_members
const TOOKITAKI_USERS = [
  { email: "abhishek@tookitaki.com", password: "Tookitaki@2025!", role: "owner"  as const },
  { email: "jeeta@tookitaki.com",    password: "Tookitaki@Jeeta1", role: "admin"  as const },
  { email: "yuan.luo@tookitaki.com", password: "Tookitaki@Yuan1!", role: "member" as const },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    email_confirm:  true,
    user_metadata:  { onboarding_complete: true },
  });

  if (error) {
    console.error(`  [error] Failed to create ${email}:`, error.message);
    return null;
  }

  console.log(`  [created] ${email} (${data.user.id})`);
  return data.user;
}

async function findOrCreateCustomer(opts: {
  id: string;
  name: string;
  slug: string;
  plan: string;
  industry?: string;
  is_design_partner?: boolean;
  settings?: Record<string, unknown>;
}) {
  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, slug")
    .eq("id", opts.id)
    .single();

  if (existing) {
    // Keep settings fresh
    await supabase
      .from("customers")
      .update({ settings: opts.settings, industry: opts.industry, is_design_partner: opts.is_design_partner })
      .eq("id", opts.id);
    console.log(`  [exists] Customer "${opts.name}" (${existing.id}) — settings updated`);
    return existing;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      id:               opts.id,
      name:             opts.name,
      slug:             opts.slug,
      plan:             opts.plan,
      industry:         opts.industry,
      is_design_partner: opts.is_design_partner ?? false,
      settings:         opts.settings ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error(`  [error] Failed to create customer "${opts.name}":`, error.message);
    return null;
  }

  console.log(`  [created] Customer "${opts.name}" (${data.id})`);
  return data;
}

async function findOrCreateOrg(opts: {
  name: string;
  slug: string;
  plan: string;
  customer_id: string;
  settings?: Record<string, unknown>;
}) {
  const { data: existing } = await supabase
    .from("organizations")
    .select("id, name, slug, customer_id")
    .eq("slug", opts.slug)
    .single();

  if (existing) {
    // Ensure customer_id is set + settings up to date
    await supabase
      .from("organizations")
      .update({ customer_id: opts.customer_id, settings: opts.settings })
      .eq("id", existing.id);
    console.log(`  [exists] Workspace "${opts.name}" (${existing.id}) — customer_id + settings updated`);
    return existing;
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      id:          randomUUID(),
      name:        opts.name,
      slug:        opts.slug,
      plan:        opts.plan,
      customer_id: opts.customer_id,
      settings:    opts.settings ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error(`  [error] Failed to create workspace "${opts.name}":`, error.message);
    return null;
  }

  console.log(`  [created] Workspace "${opts.name}" (${data.id})`);
  return data;
}

async function addCustomerMember(
  customerId: string,
  userId: string,
  role: string,
  isPlatformAdmin = false,
) {
  const { data: existing } = await supabase
    .from("customer_members")
    .select("id")
    .eq("customer_id", customerId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    console.log(`    [exists] customer_member user=${userId} customer=${customerId}`);
    return;
  }

  const { error } = await supabase.from("customer_members").insert({
    customer_id:      customerId,
    user_id:          userId,
    role,
    is_platform_admin: isPlatformAdmin,
  });

  if (error) {
    console.error(`    [error] Failed to add customer_member:`, error.message);
  } else {
    console.log(`    [added] customer_member ${userId} as ${role}${isPlatformAdmin ? " (platform admin)" : ""}`);
  }
}

async function addOrgMember(
  orgId: string,
  userId: string,
  role: string,
  isPlatformAdmin = false,
) {
  const { data: existing } = await supabase
    .from("org_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    console.log(`    [exists] org_member user=${userId} org=${orgId}`);
    return;
  }

  const { error } = await supabase.from("org_members").insert({
    organization_id:  orgId,
    user_id:          userId,
    role,
    is_platform_admin: isPlatformAdmin,
  });

  if (error) {
    console.error(`    [error] Failed to add org_member:`, error.message);
  } else {
    console.log(`    [added] org_member ${userId} as ${role}${isPlatformAdmin ? " (platform admin)" : ""}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== NexusBrain Seed: Customers + Users ===\n");

  // ── 1. Platform Admin ──────────────────────────────────────────────────────
  console.log("1. Platform Admin:");
  const adminUser = await findOrCreateUser(PLATFORM_ADMIN.email, PLATFORM_ADMIN.password);

  if (adminUser) {
    // Customer membership → NexusBrain Platform (is_platform_admin=true)
    await addCustomerMember(NEXUSBRAIN_CUSTOMER_ID, adminUser.id, "owner", true);
    // Workspace membership → Core Brain org
    await addOrgMember(CORE_ORG_ID, adminUser.id, "owner", true);
  }

  // ── 2. Tookitaki Customer ──────────────────────────────────────────────────
  console.log("\n2. Tookitaki Customer:");
  const customer = await findOrCreateCustomer(TOOKITAKI_CUSTOMER);
  if (!customer) { console.error("Failed to create Tookitaki customer. Aborting."); process.exit(1); }

  // ── 3. Tookitaki Workspace (org) ───────────────────────────────────────────
  console.log("\n3. Tookitaki Workspace (org):");
  const workspace = await findOrCreateOrg({
    ...TOOKITAKI_WORKSPACE,
    customer_id: customer.id,
  });
  if (!workspace) { console.error("Failed to create Tookitaki workspace. Aborting."); process.exit(1); }

  // Ensure S3 connector exists for the workspace
  console.log("\n   Verifying S3 storage connector...");
  const { data: existingS3 } = await supabase
    .from("org_connectors")
    .select("id")
    .eq("organization_id", workspace.id)
    .eq("connector_type", "s3-storage")
    .single();

  if (!existingS3) {
    await supabase.from("org_connectors").insert({
      organization_id: workspace.id,
      connector_type:  "s3-storage",
      status:          "active",
      config: {
        bucket:  process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data",
        region:  process.env.AWS_REGION || "ap-southeast-1",
        prefix:  workspace.id,
        purpose: "Org-level file storage (CSV, JSON, reports)",
      },
    });
    console.log("   [created] S3 storage connector");
  } else {
    console.log("   [exists] S3 storage connector");
  }

  // ── 4. Tookitaki Users → Customer + Workspace ──────────────────────────────
  console.log("\n4. Tookitaki Users:");
  for (const userDef of TOOKITAKI_USERS) {
    console.log(`\n  → ${userDef.email} (${userDef.role}):`);
    const user = await findOrCreateUser(userDef.email, userDef.password);
    if (user) {
      // Primary: customer membership
      await addCustomerMember(customer.id, user.id, userDef.role);
      // Secondary: workspace (org) membership for brain access
      await addOrgMember(workspace.id, user.id, userDef.role);
    }
  }

  // ── Also add platform admin as Tookitaki customer member (for oversight) ───
  if (adminUser) {
    console.log("\n  → abhishek@monetiz3.com (platform admin access to Tookitaki):");
    await addCustomerMember(customer.id, adminUser.id, "admin", true);
    await addOrgMember(workspace.id, adminUser.id, "admin", true);
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  console.log("\n\n=== Summary ===\n");
  console.log("Platform Admin:");
  console.log(`  ${PLATFORM_ADMIN.email} — Password: ${PLATFORM_ADMIN.password}`);
  console.log(`  └── customer_member of NexusBrain Platform (is_platform_admin=true)`);
  console.log(`  └── org_member of Core Brain (owner)`);
  console.log("");
  console.log(`Tookitaki Customer (${customer.id}):`);
  console.log(`  └── Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`  └── Members (customer_members + org_members):`);
  for (const u of TOOKITAKI_USERS) {
    console.log(`       ${u.email} (${u.role}) — Password: ${u.password}`);
  }
  console.log("\nDone!\n");
}

main().catch(console.error);
