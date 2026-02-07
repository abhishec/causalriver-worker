/**
 * Nexus Connectors
 *
 * External system integrations that feed signals
 * into the Nexus Brain event bus pipeline.
 */

export {
  type NexusConnector,
  type ConnectorSyncResult,
  storeConnectorSignals,
  recordSyncResult,
} from './connector-framework';

export { createHubSpotConnector } from './hubspot';
export { createStripeConnector } from './stripe';
export { createSupportConnector } from './support';
