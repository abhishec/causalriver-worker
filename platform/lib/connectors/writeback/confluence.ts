import { logger } from "@/lib/logger";
import type { WritebackActionResult } from "./types";

const CONFLUENCE_API_TIMEOUT_MS = 30_000;

// ─── Internal Types ───────────────────────────────────────────────────────────

interface ConfluencePageResponse {
  id: string;
  title: string;
  _links: {
    webui?: string;
    base?: string;
  };
}

interface ConfluenceErrorResponse {
  message?: string;
  errors?: Array<{ message: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a plain text string to Confluence storage format (XHTML-like).
 * Double newlines become paragraph breaks; HTML special characters are escaped.
 */
function textToStorageFormat(text: string): string {
  return text
    .split("\n\n")
    .map(
      (para) =>
        `<p>${para
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</p>`
    )
    .join("\n");
}

/**
 * Parse a Confluence error response into a human-readable string.
 */
function parseConfluenceError(body: ConfluenceErrorResponse): string {
  if (body.message) return body.message;
  if (body.errors && body.errors.length > 0) {
    return body.errors.map((e) => e.message).join("; ");
  }
  return "Unknown Confluence error";
}

/**
 * Build the base URL for the Confluence API v2 for a given site domain.
 * `site` is expected to be the subdomain (e.g. "mycompany") or full domain.
 */
function buildApiBase(site: string): string {
  // Accept either "mycompany" or "mycompany.atlassian.net"
  const host = site.includes(".") ? site : `${site}.atlassian.net`;
  return `https://${host}/wiki/api/v2`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new Confluence page in a space using the REST API v2.
 *
 * @param params.organizationId - Used for credential lookup (not sent to API)
 * @param params.spaceKey       - Target space key (e.g. "PROJ")
 * @param params.title          - Page title
 * @param params.content        - Plain text body; converted to storage format
 * @param params.parentPageId   - Optional parent page ID for nesting
 * @param token                 - OAuth access token for the Confluence site
 * @param site                  - Confluence site subdomain or full domain
 * @returns { pageId, url } on success or { error } on failure — never throws
 */
export async function createConfluencePage(params: {
  organizationId: string;
  spaceKey: string;
  title: string;
  content: string;
  parentPageId?: string;
  token: string;
  site: string;
}): Promise<{ pageId: string; url: string } | { error: string }> {
  const { spaceKey, title, content, parentPageId, token, site } = params;
  const apiBase = buildApiBase(site);
  const url = `${apiBase}/pages`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFLUENCE_API_TIMEOUT_MS);

  const body: Record<string, unknown> = {
    spaceId: spaceKey, // v2 API uses spaceId (key works for lookup)
    status: "current",
    title,
    body: {
      representation: "storage",
      value: textToStorageFormat(content),
    },
  };

  if (parentPageId) {
    body.parentId = parentPageId;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      logger.warn("[writeback/confluence] Non-JSON response from create page:", {
        status: response.status,
        body: responseText.slice(0, 500),
        spaceKey,
        title,
      });
      return {
        error: `Confluence returned non-JSON response (HTTP ${response.status})`,
      };
    }

    if (!response.ok) {
      const errorMessage = parseConfluenceError(data as ConfluenceErrorResponse);
      logger.warn("[writeback/confluence] Create page API error:", {
        status: response.status,
        site,
        spaceKey,
        title,
        error: errorMessage,
      });
      return {
        error: `Confluence API error (${response.status}): ${errorMessage}`,
      };
    }

    const page = data as unknown as ConfluencePageResponse;
    const base = page._links?.base ?? `https://${site}.atlassian.net/wiki`;
    const webui = page._links?.webui ?? `/pages/${page.id}`;

    return {
      pageId: page.id,
      url: `${base}${webui}`,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "Confluence API request timed out after 30s"
      : `Confluence API request failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn("[writeback/confluence] Fetch error (createPage):", message);
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Update an existing Confluence page using the REST API v2.
 *
 * Confluence requires the current `version.number` for optimistic locking.
 * Pass the version retrieved from a prior read; the API will reject stale
 * updates with HTTP 409.
 *
 * @param params.organizationId - Used for credential lookup (not sent to API)
 * @param params.pageId         - ID of the page to update
 * @param params.title          - New title (required by v2 API even if unchanged)
 * @param params.content        - Plain text body; converted to storage format
 * @param params.version        - Current page version number (for optimistic lock)
 * @param token                 - OAuth access token for the Confluence site
 * @param site                  - Confluence site subdomain or full domain
 * @returns { pageId, url } on success or { error } on failure — never throws
 */
export async function updateConfluencePage(params: {
  organizationId: string;
  pageId: string;
  title: string;
  content: string;
  version: number;
  token: string;
  site: string;
}): Promise<{ pageId: string; url: string } | { error: string }> {
  const { pageId, title, content, version, token, site } = params;
  const apiBase = buildApiBase(site);
  const url = `${apiBase}/pages/${pageId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFLUENCE_API_TIMEOUT_MS);

  const body = {
    id: pageId,
    status: "current",
    title,
    version: {
      number: version,
      message: "Updated by BrainOS AI Worker",
    },
    body: {
      representation: "storage",
      value: textToStorageFormat(content),
    },
  };

  try {
    const response = await fetch(url, {
      method: "PUT",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      logger.warn("[writeback/confluence] Non-JSON response from update page:", {
        status: response.status,
        body: responseText.slice(0, 500),
        pageId,
        title,
      });
      return {
        error: `Confluence returned non-JSON response (HTTP ${response.status})`,
      };
    }

    if (!response.ok) {
      const errorMessage = parseConfluenceError(data as ConfluenceErrorResponse);
      logger.warn("[writeback/confluence] Update page API error:", {
        status: response.status,
        site,
        pageId,
        title,
        error: errorMessage,
      });
      return {
        error: `Confluence API error (${response.status}): ${errorMessage}`,
      };
    }

    const page = data as unknown as ConfluencePageResponse;
    const base = page._links?.base ?? `https://${site}.atlassian.net/wiki`;
    const webui = page._links?.webui ?? `/pages/${page.id}`;

    return {
      pageId: page.id,
      url: `${base}${webui}`,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "Confluence API request timed out after 30s"
      : `Confluence API request failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.warn("[writeback/confluence] Fetch error (updatePage):", message);
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Writeback adapter ────────────────────────────────────────────────────────

/**
 * Adapter used by executeWritebackAction in writeback/index.ts.
 *
 * Maps flat actionPayload + credentials + config into typed function calls,
 * and normalises the return into WritebackActionResult.
 */
export async function executeConfluenceAction(
  actionType: string,
  actionPayload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<WritebackActionResult> {
  const token = credentials.access_token;
  const site =
    (config.site as string | undefined) ??
    (config.domain as string | undefined) ??
    "";

  if (typeof token !== "string" || !token) {
    logger.warn("[writeback/confluence] Missing access_token in credentials");
    return { success: false, error: "Confluence credentials missing access_token" };
  }

  if (!site) {
    logger.warn("[writeback/confluence] Missing site/domain in config");
    return { success: false, error: "Confluence config missing site or domain" };
  }

  if (actionType === "create_page") {
    const result = await createConfluencePage({
      organizationId: String(actionPayload.organizationId ?? ""),
      spaceKey: String(actionPayload.spaceKey ?? ""),
      title: String(actionPayload.title ?? ""),
      content: String(actionPayload.content ?? ""),
      parentPageId:
        typeof actionPayload.parentPageId === "string"
          ? actionPayload.parentPageId
          : undefined,
      token,
      site,
    });

    if ("error" in result) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      externalRef: { confluence_page_id: result.pageId, url: result.url },
    };
  }

  if (actionType === "update_page") {
    const result = await updateConfluencePage({
      organizationId: String(actionPayload.organizationId ?? ""),
      pageId: String(actionPayload.pageId ?? ""),
      title: String(actionPayload.title ?? ""),
      content: String(actionPayload.content ?? ""),
      version: Number(actionPayload.version ?? 1),
      token,
      site,
    });

    if ("error" in result) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      externalRef: { confluence_page_id: result.pageId, url: result.url },
    };
  }

  logger.warn("[writeback/confluence] Unknown actionType:", actionType);
  return {
    success: false,
    error: `Confluence write-back: unsupported actionType '${actionType}'. Expected 'create_page' or 'update_page'.`,
  };
}
