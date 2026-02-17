/**
 * Seed Script: Create demo users and org for Tookitaki
 *
 * Usage: npx tsx scripts/seed-users.ts
 *
 * Creates:
 * 1. Platform admin: abhishek@monetiz3.com (if not exists)
 * 2. Tookitaki org with users:
 *    - abhishek@tookitaki.com (owner)
 *    - jeeta@tookitaki.com (admin)
 *    - yuan.luo@tookitaki.com (member)
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

// ─── User Definitions ──────────────────────────────────────────

const PLATFORM_ADMIN = {
  email: "abhishek@monetiz3.com",
  password: "NexusBrain2025!",
};

const TOOKITAKI_ORG = {
  name: "Tookitaki",
  slug: "tookitaki",
  plan: "enterprise",
  settings: {
    industry: "AML Compliance Software",
    countries: ["SG", "MY", "TW", "AU", "PH"],
    arr: 10200000,
    headcount: 87,
    description: "Enterprise AML compliance platform — RegTech SaaS across 5 APAC countries",
  },
};

const TOOKITAKI_USERS = [
  { email: "abhishek@tookitaki.com", password: "Tookitaki@2025!", role: "owner" as const },
  { email: "jeeta@tookitaki.com", password: "Tookitaki@Jeeta1", role: "admin" as const },
  { email: "yuan.luo@tookitaki.com", password: "Tookitaki@Yuan1!", role: "member" as const },
];

// ─── Helpers ───────────────────────────────────────────────────

async function findOrCreateUser(email: string, password: string) {
  // Check if user exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === email);

  if (existing) {
    console.log(`  [exists] ${email} (${existing.id})`);
    return existing;
  }

  // Create user
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm email
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
    console.log(`    [exists] membership for user ${userId} in org ${orgId}`);
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
    console.log(`    [added] user ${userId} as ${role}${isPlatformAdmin ? " (platform admin)" : ""}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("\n=== NexusBrain User Seed ===\n");

  // 1. Create platform admin
  console.log("1. Platform Admin:");
  const adminUser = await findOrCreateUser(PLATFORM_ADMIN.email, PLATFORM_ADMIN.password);

  if (adminUser) {
    // Ensure admin is in the Core Brain org as platform admin
    const CORE_BRAIN_ORG_ID = "00000000-0000-4000-a000-000000000001";
    await addOrgMember(CORE_BRAIN_ORG_ID, adminUser.id, "owner", true);
  }

  // 2. Create Tookitaki org
  console.log("\n2. Tookitaki Organization:");
  const org = await findOrCreateOrg(TOOKITAKI_ORG.name, TOOKITAKI_ORG.slug, TOOKITAKI_ORG.plan, TOOKITAKI_ORG.settings);
  if (!org) {
    console.error("Failed to create Tookitaki org. Aborting.");
    process.exit(1);
  }

  // 2b. S3 storage config + connector (auto-provisioned by DB trigger, but ensure connector exists)
  console.log("\n   Verifying S3 storage provisioning...");
  // storage_config is auto-set by provision_new_org() trigger on INSERT
  // Just ensure the s3-storage connector exists (belt + suspenders)
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
        purpose: "Org-level file storage (CSV, JSON, reports)",
      },
    });
    console.log("   [created] S3 storage connector");
  } else {
    console.log("   [exists] S3 storage connector (auto-provisioned)");
  }

  // 3. Create Tookitaki users and add to org
  console.log("\n3. Tookitaki Users:");
  for (const userDef of TOOKITAKI_USERS) {
    const user = await findOrCreateUser(userDef.email, userDef.password);
    if (user) {
      await addOrgMember(org.id, user.id, userDef.role);
    }
  }

  // 4. Summary
  console.log("\n=== Summary ===\n");
  console.log("Platform Admin:");
  console.log(`  Email: ${PLATFORM_ADMIN.email}`);
  console.log(`  Password: ${PLATFORM_ADMIN.password}`);
  console.log("");
  console.log(`Tookitaki Organization (${org.id}):`);
  for (const u of TOOKITAKI_USERS) {
    console.log(`  ${u.email} (${u.role}) — Password: ${u.password}`);
  }
  console.log("\nDone!\n");
}

main().catch(console.error);
