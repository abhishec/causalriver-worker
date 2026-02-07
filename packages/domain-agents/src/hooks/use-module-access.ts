/**
 * useModuleAccess Hook
 *
 * React hook for checking module access in the UI.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UseModuleAccessReturn, SupabaseClientAdapter } from '../types';

/**
 * Hook configuration
 */
export interface UseModuleAccessConfig {
  /** Organization ID to check access for */
  organizationId: string | null;

  /** Supabase client */
  supabaseClient: SupabaseClientAdapter;

  /** Auto-refresh interval in ms (0 = disabled) */
  refreshInterval?: number;

  /** Initial enabled modules (for optimistic UI) */
  initialModules?: string[];
}

/**
 * React hook for module access checking
 */
export function useModuleAccess(config: UseModuleAccessConfig): UseModuleAccessReturn {
  const {
    organizationId,
    supabaseClient,
    refreshInterval = 0,
    initialModules = []
  } = config;

  const [enabledModules, setEnabledModules] = useState<string[]>(initialModules);
  const [disabledModules, setDisabledModules] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);

  /**
   * Fetch module access from database
   */
  const fetchAccess = useCallback(async () => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseClient
        .from('org_module_subscriptions')
        .select('module_id, enabled')
        .eq('organization_id', organizationId);

      if (fetchError) {
        throw new Error(String(fetchError));
      }

      if (!mountedRef.current) return;

      const enabled: string[] = [];
      const disabled: string[] = [];

      for (const row of (data || []) as Array<{ module_id: string; enabled: boolean }>) {
        if (row.enabled) {
          enabled.push(row.module_id);
        } else {
          disabled.push(row.module_id);
        }
      }

      setEnabledModules(enabled);
      setDisabledModules(disabled);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [organizationId, supabaseClient]);

  /**
   * Check if a specific module is enabled
   */
  const checkModule = useCallback(
    (moduleId: string): boolean => {
      return enabledModules.includes(moduleId);
    },
    [enabledModules]
  );

  /**
   * Refetch access
   */
  const refetch = useCallback(async () => {
    await fetchAccess();
  }, [fetchAccess]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchAccess();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchAccess]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchAccess, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAccess, refreshInterval]);

  return {
    enabledModules,
    disabledModules,
    isLoading,
    error,
    checkModule,
    refetch
  };
}

/**
 * Simple hook that just checks if a single module is enabled
 */
export function useIsModuleEnabled(
  moduleId: string,
  organizationId: string | null,
  supabaseClient: SupabaseClientAdapter
): { isEnabled: boolean; isLoading: boolean } {
  const { enabledModules, isLoading } = useModuleAccess({
    organizationId,
    supabaseClient
  });

  return {
    isEnabled: enabledModules.includes(moduleId),
    isLoading
  };
}
