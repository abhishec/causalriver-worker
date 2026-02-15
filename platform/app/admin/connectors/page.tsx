'use client';

/**
 * Data Connectors - Enterprise UI
 * ================================
 * Claude-quality interface for managing org-specific OAuth connectors.
 * Features: Real-time sync status, progress tracking, beautiful animations.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
const STORAGE_KEY = 'nexus_current_org';

/** Client-safe org ID reader (reads cookie directly, no next/headers) */
function getClientOrgId(): string {
  if (typeof document === 'undefined') return CORE_ORG_ID;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${STORAGE_KEY}=([^;]*)`));
  return match?.[1] || CORE_ORG_ID;
}

interface Connector {
  id: string;
  connector_type: string;
  status: string;
  last_sync_at: string | null;
  signals_count: number;
  metadata: any;
  config: any;
  credentials: any;
  created_at: string;
}

interface SyncProgress {
  connector_type: string;
  progress_pct: number;
  signals_ingested: number;
  status: string;
  state: any;
}

const CONNECTORS_CONFIG = {
  slack: {
    name: 'Slack',
    icon: '💬',
    color: 'purple',
    description: 'Team conversations, channels, and messages',
    features: ['Message history', 'Channel metadata', 'Thread conversations', 'Reactions & files'],
    scaleInfo: '10M+ messages supported',
  },
  jira: {
    name: 'Jira',
    icon: '📋',
    color: 'blue',
    description: 'Issues, comments, and project workflows',
    features: ['Issue tracking', 'Comment threads', 'Project metadata', 'Custom fields'],
    scaleInfo: '500K+ issues supported',
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    color: 'gray',
    description: 'Repositories, code, PRs, and issues',
    features: ['Code files', 'Pull requests', 'Issues & discussions', 'Commit history'],
    scaleInfo: '10M+ files supported',
  },
  freshdesk: {
    name: 'Freshdesk',
    icon: '🎫',
    color: 'green',
    description: 'Support tickets and customer conversations',
    features: ['Ticket history', 'Customer conversations', 'Agent responses', 'Satisfaction ratings'],
    scaleInfo: '100K+ tickets supported',
  },
};

export default function ConnectorsPageV2() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [syncProgress, setSyncProgress] = useState<Record<string, SyncProgress>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [orgId, setOrgId] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    init();
    const interval = setInterval(loadSyncProgress, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  async function init() {
    // Handle OAuth callbacks
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success) {
      const messages: Record<string, string> = {
        slack_connected: '✅ Slack workspace connected successfully!',
        jira_connected: '✅ Jira site connected successfully!',
        github_connected: '✅ GitHub account connected successfully!',
        freshdesk_connected: '✅ Freshdesk account connected successfully!',
      };
      setMessage({ type: 'success', text: messages[success] || '✅ Connector added!' });
      window.history.replaceState({}, '', '/admin/connectors');
    }

    if (error) {
      setMessage({ type: 'error', text: `❌ ${decodeURIComponent(error)}` });
      window.history.replaceState({}, '', '/admin/connectors');
    }

    await loadConnectors();
    await loadSyncProgress();
  }

  async function loadConnectors() {
    try {
      const supabase = createClient();
      const currentOrgId = getClientOrgId();
      setOrgId(currentOrgId);

      // Get org name
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', currentOrgId)
        .single();

      if (org) setOrgName(org.name);

      const { data, error } = await supabase
        .from('org_connectors')
        .select('*')
        .eq('organization_id', currentOrgId)
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

  async function loadSyncProgress() {
    try {
      const supabase = createClient();
      const currentOrgId = getClientOrgId();

      const { data } = await supabase
        .from('connector_checkpoints')
        .select('*')
        .eq('organization_id', currentOrgId)
        .eq('status', 'in_progress');

      if (data) {
        const progressMap: Record<string, SyncProgress> = {};
        data.forEach((p) => {
          progressMap[p.connector_type] = p;
        });
        setSyncProgress(progressMap);
      }
    } catch (err) {
      console.warn('Failed to load sync progress:', err);
    }
  }

  function handleConnect(type: string) {
    window.location.href = `/api/connectors/${type}/auth`;
  }

  async function handleDisconnect(connectorId: string, type: string) {
    if (!confirm(`Are you sure you want to disconnect ${type}?\n\nThis will:\n• Remove OAuth credentials\n• Stop data syncing\n• Keep existing data`)) {
      return;
    }

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

  async function handleSync(type: string) {
    setMessage({ type: 'info', text: `Starting ${type} sync...` });
    // Trigger sync via API
    try {
      const response = await fetch(`/api/connectors/${type}/sync`, {
        method: 'POST',
      });
      if (response.ok) {
        setMessage({ type: 'success', text: `${type} sync started!` });
        setTimeout(loadSyncProgress, 1000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Sync failed: ${err.message}` });
    }
  }

  const connectorsByType: Record<string, Connector | undefined> = {};
  connectors.forEach((c) => {
    connectorsByType[c.connector_type] = c;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-3">
                Data Connectors
              </h1>
              <p className="text-lg text-gray-600">
                Connect your tools to enable NexusBrain to learn from{' '}
                <span className="font-semibold text-gray-900">{orgName || 'your organization'}</span>'s data.
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Organization</div>
              <div className="text-lg font-semibold text-gray-900">{orgName}</div>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`mb-8 p-5 rounded-xl shadow-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-900 border-2 border-green-200'
                : message.type === 'error'
                ? 'bg-red-50 text-red-900 border-2 border-red-200'
                : 'bg-blue-50 text-blue-900 border-2 border-blue-200'
            } animate-in slide-in-from-top`}
          >
            <div className="flex items-start justify-between">
              <p className="font-medium">{message.text}</p>
              <button
                onClick={() => setMessage(null)}
                className="text-sm underline ml-4"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading connectors...</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {Object.entries(CONNECTORS_CONFIG).map(([type, config]) => (
              <EnhancedConnectorCard
                key={type}
                type={type}
                config={config}
                connector={connectorsByType[type]}
                syncProgress={syncProgress[type]}
                onConnect={() => handleConnect(type)}
                onDisconnect={() =>
                  connectorsByType[type] && handleDisconnect(connectorsByType[type]!.id, config.name)
                }
                onSync={() => handleSync(type)}
              />
            ))}
          </div>
        )}

        {/* Info Cards */}
        <div className="mt-12 grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
            <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
              <span className="text-2xl">🔐</span>
              Secure & Private
            </h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              All credentials are encrypted and stored securely. NexusBrain only accesses data
              you explicitly grant permission to. You can disconnect any connector at any time.
            </p>
          </div>

          <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl shadow-sm">
            <h3 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              Automatic Syncing
            </h3>
            <p className="text-sm text-purple-800 leading-relaxed">
              Connectors sync automatically every hour. Initial sync may take time for large datasets.
              Incremental syncs are fast (usually under 5 minutes).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EnhancedConnectorCardProps {
  type: string;
  config: any;
  connector?: Connector;
  syncProgress?: SyncProgress;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}

function EnhancedConnectorCard({
  type,
  config,
  connector,
  syncProgress,
  onConnect,
  onDisconnect,
  onSync,
}: EnhancedConnectorCardProps) {
  const isConnected = connector?.status === 'active';
  const isSyncing = syncProgress?.status === 'in_progress';
  const lastSync = connector?.last_sync_at
    ? formatRelativeTime(new Date(connector.last_sync_at))
    : 'Never';

  const colorClasses = {
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
    green: 'bg-green-50 border-green-200 text-green-900',
  };

  return (
    <div className={`border-2 rounded-xl p-6 transition-all duration-200 ${
      isConnected
        ? 'bg-white shadow-lg hover:shadow-xl'
        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start justify-between">
        {/* Left side */}
        <div className="flex items-start space-x-5 flex-1">
          <div className={`text-5xl p-3 rounded-xl ${colorClasses[config.color as keyof typeof colorClasses]}`}>
            {config.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">{config.name}</h3>
              {isConnected && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  Connected
                </span>
              )}
              {isSyncing && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                  Syncing
                </span>
              )}
            </div>

            <p className="text-gray-600 mb-4">{config.description}</p>

            {isConnected && (
              <div className="space-y-3">
                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-gray-500">Last sync:</span>
                    <span className="ml-2 font-medium text-gray-900">{lastSync}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Signals:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {connector.signals_count?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  {connector.metadata?.team_name && (
                    <span>📍 {connector.metadata.team_name}</span>
                  )}
                  {connector.metadata?.site_name && (
                    <span>🌐 {connector.metadata.site_name}</span>
                  )}
                  {connector.metadata?.github_login && (
                    <span>👤 @{connector.metadata.github_login}</span>
                  )}
                </div>

                {/* Sync Progress */}
                {isSyncing && syncProgress && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <span className="text-gray-600">Syncing...</span>
                      <span className="font-semibold text-blue-600">
                        {syncProgress.progress_pct}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 rounded-full"
                        style={{ width: `${syncProgress.progress_pct}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {syncProgress.signals_ingested.toLocaleString()} signals processed
                    </p>
                  </div>
                )}

                {/* Features (expandable) */}
                <details className="mt-4">
                  <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                    What gets synced →
                  </summary>
                  <ul className="mt-2 ml-4 space-y-1 text-sm text-gray-600">
                    {config.features.map((feature: string, idx: number) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 mt-2">
                    {config.scaleInfo}
                  </p>
                </details>
              </div>
            )}

            {!isConnected && (
              <div className="mt-4">
                <ul className="space-y-1.5 text-sm text-gray-600">
                  {config.features.slice(0, 3).map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="text-gray-400">•</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex flex-col gap-2">
          {isConnected ? (
            <>
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={onDisconnect}
                className="px-5 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={onConnect}
              className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
            >
              Connect {config.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
