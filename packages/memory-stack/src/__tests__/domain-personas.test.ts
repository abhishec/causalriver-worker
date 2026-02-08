/**
 * Nexus Memory Stack - Domain Personas Tests
 *
 * Tests for the domain personas framework including persona prompt building,
 * domain context building, and the persona registry factory.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPersonaPrompt,
  buildDomainContext,
  createPersonaRegistry,
  exampleDomains,
} from '../intelligence/domain-personas';
import type { DomainPersona, DomainContext } from '../intelligence/domain-personas';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const financePersona: DomainPersona = {
  name: 'Finance Agent',
  role: 'CFO Advisory',
  expertise: ['AR Management', 'Cash Flow', 'Collections'],
  responseStyle: 'Direct, data-driven, action-oriented',
  priorityMetrics: ['DSO', 'AR Aging', 'Cash Position'],
  ownedDomains: ['finance'],
  escalationPath: ['Finance Lead', 'CFO', 'CEO'],
  customInstructions: 'Always reference dollar amounts and percentages.',
};

const minimalPersona: DomainPersona = {
  name: 'Simple Agent',
  role: 'General Assistant',
  expertise: [],
  responseStyle: 'Friendly and concise',
  priorityMetrics: [],
  ownedDomains: [],
};

const financeDomain: DomainContext = {
  key: 'finance',
  displayName: 'Finance',
  description: 'Manages financial health, cash flow, and accounting operations.',
  responsibilities: ['AR/AP', 'Cash Management', 'Financial Reporting'],
  kpis: ['DSO', 'Cash Position', 'AR Aging'],
  relatedDomains: ['revenue', 'operations'],
};

const csDomain: DomainContext = {
  key: 'cs',
  displayName: 'Customer Success',
  description: 'Ensures customer satisfaction and retention.',
  responsibilities: ['Onboarding', 'Health Monitoring', 'Renewals'],
  kpis: ['NPS', 'Churn Rate', 'Health Score'],
  relatedDomains: ['revenue', 'product'],
};

// ============================================================================
// buildPersonaPrompt TESTS
// ============================================================================

describe('Domain Personas', () => {
  describe('buildPersonaPrompt', () => {
    it('should build a full prompt with all persona fields', () => {
      const prompt = buildPersonaPrompt(financePersona);

      // Identity section
      expect(prompt).toContain('You are Finance Agent, serving as CFO Advisory.');

      // Expertise section
      expect(prompt).toContain('## Expertise');
      expect(prompt).toContain('AR Management, Cash Flow, Collections');

      // Response style section
      expect(prompt).toContain('## Response Style');
      expect(prompt).toContain('Direct, data-driven, action-oriented');

      // Priority metrics section
      expect(prompt).toContain('## Priority Metrics');
      expect(prompt).toContain('- DSO');
      expect(prompt).toContain('- AR Aging');
      expect(prompt).toContain('- Cash Position');

      // Domain ownership section
      expect(prompt).toContain('## Domain Ownership');
      expect(prompt).toContain('You own these domains: finance.');

      // Escalation path section
      expect(prompt).toContain('## Escalation Path');
      expect(prompt).toContain('Finance Lead \u2192 CFO \u2192 CEO');

      // Custom instructions section
      expect(prompt).toContain('## Additional Instructions');
      expect(prompt).toContain('Always reference dollar amounts and percentages.');
    });

    it('should omit expertise section when expertise array is empty', () => {
      const prompt = buildPersonaPrompt(minimalPersona);

      expect(prompt).toContain('You are Simple Agent, serving as General Assistant.');
      expect(prompt).not.toContain('## Expertise');
    });

    it('should omit escalation path and custom instructions when not provided', () => {
      const prompt = buildPersonaPrompt(minimalPersona);

      expect(prompt).not.toContain('## Escalation Path');
      expect(prompt).not.toContain('## Additional Instructions');
    });
  });

  // ============================================================================
  // buildDomainContext TESTS
  // ============================================================================

  describe('buildDomainContext', () => {
    it('should build context from a list of domain contexts', () => {
      const context = buildDomainContext([financeDomain, csDomain]);

      // Header
      expect(context).toContain('## Domain Context');

      // Finance domain
      expect(context).toContain('### Finance (finance)');
      expect(context).toContain('Manages financial health, cash flow, and accounting operations.');
      expect(context).toContain('Responsibilities: AR/AP, Cash Management, Financial Reporting');
      expect(context).toContain('KPIs: DSO, Cash Position, AR Aging');
      expect(context).toContain('Related to: revenue, operations');

      // CS domain
      expect(context).toContain('### Customer Success (cs)');
      expect(context).toContain('Ensures customer satisfaction and retention.');
      expect(context).toContain('Responsibilities: Onboarding, Health Monitoring, Renewals');
      expect(context).toContain('KPIs: NPS, Churn Rate, Health Score');
      expect(context).toContain('Related to: revenue, product');
    });

    it('should return only header when given an empty domain list', () => {
      const context = buildDomainContext([]);

      expect(context).toContain('## Domain Context');
      // Should only have the header, nothing else meaningful
      expect(context.trim()).toBe('## Domain Context');
    });
  });

  // ============================================================================
  // createPersonaRegistry TESTS
  // ============================================================================

  describe('createPersonaRegistry', () => {
    it('should register and retrieve personas', () => {
      const registry = createPersonaRegistry();

      registry.register('finance', financePersona);

      expect(registry.has('finance')).toBe(true);
      expect(registry.get('finance')).toEqual(financePersona);
    });

    it('should return undefined for unregistered persona keys', () => {
      const registry = createPersonaRegistry();

      expect(registry.has('nonexistent')).toBe(false);
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should track all registered persona keys', () => {
      const registry = createPersonaRegistry();

      registry.register('finance', financePersona);
      registry.register('minimal', minimalPersona);

      const keys = registry.getKeys();
      expect(keys).toContain('finance');
      expect(keys).toContain('minimal');
      expect(keys).toHaveLength(2);
    });

    it('should register and retrieve domain contexts', () => {
      const registry = createPersonaRegistry();

      registry.registerDomain(financeDomain);
      registry.registerDomain(csDomain);

      expect(registry.getDomain('finance')).toEqual(financeDomain);
      expect(registry.getDomain('cs')).toEqual(csDomain);
      expect(registry.getDomain('unknown')).toBeUndefined();

      const domainKeys = registry.getDomainKeys();
      expect(domainKeys).toContain('finance');
      expect(domainKeys).toContain('cs');
      expect(domainKeys).toHaveLength(2);
    });

    it('should build a prompt for a registered persona via getPrompt', () => {
      const registry = createPersonaRegistry();
      registry.register('finance', financePersona);

      const prompt = registry.getPrompt('finance');

      expect(prompt).toBeDefined();
      expect(prompt).toContain('You are Finance Agent, serving as CFO Advisory.');
      expect(prompt).toContain('## Expertise');
    });

    it('should return undefined from getPrompt for a missing persona key', () => {
      const registry = createPersonaRegistry();

      expect(registry.getPrompt('missing')).toBeUndefined();
    });

    it('should build prompt with domain context via getPromptWithContext', () => {
      const registry = createPersonaRegistry();
      registry.register('finance', financePersona);
      registry.registerDomain(financeDomain);
      registry.registerDomain(csDomain);

      const prompt = registry.getPromptWithContext('finance', ['finance', 'cs']);

      expect(prompt).toBeDefined();
      // Should contain persona prompt parts
      expect(prompt).toContain('You are Finance Agent, serving as CFO Advisory.');
      // Should contain domain context parts
      expect(prompt).toContain('## Domain Context');
      expect(prompt).toContain('### Finance (finance)');
      expect(prompt).toContain('### Customer Success (cs)');
    });

    it('should return plain prompt when no domain keys are provided to getPromptWithContext', () => {
      const registry = createPersonaRegistry();
      registry.register('finance', financePersona);

      const promptNoDomains = registry.getPromptWithContext('finance');
      const promptPlain = registry.getPrompt('finance');

      expect(promptNoDomains).toBe(promptPlain);
    });

    it('should return undefined from getPromptWithContext for a missing persona', () => {
      const registry = createPersonaRegistry();

      expect(registry.getPromptWithContext('missing', ['finance'])).toBeUndefined();
    });

    it('should skip unknown domain keys in getPromptWithContext gracefully', () => {
      const registry = createPersonaRegistry();
      registry.register('finance', financePersona);
      registry.registerDomain(financeDomain);

      // Mix of valid and invalid domain keys; only valid ones appear in context
      const prompt = registry.getPromptWithContext('finance', ['finance', 'nonexistent']);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('### Finance (finance)');
      expect(prompt).not.toContain('nonexistent');
    });
  });

  // ============================================================================
  // exampleDomains TESTS
  // ============================================================================

  describe('exampleDomains', () => {
    it('should export pre-defined domain contexts for all business domains', () => {
      expect(exampleDomains).toHaveLength(9);

      const keys = exampleDomains.map((d) => d.key);
      expect(keys).toEqual([
        'finance',
        'customer_success',
        'revenue',
        'product',
        'engineering',
        'operations',
        'marketing',
        'hr',
        'knowledge',
      ]);
    });

    it('should have valid structure for each example domain', () => {
      for (const domain of exampleDomains) {
        expect(domain.key).toBeTruthy();
        expect(domain.displayName).toBeTruthy();
        expect(domain.description).toBeTruthy();
        expect(domain.responsibilities.length).toBeGreaterThan(0);
        expect(domain.kpis.length).toBeGreaterThan(0);
        expect(domain.relatedDomains.length).toBeGreaterThan(0);
      }
    });
  });
});
