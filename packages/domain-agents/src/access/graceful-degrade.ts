/**
 * Graceful Degradation
 *
 * Handle disabled modules gracefully with helpful responses.
 */

import type {
  ModuleAccessResult,
  ModuleDefinition,
  ModuleRegistry,
  DisabledModuleResponse
} from '../types';

/**
 * Build a response for when required modules are disabled
 */
export function buildDisabledModuleResponse(
  access: ModuleAccessResult,
  registry: ModuleRegistry,
  options: {
    adminContact?: string;
    showPartialCapabilities?: boolean;
  } = {}
): DisabledModuleResponse {
  const { adminContact, showPartialCapabilities = true } = options;

  // Get disabled module details
  const disabledModules: ModuleDefinition[] = access.disabled
    .map(id => registry[id])
    .filter(Boolean);

  // Get enabled module details (for partial capabilities)
  const enabledModules: ModuleDefinition[] = access.enabled
    .map(id => registry[id])
    .filter(Boolean);

  // Collect all capabilities from disabled modules
  const capabilities: string[] = [];
  for (const module of disabledModules) {
    capabilities.push(...module.capabilities);
  }

  // Build explanation
  const moduleNames = disabledModules.map(m => m.name).join(', ');
  const explanation = disabledModules.length === 1
    ? `This query requires the ${moduleNames} module, which isn't enabled for your organization.`
    : `This query requires the ${moduleNames} modules, which aren't enabled for your organization.`;

  // Build CTA
  const ctaText = adminContact
    ? `Contact your admin (${adminContact}) to enable ${disabledModules.length === 1 ? 'this module' : 'these modules'}.`
    : `Contact your administrator to enable ${disabledModules.length === 1 ? 'this module' : 'these modules'}.`;

  // Check for partial data
  const hasPartialData = access.partial && enabledModules.length > 0;
  const partialCapabilities = showPartialCapabilities && hasPartialData
    ? enabledModules.flatMap(m => m.capabilities.slice(0, 2))
    : undefined;

  return {
    modules: disabledModules,
    explanation,
    capabilities,
    ctaText,
    adminContact,
    hasPartialData,
    partialCapabilities
  };
}

/**
 * Format disabled module response as a user-friendly message
 */
export function formatDisabledModuleMessage(
  response: DisabledModuleResponse,
  options: {
    includeCapabilities?: boolean;
    includePartial?: boolean;
    maxCapabilities?: number;
  } = {}
): string {
  const {
    includeCapabilities = true,
    includePartial = true,
    maxCapabilities = 5
  } = options;

  const lines: string[] = [];

  // Module icons and names
  const moduleList = response.modules
    .map(m => `${m.icon} **${m.name}**`)
    .join(', ');

  lines.push(`This relates to ${moduleList}.`);
  lines.push('');
  lines.push(response.explanation);

  // Capabilities they would get
  if (includeCapabilities && response.capabilities.length > 0) {
    lines.push('');
    lines.push('With this module enabled, you could:');
    for (const cap of response.capabilities.slice(0, maxCapabilities)) {
      lines.push(`• ${cap}`);
    }
    if (response.capabilities.length > maxCapabilities) {
      lines.push(`• ...and ${response.capabilities.length - maxCapabilities} more capabilities`);
    }
  }

  // Partial capabilities
  if (includePartial && response.hasPartialData && response.partialCapabilities) {
    lines.push('');
    lines.push('However, I can help with related information from your enabled modules:');
    for (const cap of response.partialCapabilities) {
      lines.push(`• ${cap}`);
    }
  }

  // CTA
  lines.push('');
  lines.push(`👉 ${response.ctaText}`);

  return lines.join('\n');
}

/**
 * Get a short one-liner for the disabled module
 */
export function getDisabledModuleOneLiner(
  access: ModuleAccessResult,
  registry: ModuleRegistry
): string {
  if (access.disabled.length === 0) {
    return '';
  }

  const moduleNames = access.disabled
    .map(id => registry[id]?.name || id)
    .join(', ');

  return `The ${moduleNames} module${access.disabled.length > 1 ? 's are' : ' is'} not enabled for your organization.`;
}

/**
 * Suggest which modules to enable based on query
 */
export function suggestModulesToEnable(
  disabledModules: ModuleDefinition[]
): Array<{
  module: ModuleDefinition;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}> {
  return disabledModules.map(module => {
    // Determine priority based on module category
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (module.category === 'core') {
      priority = 'high';
    } else if (module.category === 'strategic') {
      priority = 'low';
    }

    // Build reason
    const topCapabilities = module.capabilities.slice(0, 2).join(' and ');
    const reason = `Enable ${module.name} to get ${topCapabilities}.`;

    return {
      module,
      reason,
      priority
    };
  }).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Check if a query can be partially answered with available modules
 */
export function canPartiallyAnswer(
  requestedModules: string[],
  access: ModuleAccessResult,
  registry: ModuleRegistry
): {
  canAnswer: boolean;
  availableContext: string[];
  missingContext: string[];
} {
  const availableContext: string[] = [];
  const missingContext: string[] = [];

  for (const moduleId of requestedModules) {
    const module = registry[moduleId];
    if (!module) continue;

    if (access.enabled.includes(moduleId)) {
      availableContext.push(`${module.name}: ${module.capabilities.slice(0, 2).join(', ')}`);
    } else {
      missingContext.push(`${module.name}: ${module.capabilities.slice(0, 2).join(', ')}`);
    }
  }

  return {
    canAnswer: availableContext.length > 0,
    availableContext,
    missingContext
  };
}
