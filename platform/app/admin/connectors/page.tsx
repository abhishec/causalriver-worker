'use client';

/**
 * Admin Data Connectors
 * =====================
 * Manage org-specific OAuth connectors — dark theme, design system aligned.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { logger } from "@/lib/logger";

const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
const STORAGE_KEY = 'nexus_current_workspace';
const OLD_STORAGE_KEY = 'nexus_current_org';

function getClientOrgId(): string {
  if (typeof document === 'undefined') return CORE_ORG_ID;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${STORAGE_KEY}=([^;]*)`));
  if (match?.[1]) return match[1];
  const old = document.cookie.match(new RegExp(`(?:^|;\\s*)${OLD_STORAGE_KEY}=([^;]*)`));
  return old?.[1] || CORE_ORG_ID;
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

const CONNECTORS_CONFIG: Record<string, { name: string; icon: string; description: string; features: string[]; scaleInfo: string; domain: string }> = {
  slack: {
    name: 'Slack',
    icon: '💬',
    description: 'Team conversations, channels, and messages',
    features: ['Message history', 'Channel metadata', 'Thread conversations', 'Reactions & files'],
    scaleInfo: '10M+ messages supported',
    domain: 'communication',
  },
  jira: {
    name: 'Jira',
    icon: '📋',
    description: 'Issues, comments, and project workflows',
    features: ['Issue tracking', 'Comment threads', 'Project metadata', 'Custom fields'],
    scaleInfo: '500K+ issues supported',
    domain: 'engineering',
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    description: 'Repositories, code, PRs, and issues',
    features: ['Code files', 'Pull requests', 'Issues & discussions', 'Commit history'],
    scaleInfo: '10M+ files supported',
    domain: 'engineering',
  },
  freshdesk: {
    name: 'Freshdesk',
    icon: '🎫',
    description: 'Support tickets and customer conversations',
    features: ['Ticket history', 'Customer conversations', 'Agent responses', 'Satisfaction ratings'],
    scaleInfo: '100K+ tickets supported',
    domain: 'support',
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
    const interval = setInterval(loadSyncProgress, 5000);
    return () => clearInterval(interval);
  }, []);

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success) {
      const messages: Record<string, string> = {
        slack_connected: 'Slack workspace connected successfully',
        jira_connected: 'Jira site connected successfully',
        github_connected: 'GitHub account connected successfully',
        freshdesk_connected: 'Freshdesk account connected successfully',
      };
      setMessage({ type: 'success', text: messages[success] || 'Connector added' });
      window.history.replaceState({}, '', '/admin/connectors');
    }

    if (error) {
      setMessage({ type: 'error', text: decodeURIComponent(error) });
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
      logger.error('Failed to load connectors:', err);
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
      logger.warn('Failed to load sync progress:', err);
    }
  }

  function handleConnect(type: string) {
    window.location.href = `/api/connectors/${type}/auth`;
  }

  async function handleDisconnect(connectorId: string, type: string) {
    if (!confirm(`Disconnect ${type}?\n\nThis will remove OAuth credentials and stop syncing. Existing data will be kept.`)) {
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
    try {
      const response = await fetch(`/api/connectors/${type}/sync`, { method: 'POST' });
      if (response.ok) {
        setMessage({ type: 'success', text: `${type} sync started` });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Connectors Config</h1>
          <p className="text-xs text-muted mt-0.5">
            Manage OAuth connectors for <span className="text-foreground font-medium">{orgName || 'workspace'}</span>
          </p>
        </div>
        <a
          href="/admin/settings/oauth"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.11v1.093c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          OAuth Settings
        </a>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-xl border text-sm",
            message.type === 'success' && "bg-success/10 border-success/20 text-success",
            message.type === 'error' && "bg-danger/10 border-danger/20 text-danger",
            message.type === 'info' && "bg-info/10 border-info/20 text-info",
          )}
        >
          <span className="font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-60 hover:opacity-100 ml-4">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl bg-card border border-border-subtle p-6 animate-shimmer" style={{ height: 120 }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(CONNECTORS_CONFIG).map(([type, config]) => {
            const connector = connectorsByType[type];
            const isConnected = connector?.status === 'active';
            const isSyncing = syncProgress[type]?.status === 'in_progress';
            const progress = syncProgress[type];

            return (
              <Card
                key={type}
                variant={isConnected ? "interactive" : "default"}
                className={cn(!isConnected && "opacity-70")}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="text-3xl shrink-0">{config.icon}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{config.name}</span>
                      {isConnected && (
                        <Badge variant="success" size="xs" pulse>Connected</Badge>
                      )}
                      {isSyncing && (
                        <Badge variant="info" size="xs" pulse>Syncing</Badge>
                      )}
                      {!isConnected && (
                        <Badge variant="default" size="xs">Not connected</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted mb-2">{config.description}</p>

                    {isConnected && connector && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted">Last sync: <span className="text-foreground font-medium">{connector.last_sync_at ? formatRelativeTime(new Date(connector.last_sync_at)) : 'Never'}</span></span>
                          <span className="text-muted">Signals: <span className="text-foreground font-mono tabular-nums">{(connector.signals_count || 0).toLocaleString()}</span></span>
                          {connector.metadata?.team_name && <span className="text-muted">{connector.metadata.team_name}</span>}
                          {connector.metadata?.github_login && <span className="text-muted">@{connector.metadata.github_login}</span>}
                        </div>

                        {/* Sync Progress */}
                        {isSyncing && progress && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted">Syncing...</span>
                              <span className="text-accent font-mono tabular-nums">{progress.progress_pct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full transition-all duration-500"
                                style={{ width: `${progress.progress_pct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted mt-1">
                              {progress.signals_ingested.toLocaleString()} signals processed
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {!isConnected && (
                      <div className="flex items-center gap-3 text-[11px] text-muted mt-1">
                        {config.features.slice(0, 3).map((f, i) => (
                          <span key={i}>• {f}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {isConnected ? (
                      <>
                        <button
                          onClick={() => handleSync(type)}
                          disabled={isSyncing}
                          className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button
                          onClick={() => handleDisconnect(connector!.id, config.name)}
                          className="px-3 py-1.5 rounded-lg bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleConnect(type)}
                        className="px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <Card>
          <CardTitle className="mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Secure & Private
          </CardTitle>
          <p className="text-xs text-muted leading-relaxed">
            All credentials are encrypted. Brain OS only accesses data you explicitly grant permission to.
          </p>
        </Card>

        <Card>
          <CardTitle className="mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Automatic Syncing
          </CardTitle>
          <p className="text-xs text-muted leading-relaxed">
            Connectors sync hourly. Initial sync may take time for large datasets; incremental syncs are fast.
          </p>
        </Card>
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
