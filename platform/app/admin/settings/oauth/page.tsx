'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusDot } from '@/components/ui/StatusDot';
import { cn } from '@/lib/utils';
import { logger } from "@/lib/logger";

const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
const STORAGE_KEY = 'nexus_current_org';

/** Client-safe org ID reader (reads cookie directly, no next/headers) */
function getClientOrgId(): string {
  if (typeof document === 'undefined') return CORE_ORG_ID;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${STORAGE_KEY}=([^;]*)`));
  return match?.[1] || CORE_ORG_ID;
}

interface OAuthApp {
  connector_type: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  enabled: boolean;
  configured_at?: string;
}

interface ValidationResult {
  is_valid: boolean;
  has_client_id: boolean;
  has_client_secret: boolean;
  is_enabled: boolean;
  message: string;
}

const CONNECTOR_INFO = {
  slack: {
    name: 'Slack',
    icon: '💬',
    defaultScopes: ['channels:history', 'channels:read', 'users:read', 'team:read', 'groups:history', 'groups:read', 'im:history', 'mpim:history'],
    docsUrl: 'https://api.slack.com/apps',
    instructions: 'Create a Slack app, enable OAuth, add redirect URL, and copy credentials.',
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    defaultScopes: ['repo', 'read:org', 'read:user'],
    docsUrl: 'https://github.com/settings/developers',
    instructions: 'Register a new OAuth application and copy the client ID and secret.',
  },
  jira: {
    name: 'Jira',
    icon: '📋',
    defaultScopes: ['read:jira-work', 'read:jira-user', 'offline_access'],
    docsUrl: 'https://developer.atlassian.com/console/myapps/',
    instructions: 'Create an OAuth 2.0 app, configure permissions, and copy credentials.',
  },
};

export default function OAuthSettingsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [oauthApps, setOAuthApps] = useState<Record<string, OAuthApp>>({});
  const [validation, setValidation] = useState<Record<string, ValidationResult>>({});
  const [editingApp, setEditingApp] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<OAuthApp>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadOAuthSettings();
  }, []);

  async function loadOAuthSettings() {
    try {
      setLoading(true);
      const supabase = createClient();
      const currentOrgId = getClientOrgId();
      setOrgId(currentOrgId);

      if (!currentOrgId) return;

      const { data: org } = await supabase
        .from('organizations')
        .select('custom_oauth_apps')
        .eq('id', currentOrgId)
        .single();

      if (org?.custom_oauth_apps) {
        setOAuthApps(org.custom_oauth_apps);
      }

      for (const connectorType of Object.keys(CONNECTOR_INFO)) {
        await validateCredentials(connectorType, currentOrgId);
      }
    } catch (error) {
      logger.error('Failed to load OAuth settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function validateCredentials(connectorType: string, orgIdToValidate?: string) {
    const supabase = createClient();
    const targetOrgId = orgIdToValidate || orgId;

    if (!targetOrgId) return;

    const { data } = await supabase.rpc('validate_org_oauth_credentials', {
      p_organization_id: targetOrgId,
      p_connector_type: connectorType,
    });

    if (data && data.length > 0) {
      setValidation(prev => ({ ...prev, [connectorType]: data[0] }));
    }
  }

  async function saveOAuthApp(connectorType: string) {
    if (!orgId || !formData.client_id || !formData.client_secret) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(connectorType);
      const supabase = createClient();

      const { error } = await supabase.rpc('store_org_oauth_credentials', {
        p_organization_id: orgId,
        p_connector_type: connectorType,
        p_client_id: formData.client_id,
        p_client_secret: formData.client_secret,
        p_scopes: formData.scopes || CONNECTOR_INFO[connectorType as keyof typeof CONNECTOR_INFO].defaultScopes,
        p_enabled: formData.enabled ?? true,
      });

      if (error) throw error;

      await loadOAuthSettings();
      setEditingApp(null);
      setFormData({});
    } catch (error: any) {
      logger.error('Failed to save OAuth app:', error);
      alert('Failed to save: ' + error.message);
    } finally {
      setSaving(null);
    }
  }

  async function removeOAuthApp(connectorType: string) {
    if (!confirm(`Remove custom ${CONNECTOR_INFO[connectorType as keyof typeof CONNECTOR_INFO].name} OAuth app? The connector will use platform credentials instead.`)) {
      return;
    }

    try {
      setSaving(connectorType);
      const supabase = createClient();

      const { error } = await supabase.rpc('remove_org_oauth_credentials', {
        p_organization_id: orgId,
        p_connector_type: connectorType,
      });

      if (error) throw error;

      await loadOAuthSettings();
    } catch (error: any) {
      logger.error('Failed to remove OAuth app:', error);
      alert('Failed to remove: ' + error.message);
    } finally {
      setSaving(null);
    }
  }

  function startEditing(connectorType: string) {
    const existing = oauthApps[connectorType];
    setFormData(existing || {
      client_id: '',
      client_secret: '',
      scopes: CONNECTOR_INFO[connectorType as keyof typeof CONNECTOR_INFO].defaultScopes,
      enabled: true,
    });
    setEditingApp(connectorType);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">OAuth Settings</h1>
          <p className="text-xs text-muted mt-0.5">Loading connector credentials...</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-card border border-border-subtle p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-surface shimmer" />
                <div className="space-y-1.5">
                  <div className="w-24 h-4 rounded bg-surface shimmer" />
                  <div className="w-48 h-3 rounded bg-surface shimmer" />
                </div>
              </div>
              <div className="w-full h-10 rounded-lg bg-surface shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">OAuth Settings</h1>
        <p className="text-xs text-muted mt-0.5">
          Configure custom OAuth applications for your organization
        </p>
      </div>

      {/* Connector Cards */}
      <div className="space-y-4">
        {Object.entries(CONNECTOR_INFO).map(([connectorType, info]) => {
          const app = oauthApps[connectorType];
          const isValid = validation[connectorType];
          const isEditing = editingApp === connectorType;
          const isSaving = saving === connectorType;

          return (
            <Card key={connectorType}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-xl">
                    {info.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{info.name}</div>
                    <p className="text-[11px] text-muted mt-0.5">{info.instructions}</p>
                  </div>
                </div>

                {/* Status Badge */}
                {app && (
                  <div className="flex items-center gap-1.5">
                    <StatusDot type={isValid?.is_valid ? "active" : "warning"} size="sm" />
                    <Badge variant={isValid?.is_valid ? "success" : "warning"} size="xs">
                      {isValid?.is_valid ? 'Configured' : 'Invalid'}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Not Configured State */}
              {!app && !isEditing && (
                <div className="rounded-lg bg-surface/50 p-4 mb-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Using platform OAuth credentials. Configure a custom OAuth app to use your own.
                  </p>
                  <button
                    onClick={() => startEditing(connectorType)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors text-xs font-medium"
                  >
                    <span>+</span>
                    Configure Custom OAuth App
                  </button>
                </div>
              )}

              {/* Configured State */}
              {app && !isEditing && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1 block">Client ID</label>
                      <p className="font-mono text-xs text-foreground truncate">{app.client_id}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1 block">Client Secret</label>
                      <p className="font-mono text-xs text-foreground">
                        {showSecret[connectorType] ? app.client_secret : '••••••••••••••••'}
                        <button
                          onClick={() => setShowSecret(prev => ({ ...prev, [connectorType]: !prev[connectorType] }))}
                          className="ml-2 text-accent hover:text-accent/80 text-[10px]"
                        >
                          {showSecret[connectorType] ? 'Hide' : 'Show'}
                        </button>
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1.5 block">Scopes</label>
                    <div className="flex flex-wrap gap-1">
                      {app.scopes?.map((scope: string) => (
                        <span key={scope} className="px-2 py-0.5 bg-surface rounded text-[10px] text-muted-foreground font-mono">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  {isValid && !isValid.is_valid && (
                    <div className="rounded-lg bg-warning/5 border border-warning/15 p-3">
                      <p className="text-xs text-warning">{isValid.message}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => startEditing(connectorType)}
                      className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeOAuthApp(connectorType)}
                      disabled={isSaving}
                      className="px-3 py-1.5 rounded-lg border border-danger/20 text-xs font-medium text-danger hover:bg-danger/5 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                    <a
                      href={info.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto px-3 py-1.5 text-accent hover:text-accent/80 text-xs font-medium transition-colors"
                    >
                      View Docs →
                    </a>
                  </div>
                </div>
              )}

              {/* Edit Form */}
              {isEditing && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Client ID *
                    </label>
                    <input
                      type="text"
                      value={formData.client_id || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-input-focus"
                      placeholder="your-client-id"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Client Secret *
                    </label>
                    <input
                      type="password"
                      value={formData.client_secret || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, client_secret: e.target.value }))}
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-input-focus"
                      placeholder="your-client-secret"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Scopes (one per line)
                    </label>
                    <textarea
                      value={formData.scopes?.join('\n') || info.defaultScopes.join('\n')}
                      onChange={(e) => setFormData(prev => ({ ...prev, scopes: e.target.value.split('\n').filter(Boolean) }))}
                      className="w-full rounded-lg bg-input border border-input-border px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-input-focus"
                      rows={6}
                    />
                    <p className="mt-1 text-[10px] text-muted">Default scopes shown. Modify as needed.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`enabled-${connectorType}`}
                      checked={formData.enabled ?? true}
                      onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="rounded border-border-subtle bg-input text-accent focus:ring-accent/30"
                    />
                    <label htmlFor={`enabled-${connectorType}`} className="text-xs text-muted-foreground">
                      Enable this OAuth app
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => saveOAuthApp(connectorType)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-amber-500/15 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : 'Save OAuth App'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingApp(null);
                        setFormData({});
                      }}
                      disabled={isSaving}
                      className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:bg-surface-hover transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Info Box */}
      <Card className="border-accent/20">
        <CardTitle className="text-accent mb-3">How It Works</CardTitle>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-accent mt-0.5">●</span>
            <span><strong className="text-foreground">Org-Level OAuth:</strong> Configure your own OAuth apps for full control</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-accent mt-0.5">●</span>
            <span><strong className="text-foreground">Platform Fallback:</strong> Use platform credentials if not configured</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-accent mt-0.5">●</span>
            <span><strong className="text-foreground">Hybrid Mode:</strong> Mix custom and platform (e.g., custom Slack, platform GitHub)</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-accent mt-0.5">●</span>
            <span><strong className="text-foreground">Secure Storage:</strong> Credentials encrypted in database</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
