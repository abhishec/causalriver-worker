/**
 * Org-Level Storage Provider (AWS S3)
 * ====================================
 * Unified storage abstraction for org-scoped file operations.
 *
 * All files are stored in a shared S3 bucket with org-level prefixes:
 *   s3://nexusbrain-org-data/{orgId}/filename.ext
 *
 * Falls back to Supabase Storage when S3 is not configured (dev/local).
 *
 * Usage:
 *   const storage = getOrgStorage();
 *   await storage.upload(orgId, 'gl-data.json', buffer, 'application/json');
 *   const data = await storage.download(orgId, 'gl-data.json');
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────

export interface StorageFile {
  key: string; // relative path within org (e.g., 'gl-data.json')
  fullKey: string; // full S3 key (e.g., '{orgId}/gl-data.json')
  size: number;
  lastModified: Date | null;
  contentType?: string;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

// ── OrgStorageProvider ─────────────────────────────────────────────

export class OrgStorageProvider {
  private s3: S3Client;
  private bucket: string;
  private cache = new Map<string, { data: Buffer; cachedAt: number }>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const region = process.env.AWS_REGION || "ap-southeast-1";
    this.bucket =
      process.env.AWS_S3_BUCKET_NAME || "nexusbrain-org-data";

    // If explicit credentials are provided, use them.
    // Otherwise, S3Client will use the default credential chain
    // (ECS task role, EC2 instance profile, env vars, etc.)
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;

    this.s3 = new S3Client({
      region,
      ...(credentials ? { credentials } : {}),
    });
  }

  /** Check if S3 is configured */
  get isConfigured(): boolean {
    return !!(
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_REGION
    );
  }

  /** Get the bucket name */
  get bucketName(): string {
    return this.bucket;
  }

  // ── Core Operations ──────────────────────────────────────────────

  /**
   * Upload a file to org-scoped storage
   */
  async upload(
    orgId: string,
    key: string,
    body: Buffer | string | Uint8Array,
    options?: UploadOptions
  ): Promise<{ key: string; bucket: string }> {
    const fullKey = this.orgKey(orgId, key);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: typeof body === "string" ? Buffer.from(body) : body,
        ContentType: options?.contentType || "application/octet-stream",
        Metadata: options?.metadata,
        ServerSideEncryption: "AES256",
      })
    );

    // Invalidate cache for this key
    this.cache.delete(fullKey);

    logger.debug(`[OrgStorage] Uploaded: s3://${this.bucket}/${fullKey}`);
    return { key: fullKey, bucket: this.bucket };
  }

  /**
   * Download a file from org-scoped storage
   */
  async download(orgId: string, key: string): Promise<Buffer> {
    const fullKey = this.orgKey(orgId, key);

    // Check cache
    const cached = this.cache.get(fullKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.data;
    }

    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      })
    );

    if (!response.Body) {
      throw new Error(`Empty response for s3://${this.bucket}/${fullKey}`);
    }

    // Convert readable stream to Buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);

    // Cache it
    this.cache.set(fullKey, { data, cachedAt: Date.now() });

    return data;
  }

  /**
   * Download and parse JSON from org-scoped storage
   */
  async downloadJSON<T = unknown>(orgId: string, key: string): Promise<T> {
    const buffer = await this.download(orgId, key);
    try {
      return JSON.parse(buffer.toString("utf-8")) as T;
    } catch {
      throw new Error(`Failed to parse JSON from storage key: ${key}`);
    }
  }

  /**
   * List files in an org's storage (optionally with a prefix)
   */
  async list(orgId: string, prefix?: string): Promise<StorageFile[]> {
    const orgPrefix = prefix
      ? `${orgId}/${prefix}`
      : `${orgId}/`;

    const response = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: orgPrefix,
      })
    );

    if (!response.Contents) return [];

    return response.Contents.map((obj) => ({
      key: obj.Key!.replace(`${orgId}/`, ""),
      fullKey: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || null,
    }));
  }

  /**
   * Delete a file from org-scoped storage
   */
  async delete(orgId: string, key: string): Promise<void> {
    const fullKey = this.orgKey(orgId, key);

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      })
    );

    this.cache.delete(fullKey);
    logger.debug(`[OrgStorage] Deleted: s3://${this.bucket}/${fullKey}`);
  }

  /**
   * Check if a file exists in org-scoped storage
   */
  async exists(orgId: string, key: string): Promise<boolean> {
    const fullKey = this.orgKey(orgId, key);

    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        })
      );
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Generate a pre-signed URL for temporary access
   */
  async getSignedUrl(
    orgId: string,
    key: string,
    expiresIn = 3600
  ): Promise<string> {
    const fullKey = this.orgKey(orgId, key);

    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      }),
      { expiresIn }
    );

    return url;
  }

  /**
   * Get file metadata (size, content type, last modified)
   */
  async getMetadata(
    orgId: string,
    key: string
  ): Promise<{
    size: number;
    contentType: string | undefined;
    lastModified: Date | undefined;
  } | null> {
    const fullKey = this.orgKey(orgId, key);

    try {
      const response = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        })
      );

      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType,
        lastModified: response.LastModified,
      };
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Clear the in-memory cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Internal Helpers ─────────────────────────────────────────────

  private orgKey(orgId: string, key: string): string {
    // Ensure we don't double-prefix
    if (key.startsWith(`${orgId}/`)) return key;
    return `${orgId}/${key}`;
  }
}

// ── Singleton ──────────────────────────────────────────────────────

let _instance: OrgStorageProvider | null = null;

/**
 * Get the singleton OrgStorageProvider instance.
 * Uses S3 when configured, throws if S3 is not available.
 */
export function getOrgStorage(): OrgStorageProvider {
  if (!_instance) {
    _instance = new OrgStorageProvider();
  }
  return _instance;
}

/**
 * Check if S3 storage is available (env vars configured)
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.AWS_ACCESS_KEY_ID
  );
}
