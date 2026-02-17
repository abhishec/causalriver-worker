/**
 * Migration Script: Move GL data to S3 + Supabase Storage
 *
 * Usage: npx tsx scripts/migrate-gl-data-to-storage.ts
 *
 * Migrates the 12MB gl-data.json from platform/lib/accounting-jarvis/ to:
 *   1. AWS S3: s3://nexusbrain-org-data/{orgId}/gl-data.json (primary)
 *   2. Supabase Storage: org-data/{orgId}/gl-data.json (fallback)
 *
 * After running this:
 *   1. API routes load GL data from S3 first, Supabase fallback
 *   2. gl-data.json can be removed from the codebase
 *   3. Data is properly scoped to PH Accounting org
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import * as fs from "fs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

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

// S3 config
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data";
const AWS_REGION = process.env.AWS_REGION || "ap-southeast-1";
const s3Configured = !!(process.env.AWS_S3_BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID);

async function main() {
  console.log("=== Migrate GL Data to S3 + Supabase Storage ===\n");

  // 1. Find PH Accounting org ID
  console.log("[1/5] Looking up PH Accounting org...");
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

  // 2. Read local GL data
  console.log("\n[2/5] Reading local GL data...");
  if (!fs.existsSync(GL_DATA_PATH)) {
    console.error(`GL data file not found: ${GL_DATA_PATH}`);
    console.error("Run setup-accounting-jarvis.ts first to parse the Xero GL.");
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(GL_DATA_PATH);
  const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`  File: ${GL_DATA_PATH} (${fileSizeMB} MB)`);

  // 3. Upload to S3 (primary)
  console.log("\n[3/5] Uploading to AWS S3...");
  if (s3Configured) {
    try {
      const s3 = new S3Client({
        region: AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      const s3Key = `${org.id}/gl-data.json`;

      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
        })
      );
      console.log(`  Uploaded to S3: s3://${S3_BUCKET}/${s3Key} (${fileSizeMB} MB)`);

      // Verify S3
      const { Body } = await s3.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
        })
      );
      if (Body) {
        const chunks: Uint8Array[] = [];
        for await (const chunk of Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const s3Data = Buffer.concat(chunks);
        const s3Parsed = JSON.parse(s3Data.toString("utf-8"));
        console.log(`  Verified S3: ${s3Parsed.length} transactions`);
      }
    } catch (err: any) {
      console.error(`  S3 upload failed: ${err.message}`);
      console.log("  Continuing with Supabase Storage only...");
    }
  } else {
    console.log("  [skip] S3 not configured (set AWS_S3_BUCKET_NAME + AWS_ACCESS_KEY_ID)");
  }

  // 4. Upload to Supabase Storage (fallback)
  console.log("\n[4/5] Uploading to Supabase Storage...");
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

  const storagePath = `${org.id}/gl-data.json`;
  console.log(`  Storage path: ${BUCKET_NAME}/${storagePath}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadError) {
    console.error("Supabase upload failed:", uploadError);
    process.exit(1);
  }
  console.log(`  Uploaded to Supabase Storage (${fileSizeMB} MB)`);

  // 5. Verify Supabase
  console.log("\n[5/5] Verifying Supabase Storage...");
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error("Verification failed:", downloadError);
    process.exit(1);
  }

  const text = await fileData.text();
  const parsed = JSON.parse(text);
  console.log(`  Verified Supabase: ${parsed.length} transactions`);

  console.log("\n=== Migration Complete ===");
  console.log(`\nStorage locations:`);
  if (s3Configured) {
    console.log(`  S3 (primary):      s3://${S3_BUCKET}/${org.id}/gl-data.json`);
  }
  console.log(`  Supabase (fallback): ${BUCKET_NAME}/${storagePath}`);
  console.log(`Org: ${org.name} (${org.id})`);
  console.log(`\nYou can now safely remove: platform/lib/accounting-jarvis/gl-data.json`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
