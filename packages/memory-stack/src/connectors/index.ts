/**
 * Nexus Connectors
 *
 * External system integrations that feed signals
 * into the Nexus Brain event bus pipeline.
 */

export {
  type NexusConnector,
  type ConnectorSyncResult,
  type ConnectorSignal,
  storeConnectorSignals,
  recordSyncResult,
  ingestRawSignals,
  applyCausalSignalWeights,
  computeCausalWeightsFromEdges,
} from './connector-framework';

export { createHubSpotConnector } from './hubspot';
export { createStripeConnector } from './stripe';
export { createSupportConnector } from './support';
export { createBrainOSConnector, brainOSConnector } from './brain-os';

// Engineering & DevOps Connectors
export { createGitHubConnector, type GitHubConnectorConfig } from './github';
export { createDocumentConnector, type DocumentConnectorConfig } from './document';
export { createJiraConnector, type JiraConnectorConfig } from './jira';
export { createPagerDutyConnector, type PagerDutyConnectorConfig } from './pagerduty';
export * from './cicd-ingestor';

// Project Management Connectors (CRITICAL - Design Partner Requirements)
export {
  ingestLinearData,
  getLinearMetadata,
  validateLinearConfig,
  type LinearConfig,
  type LinearIssue,
  type LinearProject,
  type LinearCycle,
} from './linear';

export {
  ingestAsanaData,
  getAsanaMetadata,
  validateAsanaConfig,
  type AsanaConfig,
  type AsanaTask,
  type AsanaProject,
} from './asana';

// Customer Support Connectors
export {
  ingestFreshdeskData,
  getFreshdeskMetadata,
  validateFreshdeskConfig,
  type FreshdeskConfig,
} from './freshdesk';

// Communication Connectors
/** @deprecated Use `createNexusSlackConnector` from `@nexus-ai/slack-connector` instead */
export { createSlackConnector, type SlackConnectorConfig, type SlackConnector } from './slack';
export { createGoogleChatConnector, type GoogleChatConnectorConfig, type GoogleChatConnector } from './google-chat';
export { createGoogleCalendarConnector, type GoogleCalendarConnectorConfig, type GoogleCalendarConnector, type CalendarEvent } from './google-calendar';
export { createVoiceConnector, type VoiceConnectorConfig, type VoiceConnector, type CallRecord } from './voice';
export { createGenericAppConnector, type GenericAppConnectorConfig, type GenericAppConnector, type PullEndpoint, type PushEndpoint } from './generic-app';

// Finance Connectors (Design Partner 2: Xero + Volopay)
export { createXeroConnector, type XeroConnectorConfig } from './xero';
export { createVolopayConnector, type VolopayConnectorConfig } from './volopay';

// HR Connectors (Design Partner 3: BambooHR, Workday, custom)
export { createHRConnector, type HRConnectorConfig, type HRProvider } from './hr-system';

// Sync Manager
export * from './sync-manager';
