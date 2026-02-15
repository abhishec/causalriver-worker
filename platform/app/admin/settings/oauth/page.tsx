'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

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
    color: 'purple',
    defaultScopes: ['channels:history', 'channels:read', 'users:read', 'team:read', 'groups:history', 'groups:read', 'im:history', 'mpim:history'],
    docsUrl: 'https://api.slack.com/apps',
    instructions: 'Create a Slack app, enable OAuth, add redirect URL, and copy credentials.',
  },
  github: {
    name: 'GitHub',
    icon: '⚙️',
    color: 'gray',
    defaultScopes: ['repo', 'read:org', 'read:user'],
    docsUrl: 'https://github.com/settings/developers',
    instructions: 'Register a new OAuth application and copy the client ID and secret.',
  },
  jira: {
    name: 'Jira',
    icon: '📋',
    color: 'blue',
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

      // Load organization's custom OAuth apps
      const { data: org } = await supabase
        .from('organizations')
        .select('custom_oauth_apps')
        .eq('id', currentOrgId)
        .single();

      if (org?.custom_oauth_apps) {
        setOAuthApps(org.custom_oauth_apps);
      }

      // Validate each configured app
      for (const connectorType of Object.keys(CONNECTOR_INFO)) {
        await validateCredentials(connectorType, currentOrgId);
      }
    } catch (error) {
      console.error('Failed to load OAuth settings:', error);
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

      // Reload settings
      await loadOAuthSettings();
      setEditingApp(null);
      setFormData({});
    } catch (error: any) {
      console.error('Failed to save OAuth app:', error);
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
      console.error('Failed to remove OAuth app:', error);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading OAuth settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            OAuth Settings
          </h1>
          <p className="text-slate-600">
            Configure custom OAuth applications for your organization. Falls back to platform credentials if not configured.
          </p>
        </div>

        {/* Connector Cards */}
        <div className="space-y-6">
          {Object.entries(CONNECTOR_INFO).map(([connectorType, info]) => {
            const app = oauthApps[connectorType];
            const isValid = validation[connectorType];
            const isEditing = editingApp === connectorType;
            const isSaving = saving === connectorType;

            return (
              <div
                key={connectorType}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{info.icon}</span>
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">
                          {info.name}
                        </h3>
                        <p className="text-sm text-slate-500">{info.instructions}</p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {app && (
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                        isValid?.is_valid
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {isValid?.is_valid ? '✓ Configured' : '⚠ Invalid'}
                      </div>
                    )}
                  </div>

                  {/* Not Configured State */}
                  {!app && !isEditing && (
                    <div className="bg-slate-50 rounded-lg p-4 mb-4">
                      <p className="text-slate-600 text-sm mb-3">
                        Using platform OAuth credentials. Configure custom OAuth app to use your own.
                      </p>
                      <button
                        onClick={() => startEditing(connectorType)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
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
                          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Client ID</label>
                          <p className="mt-1 font-mono text-sm text-slate-900 truncate">{app.client_id}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Client Secret</label>
                          <p className="mt-1 font-mono text-sm text-slate-900">
                            {showSecret[connectorType] ? app.client_secret : '••••••••••••••••'}
                            <button
                              onClick={() => setShowSecret(prev => ({ ...prev, [connectorType]: !prev[connectorType] }))}
                              className="ml-2 text-indigo-600 hover:text-indigo-700 text-xs"
                            >
                              {showSecret[connectorType] ? 'Hide' : 'Show'}
                            </button>
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Scopes</label>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {app.scopes?.map((scope: string) => (
                            <span key={scope} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                              {scope}
                            </span>
                          ))}
                        </div>
                      </div>

                      {isValid && !isValid.is_valid && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-sm text-yellow-800">⚠ {isValid.message}</p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => startEditing(connectorType)}
                          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeOAuthApp(connectorType)}
                          disabled={isSaving}
                          className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          Remove
                        </button>
                        <a
                          href={info.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto px-4 py-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Client ID *
                        </label>
                        <input
                          type="text"
                          value={formData.client_id || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="your-client-id"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Client Secret *
                        </label>
                        <input
                          type="password"
                          value={formData.client_secret || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, client_secret: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="your-client-secret"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Scopes (one per line)
                        </label>
                        <textarea
                          value={formData.scopes?.join('\n') || info.defaultScopes.join('\n')}
                          onChange={(e) => setFormData(prev => ({ ...prev, scopes: e.target.value.split('\n').filter(Boolean) }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                          rows={6}
                        />
                        <p className="mt-1 text-xs text-slate-500">Default scopes shown. Modify as needed.</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`enabled-${connectorType}`}
                          checked={formData.enabled ?? true}
                          onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor={`enabled-${connectorType}`} className="text-sm text-slate-700">
                          Enable this OAuth app
                        </label>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => saveOAuthApp(connectorType)}
                          disabled={isSaving}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSaving ? 'Saving...' : 'Save OAuth App'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingApp(null);
                            setFormData({});
                          }}
                          disabled={isSaving}
                          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="font-semibold text-blue-900 mb-2">ℹ️ How It Works</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Org-Level OAuth:</strong> Configure your own OAuth apps for full control</li>
            <li>• <strong>Platform Fallback:</strong> Use platform credentials if not configured</li>
            <li>• <strong>Hybrid Mode:</strong> Mix custom and platform (e.g., custom Slack, platform GitHub)</li>
            <li>• <strong>Secure Storage:</strong> Credentials encrypted in database</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
