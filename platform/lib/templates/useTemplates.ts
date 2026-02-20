"use client";

/**
 * useTemplates — React hook for loading custom agent templates
 * =============================================================
 *
 * Fetches templates from /api/templates and converts them to
 * SlashCommand[] + CommandGathering map for the copilot UI.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type { SlashCommand } from "@/components/copilot/SlashCommandPicker";
import type { CommandGathering } from "@/components/copilot/command-gathering";
import {
  type AgentTemplate,
  templateToSlashCommand,
  templateToGathering,
} from "./types";

export interface UseTemplatesReturn {
  /** Raw template objects from the database */
  templates: AgentTemplate[];
  /** Templates converted to SlashCommand[] for the picker */
  customCommands: SlashCommand[];
  /** Templates converted to gathering map for interactive params */
  customGatheringMap: Record<string, CommandGathering>;
  /** Whether templates are still loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-fetch templates (e.g. after saving a new one) */
  refetch: () => void;
}

export function useTemplates(organizationId?: string): UseTemplatesReturn {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setTemplates([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/templates?orgId=${encodeURIComponent(organizationId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const all: AgentTemplate[] = [
          ...(data.templates || []),
          ...(data.publicTemplates || []),
        ];
        setTemplates(all);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, fetchCounter]);

  const customCommands = useMemo(
    () => templates.map(templateToSlashCommand),
    [templates]
  );

  const customGatheringMap = useMemo(() => {
    const map: Record<string, CommandGathering> = {};
    for (const t of templates) {
      const gathering = templateToGathering(t);
      if (gathering) {
        map[t.command_id] = gathering;
      }
    }
    return map;
  }, [templates]);

  return { templates, customCommands, customGatheringMap, loading, error, refetch };
}
