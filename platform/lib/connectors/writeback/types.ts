// Shared types for all write-back implementations

export interface WritebackActionResult {
  success: boolean;
  externalRef?: Record<string, unknown>; // { slack_ts, jira_key, github_issue }
  error?: string;
}

export interface SlackPostMessagePayload {
  channel: string;
  text: string;
  blocks?: unknown[];
}

export interface JiraCreateTicketPayload {
  projectKey: string;
  summary: string;
  description: string;
  issuetype?: string; // 'Task', 'Bug', 'Story'
  labels?: string[];
}

export interface GitHubCreateIssuePayload {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubAddPRCommentPayload {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
}
