/**
 * Multi-Tenant Credential Manager
 * ================================
 * Retrieves OAuth credentials from org_connectors table for each organization.
 * Replaces hardcoded .env tokens with per-org encrypted credentials.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ConnectorCredentials {
  // Slack
  access_token?: string;
  bot_user_id?: string;
  scope?: string;

  // Jira
  refresh_token?: string;
  expires_at?: string;

  // GitHub
  token_type?: string;
}

export interface ConnectorMetadata {
  // Slack
  team_id?: string;
  team_name?: string;
  workspace_url?: string;

  // Jira
  cloud_id?: string;
  site_url?: string;
  site_name?: string;

  // GitHub
  github_user_id?: number;
  github_login?: string;
}

export class CredentialManager {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get credentials for a specific connector type for an organization
   */
  async getCredentials(
    organizationId: string,
    connectorType: 'slack' | 'jira' | 'github'
  ): Promise<{ credentials: ConnectorCredentials; metadata: ConnectorMetadata } | null> {
    try {
      // Try to use the RPC function if it exists
      const { data: credentials, error: rpcError } = await this.supabase.rpc(
        'get_connector_credentials',
        {
          p_organization_id: organizationId,
          p_connector_type: connectorType,
        }
      );

      if (!rpcError && credentials) {
        // Also get metadata
        const { data: connector } = await this.supabase
          .from('org_connectors')
          .select('metadata')
          .eq('organization_id', organizationId)
          .eq('connector_type', connectorType)
          .eq('status', 'active')
          .single();

        return {
          credentials: credentials as ConnectorCredentials,
          metadata: (connector?.metadata || {}) as ConnectorMetadata,
        };
      }

      // Fallback: direct query if RPC function doesn't exist
      const { data: connector, error } = await this.supabase
        .from('org_connectors')
        .select('credentials, metadata')
        .eq('organization_id', organizationId)
        .eq('connector_type', connectorType)
        .eq('status', 'active')
        .single();

      if (error || !connector) {
        return null;
      }

      return {
        credentials: connector.credentials as ConnectorCredentials,
        metadata: connector.metadata as ConnectorMetadata,
      };
    } catch (err) {
      console.error(`Failed to get ${connectorType} credentials:`, err);
      return null;
    }
  }

  /**
   * Get Slack credentials for an organization
   */
  async getSlackCredentials(organizationId: string) {
    const result = await this.getCredentials(organizationId, 'slack');
    if (!result) return null;

    return {
      accessToken: result.credentials.access_token!,
      botUserId: result.credentials.bot_user_id,
      teamId: result.metadata.team_id,
      teamName: result.metadata.team_name,
      workspaceUrl: result.metadata.workspace_url,
    };
  }

  /**
   * Get Jira credentials for an organization
   */
  async getJiraCredentials(organizationId: string) {
    const result = await this.getCredentials(organizationId, 'jira');
    if (!result) return null;

    // Check if token is expired
    const expiresAt = result.credentials.expires_at;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      // Token expired - need to refresh
      const refreshed = await this.refreshJiraToken(organizationId, result.credentials.refresh_token!);
      if (refreshed) {
        return refreshed;
      }
    }

    return {
      accessToken: result.credentials.access_token!,
      cloudId: result.metadata.cloud_id!,
      siteUrl: result.metadata.site_url!,
    };
  }

  /**
   * Get GitHub credentials for an organization
   */
  async getGitHubCredentials(organizationId: string) {
    const result = await this.getCredentials(organizationId, 'github');
    if (!result) return null;

    return {
      accessToken: result.credentials.access_token!,
      githubLogin: result.metadata.github_login,
    };
  }

  /**
   * Refresh Jira access token using refresh token
   */
  private async refreshJiraToken(organizationId: string, refreshToken: string) {
    try {
      const response = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: process.env.JIRA_CLIENT_ID,
          client_secret: process.env.JIRA_CLIENT_SECRET,
          refresh_token: refreshToken,
        }),
      });

      const tokenData = await response.json();

      if (!response.ok) {
        console.error('Failed to refresh Jira token:', tokenData);
        return null;
      }

      // Update credentials in database
      const newCredentials = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        scope: tokenData.scope,
      };

      await this.supabase
        .from('org_connectors')
        .update({ credentials: newCredentials })
        .eq('organization_id', organizationId)
        .eq('connector_type', 'jira');

      // Get metadata
      const { data: connector } = await this.supabase
        .from('org_connectors')
        .select('metadata')
        .eq('organization_id', organizationId)
        .eq('connector_type', 'jira')
        .single();

      return {
        accessToken: tokenData.access_token,
        cloudId: connector?.metadata?.cloud_id!,
        siteUrl: connector?.metadata?.site_url!,
      };
    } catch (err) {
      console.error('Error refreshing Jira token:', err);
      return null;
    }
  }

  /**
   * Check if a connector is configured for an organization
   */
  async isConnectorActive(organizationId: string, connectorType: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('org_connectors')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('connector_type', connectorType)
      .eq('status', 'active')
      .single();

    return !error && !!data;
  }

  /**
   * Get all active connectors for an organization
   */
  async getActiveConnectors(organizationId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('org_connectors')
      .select('connector_type')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    if (error || !data) return [];

    return data.map((c) => c.connector_type);
  }
}

/**
 * Create a credential manager instance
 */
export function createCredentialManager(supabase: SupabaseClient): CredentialManager {
  return new CredentialManager(supabase);
}
