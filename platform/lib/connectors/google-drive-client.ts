/**
 * Google Drive API v3 Client (REST, no SDK)
 * ==========================================
 *
 * Pure fetch()-based wrapper for Google Drive API v3.
 * Supports listing files in a folder, downloading file content,
 * and exporting Google-native document formats to plain text.
 *
 * Token management: callers pass an access_token directly.
 * OAuth token acquisition and storage are handled by the auth route.
 *
 * Supported MIME types:
 *   - application/vnd.google-apps.document  → export as text/plain
 *   - application/vnd.google-apps.spreadsheet → export as text/csv
 *   - text/plain                             → direct download
 *   - application/pdf                        → download as ArrayBuffer → base64
 *   - application/vnd.openxmlformats-officedocument.wordprocessingml.document → download as ArrayBuffer → base64
 */

import { logger } from "@/lib/logger";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_EXPORT_BASE = "https://www.googleapis.com/drive/v3/files";

/** Delay between consecutive Google API calls to respect rate limits. */
const RATE_LIMIT_DELAY_MS = 200;

/** Maximum file size to download (10 MB — Lambda memory safety). */
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

// ── Types ──────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
}

export interface DriveFileListOptions {
  /** Max results per page (default: 100, max: 1000). */
  pageSize?: number;
  /** pageToken from a previous listGoogleDriveFiles() call for pagination. */
  pageToken?: string;
  /** Only return files with mimeTypes in this set. Empty = all supported types. */
  mimeTypeFilter?: string[];
  /** Additional Drive query string to append to the q parameter. */
  extraQuery?: string;
}

export interface DriveFileListResult {
  files: DriveFile[];
  nextPageToken?: string;
  totalFilesInResponse: number;
}

/**
 * Result of downloading a Google Drive file.
 *
 * - For text/plain and Google Docs exports: content is the raw text string.
 * - For PDFs and DOCX: content is a base64-encoded string of the binary.
 *   The caller (batch ingestion cron) uses needsPdfParsing to decide how to handle it.
 */
export interface DriveFileContent {
  fileId: string;
  fileName: string;
  mimeType: string;
  /** Text content (for text/* exports) or base64-encoded binary (for PDFs/DOCX). */
  content: string;
  /** True when content is base64-encoded binary that needs external PDF/DOCX parsing. */
  needsBinaryParsing: boolean;
  /** Encoding of the content field. 'utf-8' for text, 'base64' for binary. */
  encoding: "utf-8" | "base64";
  /** Size in bytes of the downloaded content. */
  sizeBytes: number;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform a Drive API fetch with bearer token auth and error handling.
 * Throws on non-2xx responses with a descriptive error message.
 */
async function driveApiFetch(
  accessToken: string,
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorDetail = `${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json() as { error?: { message?: string } };
      if (errorBody?.error?.message) {
        errorDetail = `${response.status}: ${errorBody.error.message}`;
      }
    } catch {
      // Ignore JSON parse failure — use status text
    }
    throw new Error(`Google Drive API error — ${errorDetail} (${url})`);
  }

  return response;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * List files in a Google Drive folder.
 *
 * Queries files where `folderId` is the parent. Returns up to `pageSize` results.
 * Pass `nextPageToken` from a previous response to paginate.
 *
 * By default lists only supported document types (Google Docs, PDFs, text, DOCX).
 * Pass `mimeTypeFilter` to restrict to specific types, or `[]` to skip the filter.
 */
export async function listGoogleDriveFiles(
  accessToken: string,
  folderId: string,
  options: DriveFileListOptions = {},
): Promise<DriveFileListResult> {
  const {
    pageSize = 100,
    pageToken,
    mimeTypeFilter,
    extraQuery,
  } = options;

  // Default to supported document MIME types
  const supportedMimeTypes = mimeTypeFilter ?? [
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "text/plain",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  // Build query: files in the specified folder, not trashed
  let q = `'${folderId}' in parents and trashed = false`;

  if (supportedMimeTypes.length > 0) {
    const mimeTypeQ = supportedMimeTypes
      .map((mime) => `mimeType = '${mime}'`)
      .join(" or ");
    q += ` and (${mimeTypeQ})`;
  }

  if (extraQuery) {
    q += ` and ${extraQuery}`;
  }

  const params = new URLSearchParams({
    q,
    pageSize: String(Math.min(pageSize, 1000)),
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `${DRIVE_API_BASE}/files?${params.toString()}`;

  logger.warn("[google-drive-client] Listing files", { folderId, pageSize, hasPageToken: !!pageToken });

  const response = await driveApiFetch(accessToken, url);
  const data = await response.json() as {
    files?: DriveFile[];
    nextPageToken?: string;
  };

  const files = data.files ?? [];

  return {
    files,
    nextPageToken: data.nextPageToken,
    totalFilesInResponse: files.length,
  };
}

/**
 * Determine the best download method and MIME type for a Drive file.
 *
 * Google Docs/Sheets cannot be downloaded directly — they must be exported.
 * PDFs and other binaries are downloaded as ArrayBuffer and base64-encoded.
 * Plain text files are downloaded directly as UTF-8 strings.
 */
function resolveDownloadStrategy(mimeType: string): {
  method: "export" | "direct-text" | "direct-binary";
  exportMimeType?: string;
} {
  switch (mimeType) {
    case "application/vnd.google-apps.document":
      return { method: "export", exportMimeType: "text/plain" };
    case "application/vnd.google-apps.spreadsheet":
      return { method: "export", exportMimeType: "text/csv" };
    case "text/plain":
    case "text/markdown":
    case "text/csv":
      return { method: "direct-text" };
    case "application/pdf":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    default:
      return { method: "direct-binary" };
  }
}

/**
 * Download the content of a Google Drive file.
 *
 * - Google Docs/Sheets: exported to text/plain or text/csv via the export API.
 * - Text files: downloaded directly as UTF-8.
 * - PDFs / DOCX: downloaded as binary and base64-encoded.
 *
 * Returns a DriveFileContent with encoding info so the caller knows
 * how to handle the content (parse PDF, decode base64, etc.).
 */
export async function downloadGoogleDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string,
  fileName = "unknown",
): Promise<DriveFileContent> {
  const strategy = resolveDownloadStrategy(mimeType);

  logger.warn("[google-drive-client] Downloading file", {
    fileId,
    fileName,
    mimeType,
    strategy: strategy.method,
  });

  if (strategy.method === "export") {
    // Google-native format export via /export endpoint
    const params = new URLSearchParams({
      mimeType: strategy.exportMimeType!,
    });
    const url = `${DRIVE_EXPORT_BASE}/${fileId}/export?${params.toString()}`;
    const response = await driveApiFetch(accessToken, url);
    const text = await response.text();

    return {
      fileId,
      fileName,
      mimeType,
      content: text,
      needsBinaryParsing: false,
      encoding: "utf-8",
      sizeBytes: text.length,
    };
  }

  if (strategy.method === "direct-text") {
    // Plain text direct download via alt=media
    const url = `${DRIVE_EXPORT_BASE}/${fileId}?alt=media`;
    const response = await driveApiFetch(accessToken, url);

    // Check size before reading
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `File "${fileName}" exceeds max download size (${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)} MB)`,
      );
    }

    const text = await response.text();
    return {
      fileId,
      fileName,
      mimeType,
      content: text,
      needsBinaryParsing: false,
      encoding: "utf-8",
      sizeBytes: text.length,
    };
  }

  // direct-binary: PDF, DOCX, etc.
  const url = `${DRIVE_EXPORT_BASE}/${fileId}?alt=media`;
  const response = await driveApiFetch(accessToken, url);

  // Check size before reading
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `File "${fileName}" exceeds max download size (${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)} MB)`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert to base64 without using Buffer (edge runtime compatible)
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64Content = btoa(binary);

  return {
    fileId,
    fileName,
    mimeType,
    content: base64Content,
    needsBinaryParsing: true,
    encoding: "base64",
    sizeBytes: arrayBuffer.byteLength,
  };
}

/**
 * Convenience wrapper: determine download method from mimeType and fetch content.
 *
 * Adds the inter-call delay to honour Drive API rate limits.
 * Use this inside loops — it automatically waits RATE_LIMIT_DELAY_MS before returning.
 */
export async function getGoogleDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
  fileName?: string,
): Promise<DriveFileContent> {
  try {
    const result = await downloadGoogleDriveFile(accessToken, fileId, mimeType, fileName);
    // Rate limit courtesy delay after each download
    await sleep(RATE_LIMIT_DELAY_MS);
    return result;
  } catch (err) {
    logger.warn("[google-drive-client] File download failed", {
      fileId,
      fileName,
      mimeType,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Recursively list all files in a Drive folder including sub-folders.
 *
 * Stops when maxFiles is reached. Each page fetch adds RATE_LIMIT_DELAY_MS delay.
 * Returns a flat list of all discovered files.
 */
export async function listAllFilesInFolder(
  accessToken: string,
  folderId: string,
  options: {
    maxFiles?: number;
    mimeTypeFilter?: string[];
  } = {},
): Promise<DriveFile[]> {
  const { maxFiles = 500, mimeTypeFilter } = options;
  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    if (allFiles.length >= maxFiles) break;

    const result = await listGoogleDriveFiles(accessToken, folderId, {
      pageSize: Math.min(100, maxFiles - allFiles.length),
      pageToken,
      mimeTypeFilter,
    });

    allFiles.push(...result.files);
    pageToken = result.nextPageToken;

    if (pageToken) {
      // Rate limit delay between paginated requests
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  } while (pageToken && allFiles.length < maxFiles);

  logger.warn("[google-drive-client] Folder listing complete", {
    folderId,
    totalFiles: allFiles.length,
  });

  return allFiles;
}
