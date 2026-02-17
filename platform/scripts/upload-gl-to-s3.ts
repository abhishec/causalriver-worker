/**
 * One-time script: Download GL data from Supabase Storage and upload to S3
 *
 * Usage: npx tsx scripts/upload-gl-to-s3.ts
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data";

async function main() {
  console.log("=== Upload GL Data: Supabase Storage → S3 ===\n");

  const orgId = "05a458a8-e3ab-4b6e-ba8e-108de42d7bbf"; // PH Accounting
  const storagePath = `${orgId}/gl-data.json`;

  // 1. Download from Supabase
  console.log("[1/3] Downloading GL data from Supabase Storage...");
  const { data, error } = await supabase.storage
    .from("org-data")
    .download(storagePath);

  if (error || !data) {
    console.error("Failed to download:", error?.message);
    process.exit(1);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  console.log(`  Downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

  const txns = JSON.parse(buffer.toString("utf-8"));
  console.log(`  Transactions: ${txns.length}`);

  // 2. Upload to S3
  console.log("\n[2/3] Uploading to S3...");
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storagePath,
      Body: buffer,
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    })
  );
  console.log(`  Uploaded: s3://${BUCKET}/${storagePath}`);

  // 3. Verify
  console.log("\n[3/3] Verifying S3...");
  const head = await s3.send(
    new HeadObjectCommand({
      Bucket: BUCKET,
      Key: storagePath,
    })
  );
  console.log(`  Size: ${((head.ContentLength || 0) / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Encryption: ${head.ServerSideEncryption}`);
  console.log(`  Last modified: ${head.LastModified}`);

  console.log("\n=== Done! GL data is now on S3 ===");
  console.log(`  s3://${BUCKET}/${storagePath}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
