/**
 * Agent Registry — Central catalog of all training agent types.
 * 
 * Register agent factories here so the AgentManager can instantiate them
 * by name. Each registration includes metadata (description, version,
 * resource requirements, schedule) for ECS task management.
 */

import { BaseTrainingAgent, type AgentConfig, type AgentRunResult } from './base-training-agent';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentRegistration {
  /** Unique agent name (e.g., 'git-code-trainer') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Semantic version */
  version: string;
  /** Factory function that creates an instance of the agent */
  factory: (config: AgentConfig) => BaseTrainingAgent;
  /** Optional cron schedule (e.g., '0 2 * * 0' for Sunday 2 AM) */
  schedule?: string;
  /** Resource requirements for ECS task definition */
  resourceRequirements?: {
    cpu: string;    // e.g., '2048' (2 vCPU)
    memory: string; // e.g., '8192' (8 GB)
  };
  /** Tags for categorization */
  tags?: string[];
}

// ============================================================================
// REGISTRY
// ============================================================================

export class AgentRegistry {
  private agents = new Map<string, AgentRegistration>();

  /**
   * Register a new agent type.
   * @throws if an agent with the same name is already registered
   */
  register(registration: AgentRegistration): void {
    if (this.agents.has(registration.name)) {
      throw new Error(
        `Agent "${registration.name}" is already registered. ` +
        `Use update() to modify an existing registration.`
      );
    }
    this.agents.set(registration.name, registration);
  }

  /**
   * Update an existing agent registration (or register if new).
   */
  update(registration: AgentRegistration): void {
    this.agents.set(registration.name, registration);
  }

  /**
   * Unregister an agent by name.
   */
  unregister(name: string): boolean {
    return this.agents.delete(name);
  }

  /**
   * Get a registration by name.
   */
  get(name: string): AgentRegistration | undefined {
    return this.agents.get(name);
  }

  /**
   * Check if an agent is registered.
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * List all registered agents.
   */
  list(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  /**
   * List agents matching a tag filter.
   */
  listByTag(tag: string): AgentRegistration[] {
    return this.list().filter(r => r.tags?.includes(tag));
  }

  /**
   * Create an agent instance by name.
   * @throws if the agent is not registered
   */
  createAgent(name: string, config: AgentConfig): BaseTrainingAgent {
    const registration = this.agents.get(name);
    if (!registration) {
      const available = this.list().map(r => r.name).join(', ');
      throw new Error(
        `Agent "${name}" is not registered. Available agents: ${available || 'none'}`
      );
    }
    return registration.factory(config);
  }

  /**
   * Print a summary of all registered agents.
   */
  printSummary(): void {
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│           NexusBrain Agent Registry             │');
    console.log('├─────────────────────────────────────────────────┤');
    for (const reg of this.list()) {
      const schedule = reg.schedule ? ` [${reg.schedule}]` : '';
      const resources = reg.resourceRequirements
        ? ` (${reg.resourceRequirements.cpu} CPU, ${reg.resourceRequirements.memory} MB)`
        : '';
      console.log(`│ ${reg.name} v${reg.version}${schedule}${resources}`);
      console.log(`│   ${reg.description}`);
    }
    if (this.agents.size === 0) {
      console.log('│ (no agents registered)');
    }
    console.log('└─────────────────────────────────────────────────┘\n');
  }
}

/**
 * Singleton global registry for convenience.
 * Import and use directly: `globalRegistry.register(...)`.
 */
export const globalRegistry = new AgentRegistry();
