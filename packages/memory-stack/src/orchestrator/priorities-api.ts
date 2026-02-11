/**
 * Strategic Priorities API — Amygdala Configuration
 * ==================================================
 *
 * Brain Analog: The Amygdala learns what matters through experience.
 * Strategic priorities are the organizational equivalent — explicit
 * instructions to the brain about what to care about.
 *
 * "Care about NRR above 110%" = teach the Amygdala that churn/revenue
 * events deserve high importance scores.
 *
 * This API provides CRUD for the `strategic_priorities` table, which
 * the Impact Scorer (Amygdala) reads to compute strategic alignment
 * scores for every event.
 *
 * Usage:
 *   const api = createPrioritiesAPI({ supabase, organizationId });
 *   await api.setPriority({
 *     name: 'Net Revenue Retention',
 *     relevantDomains: ['revenue', 'churn'],
 *     weight: 0.9,
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StrategicPriority } from './impact-scorer';

// ============================================================================
// TYPES
// ============================================================================

export interface PrioritiesAPIConfig {
  supabase: SupabaseClient;
  organizationId: string;
  verbose?: boolean;
}

export interface PriorityInput {
  name: string;
  description?: string;
  relevantDomains: string[];
  keywords?: string[];
  weight?: number;
  expiresAt?: string;
}

// ============================================================================
// PRIORITIES API FACTORY
// ============================================================================

export function createPrioritiesAPI(config: PrioritiesAPIConfig) {
  const { supabase, organizationId, verbose = false } = config;

  const log = verbose
    ? (...args: unknown[]) => console.log('[PrioritiesAPI]', ...args)
    : () => {};

  /**
   * Set (create or update) a strategic priority.
   * Brain Analog: Teaching the Amygdala a new importance rule.
   */
  async function setPriority(input: PriorityInput): Promise<StrategicPriority> {
    const id = `prio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const priority: StrategicPriority = {
      id,
      organizationId,
      name: input.name,
      description: input.description || '',
      relevantDomains: input.relevantDomains,
      keywords: input.keywords || extractKeywords(input.name, input.relevantDomains),
      weight: input.weight ?? 0.5,
      active: true,
      createdAt: now,
      expiresAt: input.expiresAt,
    };

    const { error } = await supabase
      .from('strategic_priorities')
      .upsert({
        id: priority.id,
        organization_id: organizationId,
        name: priority.name,
        description: priority.description,
        relevant_domains: priority.relevantDomains,
        keywords: priority.keywords,
        weight: priority.weight,
        active: priority.active,
        expires_at: priority.expiresAt,
        created_at: priority.createdAt,
        updated_at: now,
      });

    if (error) {
      throw new Error(`Failed to set priority: ${error.message}`);
    }

    log(`Set priority: "${priority.name}" (weight: ${priority.weight}, domains: ${priority.relevantDomains.join(',')})`);
    return priority;
  }

  /**
   * Get all active strategic priorities for this org.
   */
  async function getPriorities(): Promise<StrategicPriority[]> {
    const { data, error } = await supabase
      .from('strategic_priorities')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('weight', { ascending: false });

    if (error) {
      throw new Error(`Failed to get priorities: ${error.message}`);
    }

    return (data || []).map(mapRowToPriority);
  }

  /**
   * Remove a priority (soft delete: mark inactive).
   */
  async function removePriority(id: string): Promise<void> {
    const { error } = await supabase
      .from('strategic_priorities')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to remove priority: ${error.message}`);
    }

    log(`Removed priority: ${id}`);
  }

  /**
   * Update specific fields of a priority.
   */
  async function updatePriority(
    id: string,
    updates: Partial<PriorityInput>
  ): Promise<void> {
    const updateRow: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateRow.name = updates.name;
    if (updates.description !== undefined) updateRow.description = updates.description;
    if (updates.relevantDomains !== undefined) updateRow.relevant_domains = updates.relevantDomains;
    if (updates.keywords !== undefined) updateRow.keywords = updates.keywords;
    if (updates.weight !== undefined) updateRow.weight = updates.weight;
    if (updates.expiresAt !== undefined) updateRow.expires_at = updates.expiresAt;

    const { error } = await supabase
      .from('strategic_priorities')
      .update(updateRow)
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to update priority: ${error.message}`);
    }

    log(`Updated priority: ${id}`);
  }

  return {
    setPriority,
    getPriorities,
    removePriority,
    updatePriority,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function extractKeywords(name: string, domains: string[]): string[] {
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return [...new Set([...words, ...domains])];
}

function mapRowToPriority(row: any): StrategicPriority {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || '',
    relevantDomains: row.relevant_domains || [],
    keywords: row.keywords || [],
    weight: row.weight ?? 0.5,
    active: row.active ?? true,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
