import { logger } from "@/lib/logger";
import { addPRComment, createGitHubIssue } from "./github";
import { createJiraTicket } from "./jira";
import { postSlackMessage } from "./slack";
import type { WritebackActionResult } from "./types";

export * from "./types";
export * from "./slack";
export * from "./jira";
export * from "./github";

/**
 * Dispatch a write-back action to the appropriate connector.
 *
 * This is the unified entry point for all post-execution write-backs.
 * Called after domain execution completes to push results to external systems.
 *
 * @param connectorType  - 'slack' | 'jira' | 'github'
 * @param actionType     - Connector-specific action (e.g. 'post_message', 'create_issue', 'add_pr_comment')
 * @param actionPayload  - Action-specific parameters (channel, title, body, etc.)
 * @param credentials    - Decrypted connector credentials from get-credentials.ts
 * @param config         - Connector config row (domain, org-level settings, etc.)
 * @returns WritebackActionResult — never throws; errors are returned as { success: false }
 */
export async function executeWritebackAction(
  connectorType: string,
  actionType: string,
  actionPayload: Record<string, unknown>,
  credentials: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<WritebackActionResult> {
  logger.warn("[writeback] executeWritebackAction", {
    connectorType,
    actionType,
  });

  switch (connectorType) {
    case "slack": {
      const token = credentials.access_token;
      if (typeof token !== "string" || !token) {
        logger.error("[writeback/slack] Missing access_token in credentials");
        return { success: false, error: "Slack credentials missing access_token" };
      }

      return postSlackMessage(token, {
        channel: String(actionPayload.channel ?? ""),
        text: String(actionPayload.text ?? ""),
        blocks: Array.isArray(actionPayload.blocks)
          ? actionPayload.blocks
          : undefined,
      });
    }

    case "jira": {
      const token = credentials.access_token;
      const domain = config.domain;

      if (typeof token !== "string" || !token) {
        logger.error("[writeback/jira] Missing access_token in credentials");
        return { success: false, error: "Jira credentials missing access_token" };
      }

      if (typeof domain !== "string" || !domain) {
        logger.error("[writeback/jira] Missing domain in config");
        return { success: false, error: "Jira config missing domain" };
      }

      return createJiraTicket(token, domain, {
        projectKey: String(actionPayload.projectKey ?? ""),
        summary: String(actionPayload.summary ?? ""),
        description: String(actionPayload.description ?? ""),
        issuetype:
          typeof actionPayload.issuetype === "string"
            ? actionPayload.issuetype
            : undefined,
        labels: Array.isArray(actionPayload.labels)
          ? (actionPayload.labels as string[])
          : undefined,
      });
    }

    case "github": {
      const token = credentials.token;

      if (typeof token !== "string" || !token) {
        logger.error("[writeback/github] Missing token in credentials");
        return { success: false, error: "GitHub credentials missing token" };
      }

      if (actionType === "create_issue") {
        return createGitHubIssue(token, {
          owner: String(actionPayload.owner ?? ""),
          repo: String(actionPayload.repo ?? ""),
          title: String(actionPayload.title ?? ""),
          body: String(actionPayload.body ?? ""),
          labels: Array.isArray(actionPayload.labels)
            ? (actionPayload.labels as string[])
            : undefined,
        });
      }

      if (actionType === "add_pr_comment") {
        return addPRComment(token, {
          owner: String(actionPayload.owner ?? ""),
          repo: String(actionPayload.repo ?? ""),
          pullNumber: Number(actionPayload.pullNumber ?? 0),
          body: String(actionPayload.body ?? ""),
        });
      }

      logger.warn("[writeback/github] Unknown actionType:", actionType);
      return {
        success: false,
        error: `GitHub write-back: unsupported actionType '${actionType}'. Expected 'create_issue' or 'add_pr_comment'.`,
      };
    }

    default: {
      logger.warn("[writeback] Unknown connectorType:", connectorType);
      return {
        success: false,
        error: `Write-back not supported for connector type '${connectorType}'`,
      };
    }
  }
}
