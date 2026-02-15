/**
 * Connector Factory
 * =================
 * Creates connector instances based on type and credentials.
 * Central place to instantiate all connectors (GitHub, Slack, Jira, Freshdesk).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ConnectorBase } from './base/connector-base.js';
import { createCredentialManager, CredentialManager } from './credential-manager.js';
import { GitHubConnector } from './github/github-connector.js';
import { SlackConnector } from './slack/slack-connector.js';
import { JiraConnector } from './jira/jira-connector.js';
import { FreshdeskConnector } from './freshworks/freshdesk-connector.js';

export type ConnectorType = 'github' | 'slack' | 'jira' | 'freshdesk';

export interface ConnectorConfig {
  organizationId: string;
  connectorType: ConnectorType;
  supabase: SupabaseClient;
  redis?: any;
}

export class ConnectorFactory {
  private credentialManager: CredentialManager;

  constructor(private supabase: SupabaseClient, private redis?: any) {
    this.credentialManager = createCredentialManager(supabase);
  }

  /**
   * Create connector instance for an organization
   */
  async createConnector(
    organizationId: string,
    connectorType: ConnectorType
  ): Promise<ConnectorBase | null> {
    try {
      // Get credentials for this connector
      const credentials = await this.getCredentialsForType(organizationId, connectorType);

      if (!credentials) {
        console.warn(`[ConnectorFactory] No credentials found for ${connectorType} in org ${organizationId}`);
        return null;
      }

      // Create appropriate connector instance
      switch (connectorType) {
        case 'github':
          return new GitHubConnector(organizationId, credentials, this.supabase, this.redis);

        case 'slack':
          return new SlackConnector(organizationId, credentials, this.supabase, this.redis);

        case 'jira':
          return new JiraConnector(organizationId, credentials, this.supabase, this.redis);

        case 'freshdesk':
          return new FreshdeskConnector(organizationId, credentials, this.supabase, this.redis);

        default:
          console.error(`[ConnectorFactory] Unknown connector type: ${connectorType}`);
          return null;
      }
    } catch (error: any) {
      console.error(`[ConnectorFactory] Failed to create ${connectorType} connector:`, error);
      return null;
    }
  }

  /**
   * Create all active connectors for an organization
   */
  async createAllConnectors(organizationId: string): Promise<ConnectorBase[]> {
    const activeTypes = await this.credentialManager.getActiveConnectors(organizationId);

    const connectors: ConnectorBase[] = [];

    for (const type of activeTypes as ConnectorType[]) {
      const connector = await this.createConnector(organizationId, type);
      if (connector) {
        connectors.push(connector);
      }
    }

    return connectors;
  }

  /**
   * Get credentials for specific connector type
   */
  private async getCredentialsForType(
    organizationId: string,
    connectorType: ConnectorType
  ): Promise<any | null> {
    switch (connectorType) {
      case 'github':
        return this.credentialManager.getGitHubCredentials(organizationId);

      case 'slack':
        return this.credentialManager.getSlackCredentials(organizationId);

      case 'jira':
        return this.credentialManager.getJiraCredentials(organizationId);

      case 'freshdesk':
        // Freshdesk uses API key, stored in credentials.api_key
        const result = await this.credentialManager.getCredentials(organizationId, 'freshdesk');
        if (!result) return null;
        return {
          apiKey: result.credentials.api_key,
          domain: result.metadata.domain,
        };

      default:
        return null;
    }
  }

  /**
   * Check if connector is available for organization
   */
  async isConnectorAvailable(organizationId: string, connectorType: ConnectorType): Promise<boolean> {
    return this.credentialManager.isConnectorActive(organizationId, connectorType);
  }
}

/**
 * Create a connector factory instance
 */
export function createConnectorFactory(supabase: SupabaseClient, redis?: any): ConnectorFactory {
  return new ConnectorFactory(supabase, redis);
}
