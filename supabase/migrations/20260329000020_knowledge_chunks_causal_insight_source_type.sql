-- Add 'causal_insight' as a valid source_type for knowledge_chunks.
-- This allows the causal discovery engine to write findings into Tier 1
-- knowledge storage for semantic retrieval alongside git commits, code
-- files, and conversation turns.
--
-- The existing CHECK constraint is dropped and replaced with an expanded
-- version that includes the new value. All existing rows remain valid.

ALTER TABLE knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_source_type_check;

ALTER TABLE knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_source_type_check
  CHECK (source_type IN (
    'git_commit',
    'conversation_turn',
    'code_file',
    'ticket',
    'pr_description',
    'slack_message',
    'causal_insight'
  ));
