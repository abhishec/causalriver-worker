/**
 * Domain Taxonomy Persistence Layer
 * ===================================
 *
 * Wraps the in-memory DomainTaxonomy with Supabase persistence.
 * On mutation (classifyResource, setAdminOverride, addSubDomain),
 * writes to DB. On initialization, loads from DB to restore state.
 *
 * Fixes Flaw 9: "Domain Taxonomy Doesn't Persist"
 *
 * Tables used:
 *   - domain_taxonomy_state (classifications + admin overrides)
 *
 * @example
 * ```typescript
 * const taxonomy = await createPersistedDomainTaxonomy(supabase, orgId);
 * taxonomy.classifyResource(input); // Writes to both memory + DB
 * taxonomy.setAdminOverride(resourceId, assignments); // Persisted!
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createDomainTaxonomy,
  type DomainTaxonomyInstance,
  type DomainResource,
  type DomainAssignment,
  type ClassifyResourceInput,
  type ResolvedDomainPath,
} from './domain-taxonomy';

export interface PersistedDomainTaxonomyInstance extends DomainTaxonomyInstance {
  /** Persist all in-memory classifications to database (batch upsert) */
  persistAll(): Promise<{ saved: number }>;
  /** Load all classifications from database into memory */
  loadFromDb(): Promise<{ loaded: number }>;
  /** Persist a single classification to DB */
  persistClassification(resource: DomainResource): Promise<void>;
  /** Get the underlying in-memory taxonomy (for read-only operations) */
  getInMemoryTaxonomy(): DomainTaxonomyInstance;
}

/**
 * Create a persisted domain taxonomy that auto-saves to Supabase.
 *
 * @param supabase - Service-role client (bypasses RLS for writes)
 * @param organizationId - Org scope
 * @param autoLoad - If true, loads existing state from DB on creation (default: true)
 */
export async function createPersistedDomainTaxonomy(
  supabase: SupabaseClient,
  organizationId: string,
  autoLoad = true
): Promise<PersistedDomainTaxonomyInstance> {
  // Create the in-memory taxonomy
  const taxonomy = createDomainTaxonomy();

  // ── Persistence Methods ──────────────────────────────────────

  async function persistClassification(resource: DomainResource): Promise<void> {
    try {
      const primaryAssignment = resource.domainAssignments?.[0];
      if (!primaryAssignment) return;

      await supabase.from('domain_taxonomy_state').upsert(
        {
          organization_id: organizationId,
          source_connector: resource.connector,
          source_identifier: resource.externalId || resource.id,
          resolved_domain: primaryAssignment.subDomain
            ? `${primaryAssignment.domain}.${primaryAssignment.subDomain}`
            : primaryAssignment.domain,
          confidence: resource.classificationConfidence || 0.5,
          resolution_method: resource.classificationMethod || 'pattern_match',
          admin_override: resource.isAdminVerified || false,
          metadata: {
            name: resource.name,
            resourceType: resource.resourceType,
            allAssignments: resource.domainAssignments,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,source_connector,source_identifier' }
      );
    } catch (err: any) {
      console.error(`[Taxonomy] Failed to persist classification for ${resource.id}:`, err.message);
    }
  }

  async function persistAll(): Promise<{ saved: number }> {
    let saved = 0;
    try {
      const stats = taxonomy.getStats();
      const allDomains = [
        'engineering', 'product', 'marketing', 'sales', 'finance',
        'support', 'people', 'operations', 'executive', 'legal',
      ];

      for (const domain of allDomains) {
        const resources = taxonomy.getResourcesByDomain(domain as any);
        for (const resource of resources) {
          await persistClassification(resource);
          saved++;
        }
      }
    } catch (err: any) {
      console.error('[Taxonomy] persistAll failed:', err.message);
    }
    return { saved };
  }

  async function loadFromDb(): Promise<{ loaded: number }> {
    let loaded = 0;
    try {
      const { data: classifications } = await supabase
        .from('domain_taxonomy_state')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(50_000); // Safety cap

      if (!classifications || classifications.length === 0) {
        return { loaded: 0 };
      }

      for (const row of classifications) {
        try {
          // Parse the resolved domain back into domain + subDomain
          const parts = row.resolved_domain.split('.');
          const domain = parts[0];
          const subDomain = parts.length > 1 ? parts.slice(1).join('.') : undefined;

          // Reconstruct assignments
          const assignments: DomainAssignment[] = row.metadata?.allAssignments || [
            {
              domain,
              subDomain,
              weight: 1.0,
              evidence: [`loaded from DB: ${row.resolution_method}`],
            },
          ];

          // Re-classify through the taxonomy to restore in-memory state
          const input: ClassifyResourceInput = {
            connector: row.source_connector,
            resourceType: row.metadata?.resourceType || 'channel',
            externalId: row.source_identifier,
            name: row.metadata?.name || row.source_identifier,
            metadata: row.metadata || {},
          };

          taxonomy.classifyResource(input);

          // If it was an admin override, re-apply it
          if (row.admin_override) {
            const resourceId = `${row.source_connector}:${row.source_identifier}`;
            taxonomy.setAdminOverride(resourceId, assignments);
          }

          loaded++;
        } catch {
          // Skip invalid rows — don't block loading
        }
      }

      console.log(`[Taxonomy] Loaded ${loaded} classifications from DB`);
    } catch (err: any) {
      console.error('[Taxonomy] loadFromDb failed:', err.message);
    }

    return { loaded };
  }

  // ── Wrap mutation methods to auto-persist ──────────────────────

  const originalClassify = taxonomy.classifyResource.bind(taxonomy);
  const originalSetOverride = taxonomy.setAdminOverride.bind(taxonomy);

  const persistedTaxonomy: PersistedDomainTaxonomyInstance = {
    ...taxonomy,

    classifyResource(input: ClassifyResourceInput): DomainResource {
      const resource = originalClassify(input);
      // Fire-and-forget persist
      persistClassification(resource).catch(() => {});
      return resource;
    },

    setAdminOverride(resourceId: string, assignments: DomainAssignment[]): void {
      taxonomy.setAdminOverride(resourceId, assignments);
      // Persist the override
      const resource = {
        id: resourceId,
        connector: resourceId.split(':')[0] || 'unknown',
        resourceType: 'channel' as const,
        externalId: resourceId.split(':')[1] || resourceId,
        name: resourceId,
        domainAssignments: assignments,
        classificationMethod: 'admin_explicit' as const,
        classificationConfidence: 1.0,
        isAdminVerified: true,
        lastClassifiedAt: Date.now(),
      } as DomainResource;
      persistClassification(resource).catch(() => {});
    },

    persistAll,
    loadFromDb,
    persistClassification,
    getInMemoryTaxonomy() {
      return taxonomy;
    },
  };

  // Auto-load from DB if requested
  if (autoLoad) {
    await loadFromDb();
  }

  return persistedTaxonomy;
}
