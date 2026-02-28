/**
 * Connector Tools Registry
 * ========================
 * Builds Claude tool_use schemas from a workspace's active connectors.
 * The agentic executor calls this to know what tools an AI Worker has available.
 *
 * Adding a new connector? Add its tool definitions here + the connector type.
 * Zero other code changes needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface ConnectorTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  connectorType: string; // which connector this belongs to
}

/** Map connector_type → list of tools it exposes */
const CONNECTOR_TOOL_DEFINITIONS: Record<string, ConnectorTool[]> = {
  jira: [
    {
      name: "jira_create_issue",
      description:
        "Create a Jira issue (bug, task, story, epic, incident). Use for tracking work items, bugs, feature requests, or incidents.",
      connectorType: "jira",
      input_schema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "Jira project key (e.g. 'ENG', 'OPS')",
          },
          summary: { type: "string", description: "Issue title/summary" },
          description: {
            type: "string",
            description: "Detailed description in markdown",
          },
          issuetype: {
            type: "string",
            enum: ["Bug", "Task", "Story", "Epic", "Incident"],
            description: "Issue type",
          },
          priority: {
            type: "string",
            enum: ["Highest", "High", "Medium", "Low", "Lowest"],
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply",
          },
          assignee: {
            type: "string",
            description: "Assignee email or username",
          },
          storyPoints: { type: "number", description: "Story points estimate" },
        },
        required: ["project", "summary"],
      },
    },
    {
      name: "jira_add_comment",
      description: "Add a comment to an existing Jira issue.",
      connectorType: "jira",
      input_schema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "Jira issue key (e.g. 'ENG-123')",
          },
          comment: {
            type: "string",
            description: "Comment text in markdown",
          },
        },
        required: ["issueKey", "comment"],
      },
    },
  ],

  confluence: [
    {
      name: "confluence_create_page",
      description:
        "Create a Confluence page. Use for documentation, PRDs, post-mortems, reports, runbooks, QBRs.",
      connectorType: "confluence",
      input_schema: {
        type: "object",
        properties: {
          spaceKey: {
            type: "string",
            description: "Confluence space key (e.g. 'ENG', 'PRODUCT')",
          },
          title: { type: "string", description: "Page title" },
          body: {
            type: "string",
            description: "Page content in markdown",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels for the page",
          },
        },
        required: ["spaceKey", "title", "body"],
      },
    },
    {
      name: "confluence_update_page",
      description: "Update an existing Confluence page content.",
      connectorType: "confluence",
      input_schema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Confluence page ID to update",
          },
          title: { type: "string", description: "New page title" },
          body: {
            type: "string",
            description: "New page content in markdown",
          },
        },
        required: ["pageId", "body"],
      },
    },
  ],

  slack: [
    {
      name: "slack_post_message",
      description:
        "Post a message to a Slack channel or DM. Use for notifications, alerts, approvals, status updates.",
      connectorType: "slack",
      input_schema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Channel name (e.g. '#ops') or user ID for DM",
          },
          text: {
            type: "string",
            description:
              "Message text (supports Slack markdown: *bold*, _italic_, `code`)",
          },
          urgency: {
            type: "string",
            enum: ["low", "normal", "high", "critical"],
            description: "Message urgency — affects formatting",
          },
        },
        required: ["channel", "text"],
      },
    },
  ],

  github: [
    {
      name: "github_create_issue",
      description:
        "Create a GitHub issue for bug tracking, feature requests, or technical debt.",
      connectorType: "github",
      input_schema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Repository in 'org/repo' format",
          },
          title: { type: "string", description: "Issue title" },
          body: {
            type: "string",
            description: "Issue body in markdown",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply",
          },
          assignees: {
            type: "array",
            items: { type: "string" },
            description: "GitHub usernames to assign",
          },
        },
        required: ["repo", "title"],
      },
    },
    {
      name: "github_create_pull_request",
      description: "Create a GitHub pull request.",
      connectorType: "github",
      input_schema: {
        type: "object",
        properties: {
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          head: { type: "string", description: "Source branch" },
          base: {
            type: "string",
            description: "Target branch (e.g. 'main')",
          },
        },
        required: ["repo", "title", "head", "base"],
      },
    },
  ],

  linear: [
    {
      name: "linear_create_issue",
      description:
        "Create a Linear issue. Use when Linear is connected instead of Jira for issue tracking.",
      connectorType: "linear",
      input_schema: {
        type: "object",
        properties: {
          teamKey: { type: "string", description: "Linear team key" },
          title: { type: "string", description: "Issue title" },
          description: {
            type: "string",
            description: "Issue description in markdown",
          },
          priority: {
            type: "number",
            description:
              "Priority 0-4 (0=no priority, 1=urgent, 2=high, 3=medium, 4=low)",
          },
          labels: { type: "array", items: { type: "string" } },
        },
        required: ["teamKey", "title"],
      },
    },
  ],

  freshworks: [
    {
      name: "freshworks_create_ticket",
      description: "Create a Freshworks support ticket.",
      connectorType: "freshworks",
      input_schema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          description: { type: "string" },
          priority: {
            type: "number",
            description: "1=low, 2=medium, 3=high, 4=urgent",
          },
          type: { type: "string", description: "Ticket type" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["subject", "description"],
      },
    },
  ],
};

/**
 * Query the workspace's active connectors and return tool schemas for each.
 * This is what the agentic executor calls to know what tools are available.
 */
export async function getWorkspaceTools(
  supabase: SupabaseClient,
  organizationId: string
): Promise<ConnectorTool[]> {
  try {
    const { data: connectors, error } = await supabase
      .from("connector_instances")
      .select("connector_type, status, config")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(50);

    if (error || !connectors?.length) {
      logger.warn("[ToolsRegistry] No active connectors found", {
        organizationId,
        error: error?.message,
      });
      return [];
    }

    const tools: ConnectorTool[] = [];
    const seenTypes = new Set<string>();

    for (const connector of connectors) {
      const connType = (connector.connector_type as string)?.toLowerCase();
      if (!connType || seenTypes.has(connType)) continue;
      seenTypes.add(connType);

      const connectorTools = CONNECTOR_TOOL_DEFINITIONS[connType];
      if (connectorTools) {
        tools.push(...connectorTools);
      }
    }

    logger.warn("[ToolsRegistry] Built tool schemas", {
      organizationId,
      connectorTypes: Array.from(seenTypes),
      toolCount: tools.length,
    });

    return tools;
  } catch (err) {
    logger.warn("[ToolsRegistry] Failed to get workspace tools (non-fatal)", {
      err,
      organizationId,
    });
    return [];
  }
}

/**
 * Convert ConnectorTool[] to the Anthropic tool_use format.
 */
export function toAnthropicTools(tools: ConnectorTool[]): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Record<string, unknown>,
  }));
}

/** Map tool name → connector type for writeback_queue routing */
const TOOL_CONNECTOR_TYPE_MAP: Record<string, string> = {
  jira_create_issue: "jira",
  jira_add_comment: "jira",
  confluence_create_page: "confluence",
  confluence_update_page: "confluence",
  slack_post_message: "slack",
  github_create_issue: "github",
  github_create_pull_request: "github",
  linear_create_issue: "linear",
  freshworks_create_ticket: "freshworks",
};

/** Map tool name → writeback action_type */
const TOOL_ACTION_TYPE_MAP: Record<string, string> = {
  jira_create_issue: "jira_create_issue",
  jira_add_comment: "jira_add_comment",
  confluence_create_page: "confluence_create_page",
  confluence_update_page: "confluence_update_page",
  slack_post_message: "slack_post_message",
  github_create_issue: "github_create_issue",
  github_create_pull_request: "github_create_pull_request",
  linear_create_issue: "linear_create_issue",
  freshworks_create_ticket: "freshworks_create_ticket",
};

/**
 * Execute a tool call returned by Claude.
 * Routes the tool call to the writeback_queue.
 */
export async function executeToolCall(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const actionType = TOOL_ACTION_TYPE_MAP[toolName];
    const connectorType = TOOL_CONNECTOR_TYPE_MAP[toolName];

    if (!actionType || !connectorType) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    const { error } = await supabase.from("writeback_queue").insert({
      organization_id: organizationId,
      rule_id: null,
      artifact_id: null,
      job_id: jobId,
      connector_type: connectorType,
      action_type: actionType,
      action_payload: toolInput,
      status: "pending",
      attempts: 0,
      last_error: null,
      external_ref: null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, result: { queued: true, actionType, toolName } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
