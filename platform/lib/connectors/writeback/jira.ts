import { logger } from "@/lib/logger";
import type { JiraCreateTicketPayload, WritebackActionResult } from "./types";

const JIRA_API_TIMEOUT_MS = 30_000;

interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

interface JiraErrorResponse {
  errors?: Record<string, string>;
  errorMessages?: string[];
}

/**
 * Build an Atlassian Document Format (ADF) doc from a plain text string.
 * Jira Cloud REST API v3 requires description in ADF format.
 */
function buildADFDescription(text: string): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
}

/**
 * Parse Atlassian error response body into a readable string.
 */
function parseJiraError(body: JiraErrorResponse): string {
  const parts: string[] = [];

  if (body.errorMessages && body.errorMessages.length > 0) {
    parts.push(...body.errorMessages);
  }

  if (body.errors) {
    const fieldErrors = Object.entries(body.errors).map(
      ([field, msg]) => `${field}: ${msg}`
    );
    parts.push(...fieldErrors);
  }

  return parts.length > 0 ? parts.join("; ") : "Unknown Jira error";
}

/**
 * Create a Jira issue using the Jira Cloud REST API v3.
 *
 * @param token   - Atlassian API token (Personal Access Token or OAuth access token)
 * @param domain  - Jira Cloud subdomain (e.g. "mycompany" for mycompany.atlassian.net)
 * @param payload - Project key, summary, description, issue type, and optional labels
 * @returns WritebackActionResult with jira_key and jira_id on success
 */
export async function createJiraTicket(
  token: string,
  domain: string,
  payload: JiraCreateTicketPayload
): Promise<WritebackActionResult> {
  const url = `https://${domain}.atlassian.net/rest/api/3/issue`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JIRA_API_TIMEOUT_MS);

  const body = {
    fields: {
      project: { key: payload.projectKey },
      summary: payload.summary,
      description: buildADFDescription(payload.description),
      issuetype: { name: payload.issuetype ?? "Task" },
      ...(payload.labels && payload.labels.length > 0
        ? { labels: payload.labels }
        : {}),
    },
  };

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
      logger.error("[writeback/jira] Non-JSON response:", {
        status: response.status,
        body: responseText.slice(0, 500),
      });
      return {
        success: false,
        error: `Jira returned non-JSON response (HTTP ${response.status})`,
      };
    }

    if (!response.ok) {
      const errorMessage = parseJiraError(data as JiraErrorResponse);
      logger.warn("[writeback/jira] API error:", {
        status: response.status,
        domain,
        projectKey: payload.projectKey,
        error: errorMessage,
      });
      return {
        success: false,
        error: `Jira API error (${response.status}): ${errorMessage}`,
      };
    }

    const issue = data as unknown as JiraCreateIssueResponse;

    return {
      success: true,
      externalRef: {
        jira_key: issue.key,
        jira_id: issue.id,
      },
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "Jira API request timed out after 30s"
      : `Jira API request failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("[writeback/jira] Fetch error:", message);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
