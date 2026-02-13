/**
 * NexusBrain Agent Framework
 * 
 * Reusable agent template system for building training agents.
 * 
 * @example
 * ```typescript
 * import { BaseTrainingAgent, AgentRegistry, AgentManager } from './agent-framework';
 * 
 * // 1. Create an agent
 * class MyAgent extends BaseTrainingAgent { ... }
 * 
 * // 2. Register it
 * const registry = new AgentRegistry();
 * registry.register({
 *   name: 'my-agent',
 *   description: 'My custom agent',
 *   version: '1.0.0',
 *   factory: (config) => new MyAgent(config),
 * });
 * 
 * // 3. Run it
 * const manager = new AgentManager(registry, { supabaseUrl, supabaseKey });
 * const result = await manager.runAgent('my-agent');
 * ```
 */

export {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
  type ConsolidationResult,
  type StageResult,
  type AgentRunResult,
} from './base-training-agent';

export {
  AgentRegistry,
  globalRegistry,
  type AgentRegistration,
} from './agent-registry';

export {
  AgentManager,
} from './agent-manager';
