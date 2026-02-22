"use client";

/**
 * useWorkflows — React hook for loading workflows as slash commands
 * =================================================================
 *
 * Fetches workflows from /api/workflows and converts them to
 * SlashCommand[] + CommandGathering map for the copilot UI.
 *
 * Mirrors the pattern of useTemplates for agent templates.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type { SlashCommand } from "@/components/copilot/SlashCommandPicker";
import type { CommandGathering } from "@/components/copilot/command-gathering";
import {
  type WorkflowSlashCommandInput,
  workflowToSlashCommand,
  workflowToGathering,
} from "@/lib/templates/types";

export interface UseWorkflowsReturn {
  /** Raw workflow objects from the database */
  workflows: WorkflowSlashCommandInput[];
  /** Workflows converted to SlashCommand[] for the picker */
  workflowCommands: SlashCommand[];
  /** Workflows converted to gathering map for interactive params */
  workflowGatheringMap: Record<string, CommandGathering>;
  /** Whether workflows are still loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-fetch workflows (e.g. after creating a new one) */
  refetch: () => void;
}

export function useWorkflows(organizationId?: string): UseWorkflowsReturn {
  const [workflows, setWorkflows] = useState<WorkflowSlashCommandInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setWorkflows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    setLoading(true);
    setError(null);

    fetch(`/api/workflows?organizationId=${encodeURIComponent(organizationId)}&limit=100`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        // Only include active workflows (not drafts/archived)
        const active = (data.workflows || []).filter(
          (w: any) => w.status === "active"
        );
        setWorkflows(active);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.name === "AbortError" ? null : err.message);
        setLoading(false);
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [organizationId, fetchCounter]);

  const workflowCommands = useMemo(
    () => workflows.map(workflowToSlashCommand),
    [workflows]
  );

  const workflowGatheringMap = useMemo(() => {
    const map: Record<string, CommandGathering> = {};
    for (const w of workflows) {
      const gathering = workflowToGathering(w);
      if (gathering) {
        map[`workflow-${w.id}`] = gathering;
      }
    }
    return map;
  }, [workflows]);

  return { workflows, workflowCommands, workflowGatheringMap, loading, error, refetch };
}
