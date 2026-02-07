/**
 * Nexus Domain Agents - Graceful Degradation Tests
 *
 * Comprehensive tests for the graceful degradation module including:
 * - buildDisabledModuleResponse: explanation text, CTA, partial data, capabilities
 * - formatDisabledModuleMessage: icons, names, capabilities list, partial section, CTA
 * - getDisabledModuleOneLiner: empty string, singular, plural forms
 * - suggestModulesToEnable: priority assignment by category, sort order
 * - canPartiallyAnswer: available vs missing context, canAnswer flag
 */

import { describe, it, expect } from 'vitest';
import {
  buildDisabledModuleResponse,
  formatDisabledModuleMessage,
  getDisabledModuleOneLiner,
  suggestModulesToEnable,
  canPartiallyAnswer,
} from '../access/graceful-degrade';
import type {
  ModuleAccessResult,
  ModuleDefinition,
  ModuleRegistry,
} from '../types';

// =============================================================================
// TEST DATA
// =============================================================================

const testRegistry: ModuleRegistry = {
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'Financial management',
    icon: '\u{1F4B0}',
    keywords: ['invoice'],
    capabilities: ['Invoice tracking', 'Cash flow', 'Budget analysis'],
    tables: ['invoices'],
    personas: ['CFO'],
    category: 'core' as const,
  },
  revenue: {
    id: 'revenue',
    name: 'Revenue',
    description: 'Sales pipeline',
    icon: '\u{1F4C8}',
    keywords: ['pipeline'],
    capabilities: ['Pipeline management', 'Deal tracking'],
    tables: ['deals'],
    personas: ['VP Sales'],
    category: 'core' as const,
  },
  cs: {
    id: 'cs',
    name: 'Customer Success',
    description: 'Customer health',
    icon: '\u{1F49A}',
    keywords: ['health'],
    capabilities: ['Health scoring', 'Churn prevention'],
    tables: ['clients'],
    personas: ['CSM'],
    category: 'operational' as const,
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Strategic insights',
    icon: '\u{1F454}',
    keywords: ['strategy'],
    capabilities: ['Cross-domain insights'],
    tables: ['goals'],
    personas: ['CEO'],
    category: 'strategic' as const,
  },
};

const testAccess: ModuleAccessResult = {
  enabled: ['finance'],
  disabled: ['revenue', 'cs'],
  partial: true,
  missingCapabilities: ['Pipeline management'],
};

// =============================================================================
// buildDisabledModuleResponse TESTS
// =============================================================================

describe('Graceful Degrade - buildDisabledModuleResponse', () => {
  it('builds singular explanation for a single disabled module', () => {
    const singleDisabledAccess: ModuleAccessResult = {
      enabled: ['finance'],
      disabled: ['revenue'],
      partial: true,
      missingCapabilities: ['Pipeline management'],
    };

    const response = buildDisabledModuleResponse(singleDisabledAccess, testRegistry);

    expect(response.explanation).toBe(
      "This query requires the Revenue module, which isn't enabled for your organization.",
    );
  });

  it('builds plural explanation for multiple disabled modules', () => {
    const response = buildDisabledModuleResponse(testAccess, testRegistry);

    expect(response.explanation).toBe(
      "This query requires the Revenue, Customer Success modules, which aren't enabled for your organization.",
    );
  });

  it('includes adminContact in CTA when provided', () => {
    const response = buildDisabledModuleResponse(testAccess, testRegistry, {
      adminContact: 'admin@acme.com',
    });

    expect(response.ctaText).toContain('admin@acme.com');
    expect(response.ctaText).toBe(
      'Contact your admin (admin@acme.com) to enable these modules.',
    );
    expect(response.adminContact).toBe('admin@acme.com');
  });

  it('builds default CTA without adminContact', () => {
    const response = buildDisabledModuleResponse(testAccess, testRegistry);

    expect(response.ctaText).toBe(
      'Contact your administrator to enable these modules.',
    );
    expect(response.adminContact).toBeUndefined();
  });

  it('sets hasPartialData true when access is partial and enabled modules exist', () => {
    const response = buildDisabledModuleResponse(testAccess, testRegistry);

    expect(response.hasPartialData).toBe(true);
  });

  it('includes partialCapabilities from enabled modules (first 2 caps each)', () => {
    const response = buildDisabledModuleResponse(testAccess, testRegistry);

    // Finance module has 3 capabilities; first 2 are 'Invoice tracking' and 'Cash flow'
    expect(response.partialCapabilities).toBeDefined();
    expect(response.partialCapabilities).toEqual(['Invoice tracking', 'Cash flow']);
  });
});

// =============================================================================
// formatDisabledModuleMessage TESTS
// =============================================================================

describe('Graceful Degrade - formatDisabledModuleMessage', () => {
  // Build a response once for use across format tests
  const response = buildDisabledModuleResponse(testAccess, testRegistry);

  it('includes module icons and names', () => {
    const message = formatDisabledModuleMessage(response);

    expect(message).toContain('\u{1F4C8} **Revenue**');
    expect(message).toContain('\u{1F49A} **Customer Success**');
  });

  it('includes capabilities list', () => {
    const message = formatDisabledModuleMessage(response);

    expect(message).toContain('With this module enabled, you could:');
    expect(message).toContain('Pipeline management');
    expect(message).toContain('Deal tracking');
    expect(message).toContain('Health scoring');
    expect(message).toContain('Churn prevention');
  });

  it('respects maxCapabilities option', () => {
    const message = formatDisabledModuleMessage(response, { maxCapabilities: 2 });

    // Should show only 2 capabilities, plus a "...and N more" line
    // Total capabilities from disabled modules: Pipeline management, Deal tracking,
    // Health scoring, Churn prevention = 4
    expect(message).toContain('...and 2 more capabilities');
  });

  it('includes partial capabilities section when hasPartialData is true', () => {
    const message = formatDisabledModuleMessage(response);

    expect(message).toContain(
      'However, I can help with related information from your enabled modules:',
    );
    expect(message).toContain('Invoice tracking');
    expect(message).toContain('Cash flow');
  });

  it('includes CTA with pointing emoji', () => {
    const message = formatDisabledModuleMessage(response);

    expect(message).toContain('\u{1F449}');
    expect(message).toContain(response.ctaText);
    expect(message).toContain(`\u{1F449} ${response.ctaText}`);
  });
});

// =============================================================================
// getDisabledModuleOneLiner TESTS
// =============================================================================

describe('Graceful Degrade - getDisabledModuleOneLiner', () => {
  it('returns empty string when no modules are disabled', () => {
    const noDisabledAccess: ModuleAccessResult = {
      enabled: ['finance', 'revenue'],
      disabled: [],
      partial: false,
      missingCapabilities: [],
    };

    const result = getDisabledModuleOneLiner(noDisabledAccess, testRegistry);

    expect(result).toBe('');
  });

  it('uses singular form ("is") for a single disabled module', () => {
    const singleDisabledAccess: ModuleAccessResult = {
      enabled: ['finance'],
      disabled: ['revenue'],
      partial: true,
      missingCapabilities: [],
    };

    const result = getDisabledModuleOneLiner(singleDisabledAccess, testRegistry);

    expect(result).toBe(
      'The Revenue module is not enabled for your organization.',
    );
    expect(result).toContain(' is ');
    expect(result).not.toContain(' are ');
  });

  it('uses plural form ("are") for multiple disabled modules', () => {
    const result = getDisabledModuleOneLiner(testAccess, testRegistry);

    expect(result).toBe(
      'The Revenue, Customer Success modules are not enabled for your organization.',
    );
    expect(result).toContain(' are ');
    expect(result).not.toContain(' is ');
  });
});

// =============================================================================
// suggestModulesToEnable TESTS
// =============================================================================

describe('Graceful Degrade - suggestModulesToEnable', () => {
  const coreModule = testRegistry['revenue'];
  const operationalModule = testRegistry['cs'];
  const strategicModule = testRegistry['executive'];

  it('assigns high priority to core modules', () => {
    const suggestions = suggestModulesToEnable([coreModule]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].priority).toBe('high');
    expect(suggestions[0].module.id).toBe('revenue');
    expect(suggestions[0].reason).toContain('Revenue');
  });

  it('assigns low priority to strategic modules', () => {
    const suggestions = suggestModulesToEnable([strategicModule]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].priority).toBe('low');
    expect(suggestions[0].module.id).toBe('executive');
  });

  it('sorts suggestions by priority: high before medium before low', () => {
    const suggestions = suggestModulesToEnable([
      strategicModule,  // low
      operationalModule, // medium
      coreModule,        // high
    ]);

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].priority).toBe('high');
    expect(suggestions[0].module.id).toBe('revenue');
    expect(suggestions[1].priority).toBe('medium');
    expect(suggestions[1].module.id).toBe('cs');
    expect(suggestions[2].priority).toBe('low');
    expect(suggestions[2].module.id).toBe('executive');
  });
});

// =============================================================================
// canPartiallyAnswer TESTS
// =============================================================================

describe('Graceful Degrade - canPartiallyAnswer', () => {
  it('returns canAnswer true when some requested modules are enabled', () => {
    const result = canPartiallyAnswer(['finance', 'revenue'], testAccess, testRegistry);

    expect(result.canAnswer).toBe(true);
  });

  it('returns canAnswer false when no requested modules are enabled', () => {
    const result = canPartiallyAnswer(['revenue', 'cs'], testAccess, testRegistry);

    expect(result.canAnswer).toBe(false);
  });

  it('lists available and missing context correctly', () => {
    const result = canPartiallyAnswer(
      ['finance', 'revenue', 'cs'],
      testAccess,
      testRegistry,
    );

    expect(result.canAnswer).toBe(true);

    // Finance is enabled, so it should be in availableContext
    expect(result.availableContext).toHaveLength(1);
    expect(result.availableContext[0]).toContain('Finance');
    expect(result.availableContext[0]).toContain('Invoice tracking');
    expect(result.availableContext[0]).toContain('Cash flow');

    // Revenue and CS are disabled, so they should be in missingContext
    expect(result.missingContext).toHaveLength(2);
    expect(result.missingContext[0]).toContain('Revenue');
    expect(result.missingContext[0]).toContain('Pipeline management');
    expect(result.missingContext[0]).toContain('Deal tracking');
    expect(result.missingContext[1]).toContain('Customer Success');
    expect(result.missingContext[1]).toContain('Health scoring');
    expect(result.missingContext[1]).toContain('Churn prevention');
  });
});
