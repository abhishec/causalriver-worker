/**
 * Module Access Control
 *
 * Check and manage module access for organizations.
 */

import type {
  ModuleAccessResult,
  ModuleSubscription,
  AccessControlConfig,
  SupabaseClientAdapter,
  ModuleRegistry
} from '../types';

/**
 * Module access checker instance
 */
export interface ModuleAccessChecker {
  /** Check if specific modules are enabled */
  checkAccess(moduleIds: string[]): Promise<ModuleAccessResult>;

  /** Check if a single module is enabled */
  isModuleEnabled(moduleId: string): Promise<boolean>;

  /** Get all enabled modules for the organization */
  getEnabledModules(): Promise<string[]>;

  /** Get all module subscriptions */
  getSubscriptions(): Promise<ModuleSubscription[]>;

  /** Clear the cache */
  clearCache(): void;
}

/**
 * Cached subscription data
 */
interface CachedSubscriptions {
  subscriptions: ModuleSubscription[];
  timestamp: number;
}

/**
 * Create a module access checker
 */
export function createModuleAccessChecker(config: AccessControlConfig): ModuleAccessChecker {
  const {
    organizationId,
    supabaseClient,
    cacheTtl = 60000 // 1 minute default
  } = config;

  let cache: CachedSubscriptions | null = null;

  /**
   * Fetch subscriptions from database
   */
  async function fetchSubscriptions(): Promise<ModuleSubscription[]> {
    // Check cache
    if (cache && Date.now() - cache.timestamp < cacheTtl) {
      return cache.subscriptions;
    }

    try {
      const { data, error } = await supabaseClient
        .from('org_module_subscriptions')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) {
        console.error('[ModuleAccess] Failed to fetch subscriptions:', error);
        return cache?.subscriptions || [];
      }

      const subscriptions: ModuleSubscription[] = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        organizationId: row.organization_id as string,
        moduleId: row.module_id as string,
        enabled: row.enabled as boolean,
        enabledAt: row.enabled_at ? new Date(row.enabled_at as string) : undefined,
        disabledAt: row.disabled_at ? new Date(row.disabled_at as string) : undefined,
        config: row.config as Record<string, unknown> | undefined
      }));

      // Update cache
      cache = {
        subscriptions,
        timestamp: Date.now()
      };

      return subscriptions;
    } catch (error) {
      console.error('[ModuleAccess] Error fetching subscriptions:', error);
      return cache?.subscriptions || [];
    }
  }

  /**
   * Check access for specific modules
   */
  async function checkAccess(moduleIds: string[]): Promise<ModuleAccessResult> {
    const subscriptions = await fetchSubscriptions();
    const enabledModuleIds = new Set(
      subscriptions
        .filter(s => s.enabled)
        .map(s => s.moduleId)
    );

    const enabled: string[] = [];
    const disabled: string[] = [];

    for (const moduleId of moduleIds) {
      if (enabledModuleIds.has(moduleId)) {
        enabled.push(moduleId);
      } else {
        disabled.push(moduleId);
      }
    }

    return {
      enabled,
      disabled,
      partial: enabled.length > 0 && disabled.length > 0,
      missingCapabilities: [] // Would need module registry to populate
    };
  }

  /**
   * Check if a single module is enabled
   */
  async function isModuleEnabled(moduleId: string): Promise<boolean> {
    const result = await checkAccess([moduleId]);
    return result.enabled.includes(moduleId);
  }

  /**
   * Get all enabled modules
   */
  async function getEnabledModules(): Promise<string[]> {
    const subscriptions = await fetchSubscriptions();
    return subscriptions
      .filter(s => s.enabled)
      .map(s => s.moduleId);
  }

  /**
   * Get all subscriptions
   */
  async function getSubscriptions(): Promise<ModuleSubscription[]> {
    return fetchSubscriptions();
  }

  return {
    checkAccess,
    isModuleEnabled,
    getEnabledModules,
    getSubscriptions,
    clearCache: () => { cache = null; }
  };
}

/**
 * Check module access with capabilities
 */
export async function checkModuleAccessWithCapabilities(
  checker: ModuleAccessChecker,
  moduleIds: string[],
  registry: ModuleRegistry
): Promise<ModuleAccessResult> {
  const result = await checker.checkAccess(moduleIds);

  // Calculate missing capabilities from disabled modules
  const missingCapabilities: string[] = [];
  for (const moduleId of result.disabled) {
    const module = registry[moduleId];
    if (module) {
      missingCapabilities.push(...module.capabilities);
    }
  }

  return {
    ...result,
    missingCapabilities
  };
}

/**
 * Batch check access for multiple organizations
 */
export async function batchCheckAccess(
  supabaseClient: SupabaseClientAdapter,
  checks: Array<{ organizationId: string; moduleIds: string[] }>
): Promise<Map<string, ModuleAccessResult>> {
  const results = new Map<string, ModuleAccessResult>();

  // Group by organization
  const orgModules = new Map<string, Set<string>>();
  for (const check of checks) {
    const existing = orgModules.get(check.organizationId) || new Set();
    for (const moduleId of check.moduleIds) {
      existing.add(moduleId);
    }
    orgModules.set(check.organizationId, existing);
  }

  // Fetch all at once
  const orgIds = Array.from(orgModules.keys());
  const { data, error } = await supabaseClient
    .from('org_module_subscriptions')
    .select('*')
    .in('organization_id', orgIds);

  if (error) {
    console.error('[ModuleAccess] Batch fetch failed:', error);
    // Return empty results
    for (const check of checks) {
      results.set(check.organizationId, {
        enabled: [],
        disabled: check.moduleIds,
        partial: false,
        missingCapabilities: []
      });
    }
    return results;
  }

  // Build lookup
  const orgSubscriptions = new Map<string, Set<string>>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    if (row.enabled) {
      const orgId = row.organization_id as string;
      const existing = orgSubscriptions.get(orgId) || new Set();
      existing.add(row.module_id as string);
      orgSubscriptions.set(orgId, existing);
    }
  }

  // Build results
  for (const check of checks) {
    const enabledSet = orgSubscriptions.get(check.organizationId) || new Set();
    const enabled = check.moduleIds.filter(m => enabledSet.has(m));
    const disabled = check.moduleIds.filter(m => !enabledSet.has(m));

    results.set(check.organizationId, {
      enabled,
      disabled,
      partial: enabled.length > 0 && disabled.length > 0,
      missingCapabilities: []
    });
  }

  return results;
}
