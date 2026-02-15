'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

/** Client-side org ID reader — reads from cookie or falls back to first org */
async function getClientOrgId(): Promise<string> {
  // Try reading the cookie directly (client-side)
  const cookieValue = document.cookie
    .split('; ')
    .find(row => row.startsWith('nexus_current_org='))
    ?.split('=')[1];
  if (cookieValue) return cookieValue;

  // Fallback: query user's first org
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return CORE_ORG_ID;

  const { data } = await supabase
    .from('org_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  return data?.organization_id ?? CORE_ORG_ID;
}

interface Connector {
  id: string;
  connector_type: string;
  status: string;
  last_sync_at: string | null;
  signals_count: number;
  metadata: any;
  config: any;
  created_at: string;
}

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check for OAuth callback messages
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success) {
      const messages: Record<string, string> = {
        slack_connected: '🎉 Slack connected successfully!',
        jira_connected: '🎉 Jira connected successfully!',
        github_connected: '🎉 GitHub connected successfully!',
      };
      setMessage({ type: 'success', text: messages[success] || 'Connector added!' });
      // Clear URL params
      window.history.replaceState({}, '', '/admin/connectors');
    }

    if (error) {
      setMessage({ type: 'error', text: `Error: ${error}` });
      window.history.replaceState({}, '', '/admin/connectors');
    }

    loadConnectors();
  }, []);

  async function loadConnectors() {
    try {
      const supabase = createClient();
      const orgId = await getClientOrgId();

      const { data, error } = await supabase
        .from('org_connectors')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConnectors(data || []);
    } catch (err: any) {
      console.error('Failed to load connectors:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  function handleConnect(type: 'slack' | 'jira' | 'github') {
    window.location.href = `/api/connectors/${type}/auth`;
  }

  async function handleDisconnect(connectorId: string, type: string) {
    if (!confirm(`Are you sure you want to disconnect ${type}?`)) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('org_connectors')
        .update({ status: 'disabled', credentials: null })
        .eq('id', connectorId);

      if (error) throw error;

      setMessage({ type: 'success', text: `${type} disconnected` });
      loadConnectors();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const connectorsByType: Record<string, Connector | undefined> = {
    slack: connectors.find((c) => c.connector_type === 'slack'),
    jira: connectors.find((c) => c.connector_type === 'jira'),
    github: connectors.find((c) => c.connector_type === 'github'),
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Connectors</h1>
          <p className="text-gray-600">
            Connect your tools to enable NexusBrain to learn from your organization's data.
          </p>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
            <button
              onClick={() => setMessage(null)}
              className="float-right text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading connectors...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Slack */}
            <ConnectorCard
              name="Slack"
              description="Import conversations, channels, and messages"
              icon="💬"
              connector={connectorsByType.slack}
              onConnect={() => handleConnect('slack')}
              onDisconnect={() =>
                connectorsByType.slack &&
                handleDisconnect(connectorsByType.slack.id, 'Slack')
              }
            />

            {/* Jira */}
            <ConnectorCard
              name="Jira"
              description="Import issues, comments, and project data"
              icon="📋"
              connector={connectorsByType.jira}
              onConnect={() => handleConnect('jira')}
              onDisconnect={() =>
                connectorsByType.jira &&
                handleDisconnect(connectorsByType.jira.id, 'Jira')
              }
            />

            {/* GitHub */}
            <ConnectorCard
              name="GitHub"
              description="Import repositories, issues, and pull requests"
              icon="🐙"
              connector={connectorsByType.github}
              onConnect={() => handleConnect('github')}
              onDisconnect={() =>
                connectorsByType.github &&
                handleDisconnect(connectorsByType.github.id, 'GitHub')
              }
            />
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">🔐 Secure & Private</h3>
          <p className="text-sm text-blue-800">
            All credentials are encrypted and stored securely. NexusBrain only accesses data
            you explicitly grant permission to. You can disconnect any connector at any time.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ConnectorCardProps {
  name: string;
  description: string;
  icon: string;
  connector?: Connector;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ConnectorCard({
  name,
  description,
  icon,
  connector,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  const isConnected = connector?.status === 'active';
  const lastSync = connector?.last_sync_at
    ? new Date(connector.last_sync_at).toLocaleString()
    : 'Never';

  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="text-4xl">{icon}</div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
            <p className="text-sm text-gray-600 mt-1">{description}</p>

            {isConnected && (
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-green-700 font-medium">Connected</span>
                </div>
                <p className="text-gray-500">Last sync: {lastSync}</p>
                {connector.signals_count > 0 && (
                  <p className="text-gray-500">
                    {connector.signals_count.toLocaleString()} signals ingested
                  </p>
                )}
                {connector.metadata?.team_name && (
                  <p className="text-gray-500">Workspace: {connector.metadata.team_name}</p>
                )}
                {connector.metadata?.site_name && (
                  <p className="text-gray-500">Site: {connector.metadata.site_name}</p>
                )}
                {connector.metadata?.github_login && (
                  <p className="text-gray-500">User: @{connector.metadata.github_login}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          {isConnected ? (
            <button
              onClick={onDisconnect}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
