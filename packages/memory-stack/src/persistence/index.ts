/**
 * NexusBrain Persistence Layer
 *
 * Centralized Supabase repository for all database operations.
 *
 * Usage:
 *   import { createSupabaseRepository } from '@nexus-ai/memory-stack/persistence';
 *   const repo = createSupabaseRepository(supabase, 'org_123');
 */

export {
  createSupabaseRepository,
  type NexusRepository,
  type EmbeddingUpsertParams,
  type MemoryUpsertParams,
  type RelationshipUpsertParams,
  type ActivityLogEntry,
  type ConversationEntry,
} from './supabase-repository';
