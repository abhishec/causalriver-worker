/**
 * Nexus Domain Agents - Prompt Builder Tests
 *
 * Comprehensive tests for the prompt builder utilities including:
 * - buildPersonaSystemPrompt: persona-aware system prompts (with/without template)
 * - buildContextBlock: multi-line context strings with org, date, modules, intent
 * - buildCompletePrompt: combined system + user prompt generation
 * - buildFollowUpPrompt: follow-up prompt with truncated previous response
 * - buildDisabledModulePrompt: disabled module scenario messaging
 * - getSampleQuestions: persona sample question retrieval
 * - getSuggestedFollowUps: follow-up suggestions based on persona + modules
 */

import { describe, it, expect } from 'vitest';
import {
  buildPersonaSystemPrompt,
  buildContextBlock,
  buildCompletePrompt,
  buildFollowUpPrompt,
  buildDisabledModulePrompt,
  getSampleQuestions,
  getSuggestedFollowUps,
} from '../personas/prompt-builder';
import type { PromptContext } from '../personas/prompt-builder';
import type {
  PersonaDefinition,
  ModuleDefinition,
  IntentClassification,
} from '../types';

// ============================================================================
// TEST DATA
// ============================================================================

const testPersona: PersonaDefinition = {
  id: 'test-cfo',
  role: 'CFO',
  domain: 'finance',
  description: 'Test CFO',
  icon: '\u{1F4B0}',
  color: '#000',
  promptTemplate: 'You are the CFO...',
  focusMetrics: ['Cash runway', 'DSO'],
  sampleQuestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'],
};

const testPersonaNoTemplate: PersonaDefinition = {
  id: 'test-vp',
  role: 'VP',
  domain: 'finance',
  description: 'Test VP of Finance',
  icon: '\u{1F4CA}',
  color: '#fff',
  focusMetrics: ['Budget'],
};

const testModule: ModuleDefinition = {
  id: 'finance',
  name: 'Finance',
  description: 'Financial stuff',
  icon: '\u{1F4B0}',
  keywords: ['invoice'],
  capabilities: ['Invoice tracking', 'Cash flow', 'Budget analysis'],
  tables: ['invoices'],
  personas: ['CFO'],
};

const testModuleRevenue: ModuleDefinition = {
  id: 'revenue',
  name: 'Revenue',
  description: 'Revenue tracking',
  icon: '\u{1F4C8}',
  keywords: ['deal', 'pipeline'],
  capabilities: ['Deal tracking', 'Pipeline management', 'Forecasting', 'Quota analysis'],
  tables: ['deals'],
  personas: ['VP Sales'],
};

const testModuleCS: ModuleDefinition = {
  id: 'cs',
  name: 'Customer Success',
  description: 'Customer success management',
  icon: '\u{1F91D}',
  keywords: ['health', 'churn'],
  capabilities: ['Health scoring', 'Churn prediction'],
  tables: ['customers'],
  personas: ['VP CS'],
};

const testModuleAM: ModuleDefinition = {
  id: 'am',
  name: 'Account Management',
  description: 'Account management',
  icon: '\u{1F465}',
  keywords: ['renewal', 'expansion'],
  capabilities: ['Renewal tracking', 'Expansion pipeline'],
  tables: ['accounts'],
  personas: ['AM Lead'],
};

const testIntent: IntentClassification = {
  modules: ['finance', 'revenue'],
  primaryModule: 'finance',
  confidence: 0.85,
  matchedKeywords: ['invoice', 'cash'],
  isCrossDomain: true,
  method: 'keyword',
};

const fixedDate = new Date('2025-06-15T12:00:00Z');

// ============================================================================
// buildPersonaSystemPrompt TESTS
// ============================================================================

describe('Prompt Builder - buildPersonaSystemPrompt', () => {
  it('includes the persona promptTemplate when provided', () => {
    const result = buildPersonaSystemPrompt(testPersona);
    expect(result).toContain('You are the CFO...');
  });

  it('appends a "Remember:" block with role and focusMetrics', () => {
    const result = buildPersonaSystemPrompt(testPersona);
    expect(result).toContain('Remember:');
    expect(result).toContain('You are speaking as CFO');
    expect(result).toContain('Cash runway');
    expect(result).toContain('DSO');
  });

  it('generates a default template when promptTemplate is not provided', () => {
    const result = buildPersonaSystemPrompt(testPersonaNoTemplate);

    // Should not contain the custom template
    expect(result).not.toContain('You are the CFO...');

    // Should contain the default generated template with role and description
    expect(result).toContain('You are VP for this organization');
    expect(result).toContain('Test VP of Finance');

    // Should list focusMetrics in the default template's key focus areas
    expect(result).toContain('- Budget');

    // Should still have the "Remember:" block
    expect(result).toContain('Remember:');
    expect(result).toContain('You are speaking as VP');
    expect(result).toContain('Budget');
  });
});

// ============================================================================
// buildContextBlock TESTS
// ============================================================================

describe('Prompt Builder - buildContextBlock', () => {
  it('includes organization name when provided', () => {
    const context: PromptContext = {
      query: 'Show me invoices',
      persona: testPersona,
      modules: [],
      organizationName: 'Acme Corp',
    };

    const result = buildContextBlock(context);
    expect(result).toContain('Organization: Acme Corp');
  });

  it('includes formatted date from currentDate', () => {
    const context: PromptContext = {
      query: 'Show me invoices',
      persona: testPersona,
      modules: [],
      currentDate: fixedDate,
    };

    const result = buildContextBlock(context);
    // Date formatted with en-US locale: "Sunday, June 15, 2025"
    expect(result).toContain('Current Date:');
    expect(result).toContain('June');
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  it('includes module names and capabilities sliced to 3', () => {
    const moduleWithManyCaps: ModuleDefinition = {
      ...testModuleRevenue,
      capabilities: ['Deal tracking', 'Pipeline management', 'Forecasting', 'Quota analysis'],
    };

    const context: PromptContext = {
      query: 'Show me deals',
      persona: testPersona,
      modules: [moduleWithManyCaps],
      currentDate: fixedDate,
    };

    const result = buildContextBlock(context);

    // Module name in "Relevant Domains"
    expect(result).toContain('Revenue');

    // First 3 capabilities included
    expect(result).toContain('Deal tracking');
    expect(result).toContain('Pipeline management');
    expect(result).toContain('Forecasting');

    // 4th capability NOT included (sliced to 3)
    expect(result).not.toContain('Quota analysis');
  });

  it('includes intent classification details', () => {
    const context: PromptContext = {
      query: 'Show me invoices and deals',
      persona: testPersona,
      modules: [testModule],
      intent: testIntent,
      currentDate: fixedDate,
    };

    const result = buildContextBlock(context);
    expect(result).toContain('Query Classification:');
    expect(result).toContain('Primary Domain: finance');
    expect(result).toContain('Confidence: 85%');
    expect(result).toContain('Cross-Domain: Yes');
    expect(result).toContain('finance, revenue');
  });

  it('includes additionalContext wrapped in markers', () => {
    const context: PromptContext = {
      query: 'Show me invoices',
      persona: testPersona,
      modules: [],
      additionalContext: 'RAG results: invoice #1234 is overdue',
      currentDate: fixedDate,
    };

    const result = buildContextBlock(context);
    expect(result).toContain('--- Relevant Information ---');
    expect(result).toContain('RAG results: invoice #1234 is overdue');
    expect(result).toContain('--- End Relevant Information ---');
  });
});

// ============================================================================
// buildCompletePrompt TESTS
// ============================================================================

describe('Prompt Builder - buildCompletePrompt', () => {
  it('returns an object with systemPrompt and userPrompt containing the query', () => {
    const context: PromptContext = {
      query: 'What is our cash runway?',
      persona: testPersona,
      modules: [testModule],
      currentDate: fixedDate,
    };

    const result = buildCompletePrompt(context);

    // Should return both parts
    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');

    // systemPrompt should come from buildPersonaSystemPrompt
    expect(result.systemPrompt).toContain('You are the CFO...');
    expect(result.systemPrompt).toContain('Remember:');

    // userPrompt should contain the query
    expect(result.userPrompt).toContain('User Query: What is our cash runway?');

    // userPrompt should also contain context block data
    expect(result.userPrompt).toContain('Finance');
  });
});

// ============================================================================
// buildFollowUpPrompt TESTS
// ============================================================================

describe('Prompt Builder - buildFollowUpPrompt', () => {
  it('truncates previousResponse at 500 characters and appends ellipsis', () => {
    const longResponse = 'A'.repeat(600);
    const context: PromptContext = {
      query: 'Original query',
      persona: testPersona,
      modules: [testModule],
      currentDate: fixedDate,
    };

    const result = buildFollowUpPrompt(context, 'Tell me more', longResponse);

    // The previous response in userPrompt should be truncated to 500 + "..."
    expect(result.userPrompt).toContain('A'.repeat(500) + '...');
    expect(result.userPrompt).not.toContain('A'.repeat(501));
  });

  it('does not append ellipsis when previousResponse is 500 chars or fewer', () => {
    const shortResponse = 'B'.repeat(500);
    const context: PromptContext = {
      query: 'Original query',
      persona: testPersona,
      modules: [testModule],
      currentDate: fixedDate,
    };

    const result = buildFollowUpPrompt(context, 'Tell me more', shortResponse);

    expect(result.userPrompt).toContain('B'.repeat(500));
    // Should NOT have the trailing "..."
    expect(result.userPrompt).not.toContain('B'.repeat(500) + '...');
  });

  it('includes the follow-up query in the userPrompt', () => {
    const context: PromptContext = {
      query: 'Original query',
      persona: testPersona,
      modules: [testModule],
      currentDate: fixedDate,
    };

    const result = buildFollowUpPrompt(context, 'Drill into Q2 numbers', 'Some response');

    expect(result.userPrompt).toContain('Follow-up query: Drill into Q2 numbers');
    expect(result.systemPrompt).toContain('You are the CFO...');
  });
});

// ============================================================================
// buildDisabledModulePrompt TESTS
// ============================================================================

describe('Prompt Builder - buildDisabledModulePrompt', () => {
  it('includes requested and available module names', () => {
    const result = buildDisabledModulePrompt(
      'Show me deals',
      [testModuleRevenue],
      [testModule],
      testPersona,
    );

    // Requested module name
    expect(result).toContain('Revenue');

    // Available module name
    expect(result).toContain('Finance');

    // Should mention the query
    expect(result).toContain('Show me deals');
  });

  it('includes the persona role', () => {
    const result = buildDisabledModulePrompt(
      'Show me deals',
      [testModuleRevenue],
      [testModule],
      testPersona,
    );

    expect(result).toContain('As CFO');
  });

  it('shows "None" when no available modules exist', () => {
    const result = buildDisabledModulePrompt(
      'Show me deals',
      [testModuleRevenue],
      [],
      testPersona,
    );

    expect(result).toContain('only these modules are enabled: None');
  });
});

// ============================================================================
// getSampleQuestions TESTS
// ============================================================================

describe('Prompt Builder - getSampleQuestions', () => {
  it('returns up to the specified count of questions', () => {
    // Default count is 4
    const result = getSampleQuestions(testPersona);
    expect(result).toHaveLength(4);
    expect(result).toEqual(['Q1?', 'Q2?', 'Q3?', 'Q4?']);
  });

  it('respects a custom count argument', () => {
    const result = getSampleQuestions(testPersona, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual(['Q1?', 'Q2?']);
  });

  it('returns empty array for persona without sampleQuestions', () => {
    const result = getSampleQuestions(testPersonaNoTemplate);
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// getSuggestedFollowUps TESTS
// ============================================================================

describe('Prompt Builder - getSuggestedFollowUps', () => {
  it('returns persona-specific suggestions filtered by original query', () => {
    // originalQuery "something unrelated" should not filter out any sample questions
    const result = getSuggestedFollowUps(testPersona, [], 'something unrelated');

    // Should include up to 2 persona sample questions
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(4);

    // At least some persona sampleQuestions should appear
    const personaSamples = testPersona.sampleQuestions!;
    const hasPersonaSample = result.some((r) => personaSamples.includes(r));
    expect(hasPersonaSample).toBe(true);
  });

  it('adds module-based suggestions for finance, revenue, cs, and am modules', () => {
    const result = getSuggestedFollowUps(
      testPersonaNoTemplate, // no sampleQuestions, so only module-based
      [testModule, testModuleRevenue, testModuleCS, testModuleAM],
      'overview',
    );

    // Should include module-specific suggestions
    expect(result).toContain('What is the current AR aging breakdown?');
    expect(result).toContain('Show me deals at risk this quarter');
    expect(result).toContain('Which customers have declining health scores?');
    expect(result).toContain('What renewals need attention?');
  });

  it('deduplicates and limits results to 4', () => {
    // Persona with 5 sample questions + 4 module-based = could be 9 total
    const result = getSuggestedFollowUps(
      testPersona,
      [testModule, testModuleRevenue, testModuleCS, testModuleAM],
      'xyz',
    );

    // Should be capped at 4
    expect(result.length).toBeLessThanOrEqual(4);

    // Should have no duplicates
    const unique = [...new Set(result)];
    expect(unique).toHaveLength(result.length);
  });
});
