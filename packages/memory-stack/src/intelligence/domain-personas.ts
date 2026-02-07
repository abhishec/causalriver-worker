/**
 * Nexus Memory Stack - Domain Personas Framework
 *
 * Framework for creating domain-specific AI personas.
 * Each persona encodes domain expertise for specialized reasoning.
 *
 * This is the FRAMEWORK - specific personas are implemented by the application.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Domain persona configuration
 */
export interface DomainPersona {
  /** Persona name (e.g., "Finance Agent") */
  name: string;
  /** Role title (e.g., "CFO Advisory") */
  role: string;
  /** Areas of expertise */
  expertise: string[];
  /** How the persona should respond */
  responseStyle: string;
  /** Key metrics this persona cares about */
  priorityMetrics: string[];
  /** Domains this persona owns */
  ownedDomains: string[];
  /** Escalation path for issues */
  escalationPath?: string[];
  /** Custom instructions */
  customInstructions?: string;
}

/**
 * Domain context for AI reasoning
 */
export interface DomainContext {
  /** Domain key (e.g., "finance", "cs", "revenue") */
  key: string;
  /** Display name */
  displayName: string;
  /** Description of the domain */
  description: string;
  /** Key responsibilities */
  responsibilities: string[];
  /** Typical KPIs */
  kpis: string[];
  /** Related domains */
  relatedDomains: string[];
}

// ============================================================================
// PERSONA BUILDER
// ============================================================================

/**
 * Build a Claude system prompt from a domain persona
 *
 * @example
 * ```typescript
 * const financePersona: DomainPersona = {
 *   name: 'Finance Agent',
 *   role: 'CFO Advisory',
 *   expertise: ['AR Management', 'Cash Flow', 'Collections'],
 *   responseStyle: 'Direct, data-driven, action-oriented',
 *   priorityMetrics: ['DSO', 'AR Aging', 'Cash Position'],
 *   ownedDomains: ['finance'],
 * };
 *
 * const systemPrompt = buildPersonaPrompt(financePersona);
 * ```
 */
export function buildPersonaPrompt(persona: DomainPersona): string {
  const sections: string[] = [];

  // Identity
  sections.push(`You are ${persona.name}, serving as ${persona.role}.`);

  // Expertise
  if (persona.expertise.length > 0) {
    sections.push(`\n## Expertise\nYou specialize in: ${persona.expertise.join(', ')}.`);
  }

  // Response style
  sections.push(`\n## Response Style\n${persona.responseStyle}`);

  // Priority metrics
  if (persona.priorityMetrics.length > 0) {
    sections.push(
      `\n## Priority Metrics\nYou focus on these key metrics:\n${persona.priorityMetrics.map((m) => `- ${m}`).join('\n')}`
    );
  }

  // Owned domains
  if (persona.ownedDomains.length > 0) {
    sections.push(
      `\n## Domain Ownership\nYou own these domains: ${persona.ownedDomains.join(', ')}.`
    );
  }

  // Escalation path
  if (persona.escalationPath && persona.escalationPath.length > 0) {
    sections.push(
      `\n## Escalation Path\nWhen issues need escalation: ${persona.escalationPath.join(' → ')}`
    );
  }

  // Custom instructions
  if (persona.customInstructions) {
    sections.push(`\n## Additional Instructions\n${persona.customInstructions}`);
  }

  return sections.join('\n');
}

/**
 * Build domain context section for AI prompts
 */
export function buildDomainContext(domains: DomainContext[]): string {
  const sections: string[] = ['## Domain Context\n'];

  for (const domain of domains) {
    sections.push(`### ${domain.displayName} (${domain.key})`);
    sections.push(domain.description);
    sections.push(`\nResponsibilities: ${domain.responsibilities.join(', ')}`);
    sections.push(`KPIs: ${domain.kpis.join(', ')}`);
    sections.push(`Related to: ${domain.relatedDomains.join(', ')}\n`);
  }

  return sections.join('\n');
}

// ============================================================================
// PERSONA FACTORY
// ============================================================================

/**
 * Create a persona registry for managing multiple domain personas
 *
 * @example
 * ```typescript
 * const registry = createPersonaRegistry();
 *
 * registry.register('finance', {
 *   name: 'Finance Agent',
 *   role: 'CFO Advisory',
 *   expertise: ['AR', 'Cash Flow'],
 *   // ...
 * });
 *
 * const prompt = registry.getPrompt('finance');
 * ```
 */
export function createPersonaRegistry() {
  const personas = new Map<string, DomainPersona>();
  const domains = new Map<string, DomainContext>();

  return {
    /**
     * Register a domain persona
     */
    register: (key: string, persona: DomainPersona): void => {
      personas.set(key, persona);
    },

    /**
     * Register a domain context
     */
    registerDomain: (domain: DomainContext): void => {
      domains.set(domain.key, domain);
    },

    /**
     * Get a persona by key
     */
    get: (key: string): DomainPersona | undefined => {
      return personas.get(key);
    },

    /**
     * Get a domain context by key
     */
    getDomain: (key: string): DomainContext | undefined => {
      return domains.get(key);
    },

    /**
     * Build prompt for a specific persona
     */
    getPrompt: (key: string): string | undefined => {
      const persona = personas.get(key);
      if (!persona) return undefined;
      return buildPersonaPrompt(persona);
    },

    /**
     * Build prompt with domain context
     */
    getPromptWithContext: (
      personaKey: string,
      domainKeys?: string[]
    ): string | undefined => {
      const persona = personas.get(personaKey);
      if (!persona) return undefined;

      const prompt = buildPersonaPrompt(persona);

      if (domainKeys && domainKeys.length > 0) {
        const relevantDomains = domainKeys
          .map((k) => domains.get(k))
          .filter((d): d is DomainContext => d !== undefined);

        if (relevantDomains.length > 0) {
          return prompt + '\n\n' + buildDomainContext(relevantDomains);
        }
      }

      return prompt;
    },

    /**
     * Get all registered persona keys
     */
    getKeys: (): string[] => {
      return Array.from(personas.keys());
    },

    /**
     * Get all registered domain keys
     */
    getDomainKeys: (): string[] => {
      return Array.from(domains.keys());
    },

    /**
     * Check if a persona exists
     */
    has: (key: string): boolean => {
      return personas.has(key);
    },
  };
}

// ============================================================================
// EXAMPLE DOMAINS (Generic, not Nexus OS specific)
// ============================================================================

/**
 * Example domain contexts that can be used as templates
 */
export const exampleDomains: DomainContext[] = [
  {
    key: 'finance',
    displayName: 'Finance',
    description: 'Manages financial health, cash flow, and accounting operations.',
    responsibilities: ['AR/AP', 'Cash Management', 'Financial Reporting', 'Budgeting'],
    kpis: ['DSO', 'Cash Position', 'AR Aging', 'Gross Margin'],
    relatedDomains: ['revenue', 'operations'],
  },
  {
    key: 'customer_success',
    displayName: 'Customer Success',
    description: 'Ensures customer satisfaction, retention, and expansion.',
    responsibilities: ['Onboarding', 'Health Monitoring', 'Renewals', 'Upsells'],
    kpis: ['NPS', 'Churn Rate', 'Health Score', 'Renewal Rate'],
    relatedDomains: ['revenue', 'product', 'services'],
  },
  {
    key: 'revenue',
    displayName: 'Revenue',
    description: 'Drives new business and manages sales pipeline.',
    responsibilities: ['Lead Generation', 'Pipeline Management', 'Deal Closing', 'Forecasting'],
    kpis: ['Pipeline Value', 'Win Rate', 'Average Deal Size', 'Sales Cycle'],
    relatedDomains: ['marketing', 'customer_success', 'finance'],
  },
  {
    key: 'product',
    displayName: 'Product',
    description: 'Builds and maintains the product roadmap and features.',
    responsibilities: ['Roadmap', 'Feature Development', 'Bug Fixes', 'User Research'],
    kpis: ['Feature Adoption', 'Bug Count', 'Release Velocity', 'User Satisfaction'],
    relatedDomains: ['engineering', 'customer_success', 'marketing'],
  },
  {
    key: 'operations',
    displayName: 'Operations',
    description: 'Manages day-to-day business operations and efficiency.',
    responsibilities: ['Process Optimization', 'Resource Allocation', 'Vendor Management'],
    kpis: ['Operational Efficiency', 'Cost per Transaction', 'SLA Compliance'],
    relatedDomains: ['finance', 'hr', 'engineering'],
  },
];
