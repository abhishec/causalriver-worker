/**
 * useSmartSuggestions Hook
 * ========================
 *
 * Fetches and manages smart suggestions from the API.
 * Combines health-driven suggestions with usage-pattern suggestions.
 *
 * Usage in copilot page:
 *   const { suggestions, dismiss, healthScore } = useSmartSuggestions(workspaceId);
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SmartSuggestion } from "@/components/copilot/SmartSuggestionCard";
import { logger } from "@/lib/logger";

interface UseSmartSuggestionsReturn {
  suggestions: SmartSuggestion[];
  healthScore: number | null;
  healthStatus: string;
  isLoading: boolean;
  error: string | null;
  dismiss: (suggestionType: string, reason?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSmartSuggestions(
  workspaceId: string | undefined,
  /** How often to poll (ms). Default: 5 minutes */
  pollInterval: number = 5 * 60 * 1000,
): UseSmartSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthStatus, setHealthStatus] = useState<string>("unknown");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchSuggestions = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(
        `/api/suggestions/smart-suggestions?workspaceId=${encodeURIComponent(workspaceId)}`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      setSuggestions(data.suggestions || []);
      setHealthScore(data.healthScore ?? null);
      setHealthStatus(data.healthStatus ?? "unknown");
    } catch (err) {
      const msg = "Failed to fetch suggestions";
      logger.warn("[useSmartSuggestions] Fetch error:", msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!workspaceId) return;

    fetchSuggestions();

    // Poll periodically
    intervalRef.current = setInterval(fetchSuggestions, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workspaceId, pollInterval, fetchSuggestions]);

  const dismiss = useCallback(async (suggestionType: string, reason?: string) => {
    // Optimistically remove from list
    setSuggestions(prev => prev.filter(s => s.type !== suggestionType));

    try {
      await fetch("/api/suggestions/smart-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionType, reason }),
      });
    } catch {
      // Non-critical — dismissal still works visually
    }
  }, []);

  return {
    suggestions,
    healthScore,
    healthStatus,
    isLoading,
    error,
    dismiss,
    refresh: fetchSuggestions,
  };
}
