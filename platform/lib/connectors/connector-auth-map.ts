/**
 * connector-auth-map.ts
 *
 * Shared authoritative map of every connector type to its auth method,
 * display name, OAuth route, and API key field definitions.
 *
 * Used by:
 * - /api/connectors/status/route.ts (display names)
 * - /api/connectors/setup/route.ts (validation)
 * - /api/copilot/chat/route.ts (connectorSetup SSE event)
 * - ConnectorSetupCard.tsx (render OAuth button or API key form)
 */

export interface ApiKeyField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

export interface ConnectorAuthConfig {
  displayName: string;
  /** oauth = single-click OAuth redirect (no extra params needed)
   *  oauth_domain = OAuth but requires a domain field first
   *  apikey = inline API key / credentials form
   */
  authMethod: "oauth" | "oauth_domain" | "apikey" | "browser_fsa";
  /** Server route that starts OAuth flow (GET, returns redirect) */
  oauthRoute?: string;
  /** For oauth_domain — the query param name for the domain */
  domainParam?: string;
  /** For oauth_domain — a placeholder hint for the domain field */
  domainPlaceholder?: string;
  /** For apikey — ordered list of fields to render in the form */
  fields?: ApiKeyField[];
  /** Short description shown below the connector name in the setup card */
  description?: string;
}

export const CONNECTOR_AUTH_MAP: Record<string, ConnectorAuthConfig> = {
  // ── Engineering ──────────────────────────────────────────────────────────
  github: {
    displayName: "GitHub",
    authMethod: "oauth",
    oauthRoute: "/api/connectors/github/auth",
    description: "Commits, PRs, issues, and CI/CD events",
  },
  jira: {
    displayName: "Jira",
    authMethod: "oauth",
    oauthRoute: "/api/connectors/jira/auth",
    description: "Issues, comments, and project workflows",
  },
  confluence: {
    displayName: "Confluence",
    authMethod: "oauth",
    oauthRoute: "/api/connectors/confluence/auth",
    description: "Pages, user stories, and requirements",
  },
  linear: {
    displayName: "Linear",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "API Key", secret: true }],
    description: "Issue tracking and engineering velocity",
  },
  cloudwatch: {
    displayName: "CloudWatch",
    authMethod: "apikey",
    fields: [
      { key: "accessKeyId", label: "AWS Access Key ID", placeholder: "AKIA..." },
      { key: "secretAccessKey", label: "AWS Secret Access Key", secret: true },
      { key: "region", label: "AWS Region", placeholder: "us-east-1" },
    ],
    description: "AWS CloudWatch log groups and metrics",
  },
  datadog: {
    displayName: "Datadog",
    authMethod: "apikey",
    fields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "appKey", label: "Application Key", secret: true },
      { key: "site", label: "Datadog Site", placeholder: "datadoghq.com" },
    ],
    description: "Log indexes, metrics, and APM traces",
  },
  elk: {
    displayName: "Elastic/OpenSearch",
    authMethod: "apikey",
    fields: [
      { key: "endpoint", label: "Endpoint URL", placeholder: "https://es.example.com" },
      { key: "apiKey", label: "API Key", secret: true },
    ],
    description: "Elasticsearch / OpenSearch log indexes",
  },
  logs: {
    displayName: "Generic Logs",
    authMethod: "apikey",
    fields: [
      { key: "endpoint", label: "Log Endpoint URL", placeholder: "https://logs.example.com" },
    ],
    description: "Generic HTTP log endpoint",
  },

  // ── Communication ────────────────────────────────────────────────────────
  slack: {
    displayName: "Slack",
    authMethod: "oauth",
    oauthRoute: "/api/connectors/slack/auth",
    description: "Channel messages, reactions, and threads",
  },
  google_chat: {
    displayName: "Google Chat",
    authMethod: "apikey",
    fields: [
      { key: "serviceAccountJson", label: "Service Account JSON", secret: true },
    ],
    description: "Space and direct messages",
  },

  // ── Knowledge ────────────────────────────────────────────────────────────
  notion: {
    displayName: "Notion",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "Integration Token", secret: true }],
    description: "Page updates and database changes",
  },

  // ── Support ──────────────────────────────────────────────────────────────
  freshdesk: {
    displayName: "Freshdesk",
    authMethod: "oauth_domain",
    oauthRoute: "/api/connectors/freshworks/auth",
    domainParam: "domain",
    domainPlaceholder: "yourcompany.freshdesk.com",
    description: "Support tickets and customer conversations",
  },
  freshchat: {
    displayName: "Freshchat",
    authMethod: "apikey",
    fields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "baseUrl", label: "Base URL", placeholder: "https://api.freshchat.com" },
    ],
    description: "Live chat conversations",
  },
  intercom: {
    displayName: "Intercom",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "Access Token", secret: true }],
    description: "Conversations and resolution times",
  },
  zendesk: {
    displayName: "Zendesk",
    authMethod: "apikey",
    fields: [
      { key: "subdomain", label: "Subdomain", placeholder: "yourcompany" },
      { key: "email", label: "Agent Email", placeholder: "agent@example.com" },
      { key: "apiToken", label: "API Token", secret: true },
    ],
    description: "Tickets and escalation tracking",
  },
  voice: {
    displayName: "Voice",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "API Key", secret: true }],
    description: "Call transcripts and sentiment analysis",
  },

  // ── Sales / CRM ──────────────────────────────────────────────────────────
  hubspot: {
    displayName: "HubSpot",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "Private App Access Token", secret: true }],
    description: "Deal changes and contact activity",
  },
  freshsales: {
    displayName: "Freshsales",
    authMethod: "apikey",
    fields: [
      { key: "domain", label: "Domain", placeholder: "yourcompany.myfreshworks.com" },
      { key: "apiKey", label: "API Key", secret: true },
    ],
    description: "CRM contacts, deals, and activities",
  },

  // ── Finance / Accounting ─────────────────────────────────────────────────
  stripe: {
    displayName: "Stripe",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "Secret Key", placeholder: "sk_live_...", secret: true }],
    description: "Payment events and subscriptions",
  },
  xero: {
    displayName: "Xero",
    authMethod: "apikey",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret", secret: true },
    ],
    description: "GL, invoices, and bank feeds",
  },
  quickbooks: {
    displayName: "QuickBooks",
    authMethod: "apikey",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret", secret: true },
      { key: "realmId", label: "Company ID (Realm ID)" },
    ],
    description: "Chart of accounts and transactions",
  },

  // ── Operations ───────────────────────────────────────────────────────────
  "s3-storage": {
    displayName: "AWS S3",
    authMethod: "apikey",
    fields: [
      { key: "accessKeyId", label: "Access Key ID", placeholder: "AKIA..." },
      { key: "secretAccessKey", label: "Secret Access Key", secret: true },
      { key: "region", label: "Region", placeholder: "us-east-1" },
      { key: "bucket", label: "Bucket Name" },
    ],
    description: "File storage and document ingestion",
  },
  google_calendar: {
    displayName: "Google Calendar",
    authMethod: "apikey",
    fields: [
      { key: "serviceAccountJson", label: "Service Account JSON", secret: true },
    ],
    description: "Meeting patterns and time allocation",
  },

  // ── Marketing ────────────────────────────────────────────────────────────
  mailchimp: {
    displayName: "Mailchimp",
    authMethod: "apikey",
    fields: [{ key: "apiKey", label: "API Key", secret: true, placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us1" }],
    description: "Campaign performance metrics",
  },

  // ── Document Sources ─────────────────────────────────────────────────────
  google_drive: {
    displayName: "Google Drive",
    authMethod: "oauth",
    oauthRoute: "/api/connectors/google-drive/auth",
    description: "PDF, DOCX, and text files from Google Drive folders",
  },

  // ── Local ────────────────────────────────────────────────────────────────
  "local-files": {
    displayName: "Local Files",
    authMethod: "browser_fsa",
    description: "PDFs, Word docs, text files, and markdown from your laptop",
  },

  // ── Generic ──────────────────────────────────────────────────────────────
  generic_api: {
    displayName: "Custom API",
    authMethod: "apikey",
    fields: [
      { key: "endpoint", label: "Webhook Endpoint URL", placeholder: "https://api.example.com/events" },
      { key: "apiKey", label: "API Key or Token", secret: true },
    ],
    description: "Custom webhook or API endpoint",
  },
};

/** Returns the display name for a connector type, falling back to title-cased type. */
export function getConnectorDisplayName(connectorType: string): string {
  return CONNECTOR_AUTH_MAP[connectorType]?.displayName ??
    connectorType.charAt(0).toUpperCase() + connectorType.slice(1).replace(/_/g, " ");
}
