/**
 * useIntentRouter Hook
 *
 * React hook for intent classification and routing.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type {
  UseIntentRouterReturn,
  RoutingResult,
  ModuleRegistry,
  PersonaRegistry,
  SupabaseClientAdapter,
  AIClientAdapter
} from '../types';
import { createDomainRouter, type DomainRouter } from '../routing/domain-router';

/**
 * Hook configuration
 */
export interface UseIntentRouterConfig {
  /** Module registry */
  modules: ModuleRegistry;

  /** Persona registry (optional) */
  personas?: PersonaRegistry;

  /** Organization ID */
  organizationId: string | null;

  /** Supabase client */
  supabaseClient: SupabaseClientAdapter;

  /** AI client for fallback classification */
  aiClient?: AIClientAdapter;

  /** Admin contact email */
  adminContact?: string;
}

/**
 * React hook for intent routing
 */
export function useIntentRouter(config: UseIntentRouterConfig): UseIntentRouterReturn {
  const {
    modules,
    personas,
    organizationId,
    supabaseClient,
    aiClient,
    adminContact
  } = config;

  const [lastResult, setLastResult] = useState<RoutingResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);

  // Create router (memoized)
  const router = useMemo<DomainRouter | null>(() => {
    if (!organizationId) return null;

    return createDomainRouter({
      modules,
      personas,
      organizationId,
      supabaseClient,
      aiClient,
      adminContact
    });
  }, [modules, personas, organizationId, supabaseClient, aiClient, adminContact]);

  /**
   * Route a query
   */
  const route = useCallback(
    async (query: string): Promise<RoutingResult> => {
      if (!router) {
        const emptyResult: RoutingResult = {
          intent: {
            modules: ['executive'],
            primaryModule: 'executive',
            confidence: 0.1,
            matchedKeywords: [],
            isCrossDomain: false,
            method: 'keyword'
          },
          access: {
            enabled: [],
            disabled: [],
            partial: false,
            missingCapabilities: []
          },
          canHandle: false,
          blockers: [{ type: 'permission_denied', message: 'No organization context' }]
        };
        return emptyResult;
      }

      try {
        setIsRouting(true);
        setError(null);

        const result = await router.route(query);

        if (mountedRef.current) {
          setLastResult(result);
        }

        return result;
      } catch (err) {
        const routingError = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(routingError);
        }
        throw routingError;
      } finally {
        if (mountedRef.current) {
          setIsRouting(false);
        }
      }
    },
    [router]
  );

  return {
    route,
    lastResult,
    isRouting,
    error
  };
}

/**
 * Simple hook for one-off intent classification (no access check)
 */
export function useIntentClassifier(modules: ModuleRegistry) {
  const classify = useCallback(
    (query: string) => {
      // Use simple keyword classification (synchronous)
      const { createSimpleClassifier } = require('../intent/classifier');
      const classifier = createSimpleClassifier(modules);
      return classifier(query);
    },
    [modules]
  );

  return { classify };
}
