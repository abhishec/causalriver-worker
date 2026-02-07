/**
 * Cross-Domain Coordination
 *
 * Handle queries that span multiple modules.
 */

import type {
  CrossDomainQuery,
  ModuleRelationship,
  IntentClassification,
  ModuleRegistry,
  ModuleDefinition
} from '../types';

/**
 * Known relationships between modules
 */
const MODULE_RELATIONSHIPS: ModuleRelationship[] = [
  // Finance ↔ Revenue
  {
    source: 'revenue',
    target: 'finance',
    type: 'depends_on',
    description: 'Deal value flows into revenue recognition and cash projections'
  },
  // CS ↔ AM
  {
    source: 'cs',
    target: 'am',
    type: 'enriches',
    description: 'Customer health informs renewal risk assessment'
  },
  {
    source: 'am',
    target: 'cs',
    type: 'validates',
    description: 'Renewal outcomes validate health score accuracy'
  },
  // Services ↔ CS
  {
    source: 'services',
    target: 'cs',
    type: 'enriches',
    description: 'Delivery quality impacts customer health'
  },
  // Revenue ↔ AM
  {
    source: 'revenue',
    target: 'am',
    type: 'depends_on',
    description: 'New deals become accounts for expansion'
  },
  // Marketing ↔ Revenue
  {
    source: 'marketing',
    target: 'revenue',
    type: 'depends_on',
    description: 'Marketing generates leads that become deals'
  },
  // People ↔ Services
  {
    source: 'people',
    target: 'services',
    type: 'enriches',
    description: 'Team capacity affects delivery capability'
  },
  // Executive aggregates all
  {
    source: 'finance',
    target: 'executive',
    type: 'aggregates',
    description: 'Financial metrics feed executive dashboard'
  },
  {
    source: 'revenue',
    target: 'executive',
    type: 'aggregates',
    description: 'Pipeline metrics feed executive dashboard'
  },
  {
    source: 'cs',
    target: 'executive',
    type: 'aggregates',
    description: 'Customer health feeds executive dashboard'
  },
  {
    source: 'am',
    target: 'executive',
    type: 'aggregates',
    description: 'Retention metrics feed executive dashboard'
  },
  {
    source: 'services',
    target: 'executive',
    type: 'aggregates',
    description: 'Delivery metrics feed executive dashboard'
  }
];

/**
 * Detect if a query is cross-domain
 */
export function isCrossDomainQuery(intent: IntentClassification): boolean {
  return intent.isCrossDomain || intent.modules.length > 1;
}

/**
 * Analyze a cross-domain query
 */
export function analyzeCrossDomainQuery(
  query: string,
  intent: IntentClassification,
  registry: ModuleRegistry
): CrossDomainQuery {
  const modules = intent.modules;

  // Find relevant relationships
  const relationships = MODULE_RELATIONSHIPS.filter(
    r => modules.includes(r.source) && modules.includes(r.target)
  );

  // Determine processing order based on relationships
  const processingOrder = determineProcessingOrder(modules, relationships);

  return {
    query,
    modules,
    relationships,
    processingOrder
  };
}

/**
 * Determine the order to process modules based on dependencies
 */
function determineProcessingOrder(
  modules: string[],
  relationships: ModuleRelationship[]
): string[] {
  // Build dependency graph
  const dependencies = new Map<string, Set<string>>();
  for (const moduleId of modules) {
    dependencies.set(moduleId, new Set());
  }

  for (const rel of relationships) {
    if (rel.type === 'depends_on') {
      // Source depends on target, so target should be processed first
      const sourceDeps = dependencies.get(rel.source);
      if (sourceDeps && modules.includes(rel.target)) {
        sourceDeps.add(rel.target);
      }
    }
  }

  // Topological sort
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(moduleId: string) {
    if (visited.has(moduleId)) return;
    if (visiting.has(moduleId)) {
      // Cycle detected - just add in order
      return;
    }

    visiting.add(moduleId);

    const deps = dependencies.get(moduleId);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
      }
    }

    visiting.delete(moduleId);
    visited.add(moduleId);
    result.push(moduleId);
  }

  for (const moduleId of modules) {
    visit(moduleId);
  }

  return result;
}

/**
 * Get modules that should be queried together
 */
export function getRelatedModules(
  moduleId: string,
  registry: ModuleRegistry
): string[] {
  const related = new Set<string>();

  for (const rel of MODULE_RELATIONSHIPS) {
    if (rel.source === moduleId) {
      related.add(rel.target);
    }
    if (rel.target === moduleId) {
      related.add(rel.source);
    }
  }

  // Filter to only modules in registry
  return Array.from(related).filter(id => registry[id]);
}

/**
 * Explain the relationship between modules for a query
 */
export function explainCrossDomainRelationships(
  crossDomainQuery: CrossDomainQuery,
  registry: ModuleRegistry
): string {
  if (crossDomainQuery.relationships.length === 0) {
    const moduleNames = crossDomainQuery.modules
      .map(id => registry[id]?.name || id)
      .join(' and ');
    return `This query spans ${moduleNames}, which are analyzed independently.`;
  }

  const explanations = crossDomainQuery.relationships.map(rel => {
    const sourceName = registry[rel.source]?.name || rel.source;
    const targetName = registry[rel.target]?.name || rel.target;
    return `${sourceName} → ${targetName}: ${rel.description}`;
  });

  return `Cross-domain relationships:\n${explanations.map(e => `• ${e}`).join('\n')}`;
}

/**
 * Suggest a primary module for cross-domain queries
 */
export function suggestPrimaryModule(
  crossDomainQuery: CrossDomainQuery,
  registry: ModuleRegistry
): { moduleId: string; reason: string } {
  // If executive is involved, use that
  if (crossDomainQuery.modules.includes('executive')) {
    return {
      moduleId: 'executive',
      reason: 'Executive module synthesizes cross-domain insights'
    };
  }

  // Use the first module in processing order
  const primaryId = crossDomainQuery.processingOrder[0] || crossDomainQuery.modules[0];
  const primaryModule = registry[primaryId];

  return {
    moduleId: primaryId,
    reason: primaryModule
      ? `${primaryModule.name} is the primary domain for this query`
      : `Starting with ${primaryId}`
  };
}

/**
 * Get cascade effects - what happens when one module's data changes
 */
export function getCascadeEffects(
  sourceModule: string,
  registry: ModuleRegistry
): Array<{ targetModule: string; effect: string }> {
  const effects: Array<{ targetModule: string; effect: string }> = [];

  for (const rel of MODULE_RELATIONSHIPS) {
    if (rel.source === sourceModule) {
      const targetModule = registry[rel.target];
      if (targetModule) {
        effects.push({
          targetModule: rel.target,
          effect: rel.description
        });
      }
    }
  }

  return effects;
}
