/**
 * Nexus Memory Stack - React Hooks
 *
 * React Query-based hooks for accessing the memory stack.
 * All hooks are organization-scoped for multi-tenant isolation.
 */

// Core memory hooks
export * from './use-ai-memory';
export * from './use-semantic-search';

// RAG context hook (memory-weighted retrieval)
export * from './use-rag-context';

// Cascade detection hook (cross-domain monitoring)
export * from './use-cascade-detection';

// Pattern reinforcement hook (confidence adjustment based on outcomes)
export * from './use-pattern-reinforcement';
