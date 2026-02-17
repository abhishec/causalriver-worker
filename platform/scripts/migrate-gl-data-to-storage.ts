/**
 * Migration Script: Move GL data from local file to Supabase Storage
 *
 * Usage: npx tsx scripts/migrate-gl-data-to-storage.ts
 *
 * Migrates the 12MB gl-data.json from platform/lib/accounting-jarvis/ to
 * Supabase Storage, scoped to the PH Accounting org.
 *
 * Storage path: org-data/{orgId}/gl-data.json
 *
 * After running this:
 *   1. API routes load GL data from Supabase Storage (not local file)
 *   2. gl-data.json can be removed from the codebase
 *   3. Data is properly scoped to PH Accounting org
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import * as fs from "fs";

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

const BUCKET_NAME = "org-data";
const GL_DATA_PATH = resolve(__dirname, "../lib/accounting-jarvis/gl-data.json");

async function main() {
  console.log("=== Migrate GL Data to Supabase Storage ===\n");

  // 1. Find PH Accounting org ID
  console.log("[1/4] Looking up PH Accounting org...");
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", "ph-accounting")
    .single();

  if (orgError || !org) {
    console.error("PH Accounting org not found. Run seed-accounting-partner.ts first.");
    console.error(orgError);
    process.exit(1);
  }
  console.log(`  Found: ${org.name} (${org.id})`);

  // 2. Create storage bucket (if not exists)
  console.log("\n[2/4] Creating storage bucket...");
  const { data: existingBuckets } = await supabase.storage.listBuckets();
  const bucketExists = existingBuckets?.some((b) => b.name === BUCKET_NAME);

  if (!bucketExists) {
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ["application/json"],
    });
    if (bucketError) {
      console.error("Failed to create bucket:", bucketError);
      process.exit(1);
    }
    console.log(`  Created bucket: ${BUCKET_NAME} (private, 50MB limit)`);
  } else {
    console.log(`  Bucket already exists: ${BUCKET_NAME}`);
  }

  // 3. Upload GL data scoped to org
  console.log("\n[3/4] Uploading GL data...");
  if (!fs.existsSync(GL_DATA_PATH)) {
    console.error(`GL data file not found: ${GL_DATA_PATH}`);
    console.error("Run setup-accounting-jarvis.ts first to parse the Xero GL.");
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(GL_DATA_PATH);
  const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(1);
  const storagePath = `${org.id}/gl-data.json`;

  console.log(`  File: ${GL_DATA_PATH} (${fileSizeMB} MB)`);
  console.log(`  Storage path: ${BUCKET_NAME}/${storagePath}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadError) {
    console.error("Upload failed:", uploadError);
    process.exit(1);
  }
  console.log(`  Uploaded successfully (${fileSizeMB} MB)`);

  // 4. Verify
  console.log("\n[4/4] Verifying...");
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error("Verification failed:", downloadError);
    process.exit(1);
  }

  const text = await fileData.text();
  const parsed = JSON.parse(text);
  console.log(`  Verified: ${parsed.length} transactions downloaded from storage`);

  console.log("\n=== Migration Complete ===");
  console.log(`\nGL data is now at: ${BUCKET_NAME}/${storagePath}`);
  console.log(`Org: ${org.name} (${org.id})`);
  console.log(`\nYou can now safely remove: platform/lib/accounting-jarvis/gl-data.json`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
